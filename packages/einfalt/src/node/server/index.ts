import path from 'path'
import net, { AddressInfo } from 'net'
import http from 'http'
import { existsSync, unlinkSync } from 'fs'
import connect, { Server } from 'connect'
import chokidar, { FSWatcher } from 'chokidar'
import chalk from 'chalk'
import { InlineConfig, resolveConfig, ResolvedConfig } from '../config'
import { normalizePath, resolveHostname } from '../utils'
import { printServerUrls } from '../logger'
import { doBuild } from '../build'
import { resolveHttpServer } from './http'
import { timeMiddleware } from './middlewares/time'
import { servePublicMiddleware } from './middlewares/static'
import { handleHMRUpdate, updateModules } from './hmr'

export interface EinfaltDevServer {
  /**
   * The resolved vite config object
   */
  config: ResolvedConfig
  /**
   * A connect app instance.
   * - Can be used to attach custom middlewares to the dev server.
   * - Can also be used as the handler function of a custom http server
   *   or as a middleware in any connect-style Node.js frameworks
   *
   * https://github.com/senchalabs/connect#use-middleware
   */
  middlewares: Server
  /**
   * native Node http server instance
   * will be null in middleware mode
   */
  httpServer: http.Server | null
  /**
   * chokidar watcher instance
   * https://github.com/paulmillr/chokidar#api
   */
  watcher: FSWatcher
  /**
   * Start the server.
   */
  listen(port?: number, isRestart?: boolean): Promise<EinfaltDevServer>
  /**
   * Stop the server.
   */
  close(): Promise<void>
  /**
   * @internal
   */
  _pendingReload: Promise<void> | null
}

export interface ServerOptions {
  host?: string | boolean
  port?: number
  /**
   * If enabled, vite will exit if specified port is already in use
   */
  strictPort?: boolean
}

export async function createServer(inlineConfig: InlineConfig) {
  const config = await resolveConfig(inlineConfig, 'serve', 'development')
  const { root, server: serverConfig } = config

  const middlewares = connect() as Server

  const httpServer = await resolveHttpServer(middlewares)

  const watcher = chokidar.watch(path.resolve(root), {
    ignored: ['**/node_modules/**', '**/.git/**', '**/.idea/**', `**/${config.build.outDir}/**`],
    ignoreInitial: true,
    ignorePermissionErrors: true,
    disableGlobbing: true
  })

  const closeHttpServer = createServerCloseFn(httpServer)
  let exitProcess: () => void

  const server: EinfaltDevServer = {
    config,
    middlewares,
    httpServer,
    watcher,
    listen(port?: number) {
      return startServer(server, port)
    },
    async close() {
      process.off('SIGTERM', exitProcess)

      if (!process.stdin.isTTY) {
        process.stdin.off('end', exitProcess)
      }

      await Promise.all([
        watcher.close(),
        closeHttpServer()
      ])
    },
    _pendingReload: null
  }

  exitProcess = async() => {
    try {
      await server.close()
    } finally {
      process.exit(0)
    }
  }

  process.once('SIGTERM', exitProcess)

  if (!process.stdin.isTTY) {
    process.stdin.on('end', exitProcess)
  }

  // 初始化build阶段时忽略文件变更
  let ignoreChange = true
  watcher.on('change', async(file) => {
    if (ignoreChange) {
      return
    }
    file = normalizePath(file)
    try {
      await handleHMRUpdate(file, server)
    } catch (err) {

    }
  })

  watcher.on('add', (file) => {
    updateModules(normalizePath(file), config)
  })

  watcher.on('unlink', (file) => {
    if (file.includes('src')) {
      const filePath = normalizePath(file).replace('src', config.build.outDir)
      if (existsSync(filePath)) {
        unlinkSync(filePath)
      }
    }
  })

  // Internal middlewares ------------------------------------------------------

  // request timer
  if (process.env.DEBUG) {
    middlewares.use(timeMiddleware(root))
  }

  // serve static files under /public
  // this applies before the transform middleware so that these files are served
  // as-is without transforms.
  if (config.publicDir) {
    middlewares.use(servePublicMiddleware(config.publicDir))
  }

  const listen = httpServer.listen.bind(httpServer)
  httpServer.listen = (async(port: number, ...args: any[]) => {
    try {
      await doBuild(inlineConfig)
      ignoreChange = false
    } catch (e) {
      httpServer.emit('error', e)
      return
    }
    return listen(port, ...args)
  }) as any

  httpServer.once('listening', () => {
    // update actual port since this may be different from initial value
    serverConfig.port = (httpServer.address() as AddressInfo).port
  })

  return server
}

async function startServer(
  server: EinfaltDevServer,
  inlinePort?: number
): Promise<EinfaltDevServer> {
  const { httpServer } = server
  if (!httpServer) {
    throw new Error('Cannot call server.listen in middleware mode.')
  }

  const options = server.config.server
  let port = inlinePort || options.port || 3000
  const hostname = resolveHostname(options.host)

  const protocol = 'http'
  const { info } = server.config.logger

  return new Promise((resolve, reject) => {
    const onError = (e: Error & { code?: string }) => {
      if (e.code === 'EADDRINUSE') {
        if (options.strictPort) {
          httpServer.removeListener('error', onError)
          reject(new Error(`Port ${port} is already in use`))
        } else {
          info(`Port ${port} is in use, trying another one...`)
          httpServer.listen(++port, hostname.host)
        }
      } else {
        httpServer.removeListener('error', onError)
        reject(e)
      }
    }

    httpServer.on('error', onError)

    httpServer.listen(port, hostname.host, () => {
      httpServer.removeListener('error', onError)

      info(
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        chalk.cyan(`\n  einfalt v${require('einfalt/package.json').version}`)
        + chalk.green(' dev server running at:\n'),
        {
          clear: !server.config.logger.hasWarned
        }
      )

      printServerUrls(hostname, protocol, port, info)

      // @ts-ignore
      if (global.__einfalt_start_time) {
        info(
          chalk.cyan(
            // @ts-ignore
            `\n  ready in ${Date.now() - global.__einfalt_start_time}ms.\n`
          )
        )
      }

      resolve(server)
    })
  })
}

function createServerCloseFn(server: http.Server | null) {
  if (!server) {
    return () => {}
  }

  let hasListened = false
  const openSockets = new Set<net.Socket>()

  server.on('connection', (socket) => {
    openSockets.add(socket)
    socket.on('close', () => {
      openSockets.delete(socket)
    })
  })

  server.once('listening', () => {
    hasListened = true
  })

  return () =>
    new Promise<void>((resolve, reject) => {
      openSockets.forEach(s => s.destroy())
      if (hasListened) {
        server.close((err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      } else {
        resolve()
      }
    })
}
