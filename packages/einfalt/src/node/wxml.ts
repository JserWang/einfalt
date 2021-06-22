import { readFileSync } from 'fs'
import { parse as parseXml } from 'fast-xml-parser'
import yaml from 'yaml'
import { ATTR_KEY } from './constants'
import { md5 } from './utils'

const routeBlockRE = /<route(.*)>((.*)(\n))*<\/route>/g

const parsedMap = new Map<string, any>()
export function parse(code: string) {
  // 利用代码md5后的值缓存结果
  const cryptoCode = md5(code)
  if (parsedMap.has(cryptoCode)) {
    return parsedMap.get(cryptoCode)
  }

  const parsedFile = parseXml(String(code), {
    attrNodeName: ATTR_KEY,
    attributeNamePrefix: '',
    ignoreAttributes: false
  })

  parsedMap.set(cryptoCode, parsedFile)
  return parsedFile
}

export function resolveRouteBlock(path: string) {
  const code = readFileSync(path, 'utf8')
  const parsedCode = parse(code)
  const tags = Object.keys(parsedCode)
  for (let i = 0; i < tags.length; i += 1) {
    const tag = tags[i]
    const text = parsedCode[tag]['#text']
    if (tag === 'route' && text) {
      return yaml.parse(text) || {}
    }
  }
  return {}
}

/**
 * 移除路由代码块
 * @param code
 */
export function clearRouteBlock(code: string): string {
  return code.replace(routeBlockRE, '')
}

export function hasRouteBlock(code: string): boolean {
  return !!code.match(routeBlockRE)
}
