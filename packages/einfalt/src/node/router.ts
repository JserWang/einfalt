import { join, resolve } from 'path'
import glob from 'fast-glob'
import { StringUtils } from 'turbocommons-ts'
import { existsSync, createFileSync, readJsonSync, writeJsonSync } from 'fs-extra'
import { RouteRecord } from '@einfalt/router'
import { parsePath } from './utils'
import { ResolvedConfig } from './config'
import { ResolvedRouteRecord } from './plugins/router'

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

export interface ProjectPrivateConfigJson {
  condition: {
    miniprogram: {
      list: ListItem[]
    }
  }
}

export interface CompileModeJson {
  modes: {
    title?: string
    page?: string
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
  if (config.paths?.home) {
    const { pages } = result
    const homeIndex = pages.indexOf(config.paths.home)
    homeIndex > 0 && pages.unshift(pages[homeIndex])
    result.pages = Array.from(new Set([...pages]))
  }

  return result
}

function stringifyQuery(query?: string | string[]) {
  if (Array.isArray(query)) {
    return `&${query.join('&')}`
  } else if (query) {
    return `&${query}`
  }
  return ''
}

function getParamsLength(query?: string) {
  return query ? query.split('&').filter(item => !!item).length : 0
}

function transformRoute(route: ResolvedRouteRecord): ListItem {
  return {
    name: route.name!,
    pathName: 'pages/transfer/index',
    query: `scene=${route.name}${stringifyQuery(route.params)}`,
    scene: null
  }
}

function initProjectPrivateConfig(): ProjectPrivateConfigJson {
  return {
    condition: {
      miniprogram: {
        list: []
      }
    }
  }
}

function initCompileModeJson(): CompileModeJson {
  return {
    modes: []
  }
}

/**
 * 根据传入pages生成或修改project.private.config.json
 * 微信小程序
 * @param config
 * @param routes
 */
export function writePrivateConfig(config: ResolvedConfig, routes: ResolvedRouteRecord[]) {
  const privateJsonPath = resolve(config.root, 'project.private.config.json')
  let json: ProjectPrivateConfigJson = initProjectPrivateConfig()

  if (!existsSync(privateJsonPath)) {
    createFileSync(privateJsonPath)
  } else {
    json = readJsonSync(privateJsonPath)
    if (!json.condition) {
      json = {
        ...initProjectPrivateConfig()
      }
    }
  }

  const originList: ListItem[] = json.condition.miniprogram.list

  function getOriginItem(name: string) {
    return originList.find(item => item.name === name)
  }

  const result: ListItem[] = []
  routes.forEach((route) => {
    // 处理分包
    if (route.root && route.children) {
      route.children.forEach((child) => {
        let routeItem = getOriginItem(child.name!)
        if (!routeItem || getParamsLength(routeItem.query) !== (child.params?.length || 0) + 1) {
          routeItem = transformRoute(child)
        }
        result.push(routeItem)
      })
    } else {
      let routeItem = getOriginItem(route.name!)
      // 这里 + 1 是因为transform后会默认拼上scene参数
      if (!routeItem || getParamsLength(routeItem.query) !== (route.params?.length || 0) + 1) {
        routeItem = transformRoute(route)
      }
      result.push(routeItem)
    }
  })

  json.condition.miniprogram.list = result

  writeJsonSync(privateJsonPath, json, { spaces: 2 })
}

/**
 * 根据传入pages生成或修改compileMode
 * 支付宝小程序
 * @param config
 * @param routes
 */
export function writeCompileMode(config: ResolvedConfig, routes: ResolvedRouteRecord[]) {
  const compileModeJsonPath = resolve(config.root, '.mini-ide', 'compileMode.json')
  let json: CompileModeJson = initCompileModeJson()

  if (!existsSync(compileModeJsonPath)) {
    createFileSync(compileModeJsonPath)
  } else {
    json = readJsonSync(compileModeJsonPath)
  }

  json.modes = routes.map((route) => {
    return {
      title: route.meta?.title as string ?? route.name,
      page: route.page
    }
  })

  writeJsonSync(compileModeJsonPath, json, { spaces: 2 })
}

export function getFileSystemRoutes(config: ResolvedConfig): RouteRecord[] {
  let routes: RouteRecord[] = []
  const pathMap: { [packageName: string]: string[] } = {}

  const extname = config.platform === 'alipay' ? 'axml' : 'wxml'
  glob
    .sync([`**/index.${extname}`, '!components', '!**/components/**', '!custom-tab-bar'], {
      cwd: join(config.root, config.entry)
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
