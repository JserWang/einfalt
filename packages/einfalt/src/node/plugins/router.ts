import { Transform, TransformCallback } from 'stream'
import path from 'path'
import Vinyl from 'vinyl'
import PluginError from 'plugin-error'
import { readJsonSync, writeJsonSync } from 'fs-extra'
import { RouteRecord } from '@einfalt/router'
import { ROUTE_MODULE } from '../constants'
import { getFileSystemRoutes, resolveAppJson, writePrivateConfig } from '../router'
import { ResolvedConfig } from '../config'
import { resolveRouteBlock } from '../wxml'

const routeRE = /import routes from 'virtual:generated-pages'/

export interface ResolvedRouteRecord extends RouteRecord {
  params?: string[]
  children?: ResolvedRouteRecord[]
}

function resolveRoute(config: ResolvedConfig, routes: RouteRecord[]): ResolvedRouteRecord[] {
  return routes.map((route) => {
    if (route.root && route.children) {
      route.children = route.children.map((child) => {
        const { meta, params } = resolveRouteBlock(path.resolve(config.root, config.entry, `${route.root}/${child.page}.wxml`))
        return {
          ...child,
          meta,
          params
        }
      })
    }
    if (route.page) {
      const { meta, params } = resolveRouteBlock(path.resolve(config.root, config.entry, `${route.page}.wxml`))
      return {
        ...route,
        meta,
        params
      }
    }
    return route
  })
}

export default function(config: ResolvedConfig): Transform {
  return new Transform({
    objectMode: true,
    transform(chunk: Vinyl, encoding: BufferEncoding, callback: TransformCallback) {
      if (chunk.isNull()) {
        return callback(null, chunk)
      }

      if (chunk.isStream()) {
        this.emit('error', new PluginError('einfalt:router', 'Stream not support'))
        return callback(null, chunk)
      }

      let code = String(chunk.contents)
      if (!code || !code.includes(ROUTE_MODULE)) {
        return callback(null, chunk)
      }

      let routes = getFileSystemRoutes(config)
      if (routes.length > 0) {
        // 从wxml中解析meta
        routes = resolveRoute(config, routes)

        // 将routes写入app.json
        const appJsonFilePath = path.resolve(config.root, config.entry, 'app.json')
        let appJson = readJsonSync(appJsonFilePath)
        const resolvedAppJson = resolveAppJson(routes, config)
        appJson = { ...appJson, ...resolvedAppJson }
        writeJsonSync(appJsonFilePath, appJson, { spaces: 2 })

        // 写入private.config.json
        writePrivateConfig(config, routes)

        // 替换为实际routes
        code = code.replace(routeRE, `const routes = ${JSON.stringify(routes)}`)
      }

      chunk.contents = Buffer.from(code)

      callback(null, chunk)
    }
  })
}
