import path from 'path'
import { readFileSync } from 'fs'
import chalk from 'chalk'
import { TaskFunction } from 'gulp'
import { tsTask } from '../tasks/typescript'
import { ResolvedConfig } from '../config'
import { createDebugger, pathToGlob } from '../utils'
import { execute } from '../tasks'
import { lessTask } from '../tasks/less'
import { wxmlDistTask, wxmlTask } from '../tasks/wxml'
import { jsonDistTask, jsonTask } from '../tasks/json'
import { wxsTask } from '../tasks/wxs'
import { NPM_SOURCE } from '../constants'
import { npmTask } from '../tasks/npm'
import { imageTask } from '../tasks/image'
import { routerTask } from '../tasks/router'
import { hasRouteBlock } from '../wxml'
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

function source2Dist(file: string, config: ResolvedConfig) {
  return file.replace('src', config.build.outDir)
}

function renameExtname(file: string, extname: string) {
  return file.replace(path.extname(file), extname)
}

function getModuleProcessor(config: ResolvedConfig, file: string): Record<string, () => TaskFunction[]> {
  return {
    '.ts': () => {
      if (config.router && file.includes(config.router)) {
        return [routerTask(config)]
      }

      return [tsTask(config, pathToGlob(file))]
    },
    '.less': () => [lessTask(config, pathToGlob(file))],
    '.wxml': () => {
      const tasks: TaskFunction[] = []
      const code = String(readFileSync(file))
      if (config.router && hasRouteBlock(code)) {
        tasks.push(routerTask(config))
      }
      tasks.push(
        wxmlTask(config, pathToGlob(file)),
        wxmlDistTask(config, source2Dist(file, config)),
        jsonDistTask(
          config,
          pathToGlob(
            renameExtname(source2Dist(file, config), '.json')
          )
        )
      )

      return tasks
    },
    '.wxs': () => [wxsTask(config, pathToGlob(file))],
    '.json': () => {
      return [
        jsonTask(config, pathToGlob(file)),
        jsonDistTask(config, source2Dist(file, config))
      ]
    }
  }
}

export async function updateModules(file: string, config: ResolvedConfig) {
  const extname = path.extname(file)
  if (file.includes(NPM_SOURCE)) {
    await execute([npmTask(config)])
  } else if (file.includes('src')) {
    const processor = getModuleProcessor(config, file)
    if (processor[extname]) {
      return await execute(processor[extname]())
    }
    await execute([imageTask(config)])
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
