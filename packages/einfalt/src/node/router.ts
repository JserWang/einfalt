import { join, resolve } from 'path'
import glob from 'fast-glob'
import { StringUtils } from 'turbocommons-ts'
import { createFileSync, readJsonSync, writeJsonSync } from 'fs-extra'
import { RouteRecord } from '@einfalt/router'
import { parsePath } from './utils'
import { ResolvedConfig } from './config'
import { ResolvedRouteRecord } from './plugins/router'

export interface RouteMeta extends Record<string | number | symbol, unknown> {}

interface ListItem {
  name: string
  pathName: string
  query: string
  scene: null
}

export interface ResolvedAppJson {
  pages: string[]
  subpackages?: {
    independent?: boolean
    root?: string
    pages: string[]
  }[]
}

const SUBPACKAGE_PREFIX = 'package'
const MAIN_PKG = 'mainPackage'
const PAGE_BASE_PATH_NAME = 'pages'
const SubpackagePattern = /package[a-z|A-Z]*/

const getSubpackageDirName = (path: string) => path.match(SubpackagePattern)?.[0]
const getSubpackageName = (dirName: string) => dirName.replace(SUBPACKAGE_PREFIX, '').toLowerCase()

function resolveMainPackage(paths: string[], isRootPath?: boolean) {
  return paths.map((path) => {
    const { dirname, basename } = parsePath(path)
    const replacedPath = dirname.replace(`${PAGE_BASE_PATH_NAME}/`, '')

    return {
      name: StringUtils.formatCase(replacedPath, StringUtils.FORMAT_CAMEL_CASE),
      path: `${isRootPath ? '/' : ''}${replacedPath}`,
      page: `${dirname}/${basename}`
    }
  })
}

function resolveSubpackage(subpackageDirName: string, paths: string[]) {
  return {
    path: `/${getSubpackageName(subpackageDirName)}`,
    root: subpackageDirName,
    children: [
      ...resolveMainPackage(paths)
    ]
  }
}

/**
 * 根据传入路由解析出app.json中的pages与subpackages字段值
 */
export function resolveAppJson(routes: RouteRecord[], config: ResolvedConfig): ResolvedAppJson {
  const result: ResolvedAppJson = { pages: [], subpackages: [] }

  routes.forEach((route) => {
    if (Reflect.has(route, 'root')) {
      const { subpackages } = result
      subpackages!.push({
        root: route.root!,
        independent: route.independent,
        pages: route.children!.map((item: RouteRecord) => item.page!)
      })
      result.subpackages = subpackages
    } else {
      const { pages } = result
      pages.push(route.page!)
      result.pages = pages
    }
  })

  // config.home配置页面默认在app.json的pages中第一位
  if (config.home) {
    const { pages } = result
    const homeIndex = pages.indexOf(config.home)
    homeIndex > 0 && pages.unshift(pages[homeIndex])
    result.pages = Array.from(new Set([...pages]))
  }

  return result
}

function stringifyQuery(query?: string[]) {
  return query ? `&${query.join('&')}` : ''
}

function getParamsLength(query?: string) {
  return query ? query.split('&').length : 0
}

function transformRoute(route: ResolvedRouteRecord): ListItem {
  return {
    name: route.name!,
    pathName: 'pages/transfer/index',
    query: `scene=${route.name}${stringifyQuery(route.params)}`,
    scene: null
  }
}

/**
 * 根据传入pages修改project.private.config.json
 * @param config
 * @param routes
 */
export function writePrivateConfig(config: ResolvedConfig, routes: ResolvedRouteRecord[]) {
  const privateJsonPath = resolve(config.root, 'project.private.config.json')
  const json = readJsonSync(privateJsonPath) || {}
  if (Object.keys(json).length === 0) {
    createFileSync(privateJsonPath)
  }

  const originList: ListItem[] = json.condition.miniprogram.list

  function getOriginItem(name: string) {
    return originList.find(item => item.name === name)
  }

  const result: ListItem[] = []
  routes.forEach((route) => {
    if (route.root && route.children) {
      route.children.forEach((child) => {
        const originItem = getOriginItem(child.name!)
        if (!originItem || getParamsLength(originItem.query) !== (child.params?.length || 0) + 1) {
          const transformed = transformRoute(child)
          result.push(transformed)
        } else {
          result.push(originItem)
        }
      })
    } else {
      const originItem = getOriginItem(route.name!)
      // 这里 + 1 是因为transform后会默认拼上scene参数
      if (!originItem || getParamsLength(originItem.query) !== (route.params?.length || 0) + 1) {
        const transformed = transformRoute(route)
        result.push(transformed)
      } else {
        result.push(originItem)
      }
    }
  })

  json.condition.miniprogram.list = result

  writeJsonSync(privateJsonPath, json, { spaces: 2 })
}

export function getFileSystemRoutes(config: ResolvedConfig): RouteRecord[] {
  let routes: RouteRecord[] = []
  const pathMap: { [packageName: string]: string[] } = {}
  // TODO: 根据不同平台取不同平台的文件路径
  glob
    .sync(['**/index.wxml', '!components'], {
      cwd: join(config.root, 'src')
    })
    .forEach((file) => {
      const { dirname } = parsePath(file)
      const packageName = getSubpackageDirName(dirname) || MAIN_PKG

      if (!pathMap[packageName]) {
        pathMap[packageName] = []
      }
      pathMap[packageName].push(file.replace(`${packageName}/`, ''))
    })

  const packages = Object.keys(pathMap)
  for (let i = 0; i < packages.length; i += 1) {
    const key = packages[i]
    if (key === MAIN_PKG) {
      routes = [
        ...routes,
        ...resolveMainPackage(pathMap[key], true)
      ]
    } else {
      routes = [...routes, resolveSubpackage(key, pathMap[key])]
    }
  }

  return routes
}
