import { Transform, TransformCallback } from 'stream'
import { join } from 'path'
// @ts-ignore
import { existsSync } from 'fs'
import Vinyl from 'vinyl'
// @ts-ignore
import PluginError from 'plugin-error'
import { readJsonSync, writeJsonSync } from 'fs-extra'
import { EmptyTransform, parsePath } from '../utils'
import { parse } from '../template'
import { ATTR_KEY } from '../constants'

export interface ComponentResolver {
  [prefix: string]: (componentName: string) => string
}

export interface ComponentsOptions {
  /**
   * 用于区分需要在JSON中替换的字段名
   * 留作其他小程序JSON字段名不为，"usingComponents"时使用
   */
  targetKey: string | 'usingComponents'
  customComponentResolvers?: ComponentResolver | ComponentResolver[]
}

// 抽象节点前缀
const GENERIC_PREFIX = 'generic:'

/**
 * 获取抽象节点
 * @param node
 */
function getGenericNode(node: Record<string, any>) {
  return Object.keys(node).filter(key => key.startsWith(GENERIC_PREFIX)).map(key => node[key])
}

/**
 * 获取模板中所有标签名
 * @param elements
 */
function resolveTags(elements: any) {
  let result: string[] = []
  Object.keys(elements).filter(tagName => !tagName.startsWith(ATTR_KEY)).forEach((tagName) => {
    const element = elements[tagName]

    if (Array.isArray(element)) {
      element.forEach((child) => {
        // parser will merge the same node, such as:
        // <view generic:selectable="custom-1"></view>
        // <view generic:selectable="custom-2"></view>
        // will output :
        // { 'view': [ { '@attrs': { "generic:selectable": "custom-1" } }, { '@attrs': { "generic:selectable": "custom-2" } } ] }
        if (Object.keys(child).length === 1 && child[ATTR_KEY]) {
          result = result.concat(getGenericNode(child[ATTR_KEY]))
        } else {
          result = result.concat(resolveTags(child))
        }
      })
    } else if (typeof element === 'object') {
      result = result.concat(resolveTags(element))
    }

    if (element[ATTR_KEY]) {
      // generic
      result = result.concat(getGenericNode(element[ATTR_KEY]))
    }

    result.push(tagName)
  })

  return Array.from(new Set(result))
}

function getComponentResolvers(componentsOptions: ComponentsOptions): ComponentResolver[] {
  const componentResolvers = componentsOptions.customComponentResolvers

  if (!componentResolvers) {
    return []
  }

  if (Array.isArray(componentResolvers)) {
    return componentResolvers
  }

  return Object.entries(componentResolvers).map(([prefix, transformer]) => {
    return { [prefix]: transformer }
  })
}

function matches(resolver: ComponentResolver, tag: string): boolean {
  const [prefix] = Object.keys(resolver)

  if (tag.length < prefix.length) {
    return false
  }

  if (tag === prefix) {
    return true
  }

  return tag.startsWith(prefix)
}

export default function(options?: ComponentsOptions): Transform {
  if (!options) {
    return EmptyTransform()
  }
  const componentResolvers = getComponentResolvers(options)

  if (componentResolvers.length === 0) {
    return EmptyTransform()
  }

  return new Transform({
    objectMode: true,
    transform(chunk: Vinyl, encoding: BufferEncoding, callback: TransformCallback) {
      if (chunk.isNull()) {
        return callback(null, chunk)
      }

      if (chunk.isStream()) {
        this.emit('error', new PluginError('einfalt:components', 'Stream not support'))
        return callback(null, chunk)
      }

      const parsedFile = parse(String(chunk.contents))
      const tags = resolveTags(parsedFile)

      const result: {[tag: string]: string} = {}
      for (let i = 0; i < tags.length; i += 1) {
        const tag = tags[i]
        const matchedResolver = componentResolvers.find(resolver => matches(resolver, tag))
        if (!matchedResolver) {
          continue
        }

        const [prefix] = Object.keys(matchedResolver)
        result[tag] = matchedResolver[prefix].call(null, tag.replace(prefix, ''))
      }

      // 当页面中存在components，写入解析文件所在目录的json中
      if (Object.keys(result).length > 0) {
        const { dirname, basename } = parsePath(chunk.relative)
        const jsonFile = join(chunk.base, dirname, `${basename}.json`)
        if (existsSync(jsonFile)) {
          const json = readJsonSync(jsonFile)
          json[options.targetKey] = result
          writeJsonSync(jsonFile, json, { spaces: 2 })
        }
      }

      callback(null, chunk)
    }
  })
}
