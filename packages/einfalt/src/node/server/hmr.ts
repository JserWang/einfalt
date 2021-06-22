import path from 'path'
import chalk from 'chalk'
import { tsTask } from '../tasks/typescript'
import { ResolvedConfig } from '../config'
import { createDebugger, emptyTask } from '../utils'
import { execute } from '../tasks'
import { lessTask } from '../tasks/less'
import { wxmlDistTask, wxmlTask } from '../tasks/wxml'
import { jsonDistTask, jsonTask } from '../tasks/json'
import { wxsTask } from '../tasks/wxs'
import { NPM_SOURCE } from '../constants'
import { npmTask } from '../tasks/npm'
import { imageTask } from '../tasks/image'
import { routerTask } from '../tasks/router'
import { createServer, EinfaltDevServer } from './index'

export const debugHmr = createDebugger('einfalt:hmr')

function getShortName(file: string, root: string) {
  return file.startsWith(`${root}/`) ? path.posix.relative(root, file) : file
}

export async function handleHMRUpdate(
  file: string,
  server: EinfaltDevServer
): Promise<any> {
  const { config } = server
  const shortFile = getShortName(file, config.root)

  const isConfig = file === config.configFile
  const isEnv = config.inlineConfig.envFile !== false && file.endsWith('.env')
  if (isConfig || isEnv) {
    // auto restart server
    debugHmr(`[config change] ${chalk.dim(shortFile)}`)
    config.logger.info(
      chalk.green(
        `${path.relative(process.cwd(), file)} changed, restarting server...`
      ),
      { clear: true, timestamp: true }
    )
    await restartServer(server)
    return
  }

  debugHmr(`[file change] ${chalk.dim(shortFile)}`)

  // eslint-disable-next-line no-console
  await updateModules(file, server.config)
}

function pathToGlob(file: string) {
  return `${path.dirname(file)}/*${path.extname(file)}`
}

export async function updateModules(file: string, config: ResolvedConfig) {
  const extname = path.extname(file)
  if (file.includes(NPM_SOURCE)) {
    await execute([npmTask(config)])
  } else if (file.includes('src')) {
    switch (extname) {
      case '.ts':
        await execute([
          routerTask(config),
          tsTask(config, pathToGlob(file))
        ])
        break
      case '.less':
        await execute([
          lessTask(config, pathToGlob(file))
        ])
        break
      case '.wxml':
        await execute([
          config.router ? routerTask(config) : emptyTask,
          wxmlTask(config, pathToGlob(file)),
          wxmlDistTask(config, file.replace('src', config.build.outDir)),
          jsonDistTask(config, pathToGlob(file.replace('src', config.build.outDir)))
        ])
        break
      case '.wxs':
        await execute([
          wxsTask(config, pathToGlob(file))
        ])
        break
      case '.json':
        await execute([
          jsonTask(config, pathToGlob(file)),
          jsonDistTask(config, file.replace('src', config.build.outDir))
        ])
        break
      default:
        await execute([
          imageTask(config)
        ])
        break
    }
  }
}

export async function restartServer(server: EinfaltDevServer) {
  // @ts-ignore
  global.__einfalt_start_time = Date.now()
  let newServer = null
  try {
    newServer = await createServer(server.config.inlineConfig)
  } catch (err) {
    return
  }

  await server.close()
  // eslint-disable-next-line no-restricted-syntax
  for (const key in newServer) {
    // @ts-ignore
    server[key] = newServer[key]
  }

  await server.listen(undefined, true)
}
