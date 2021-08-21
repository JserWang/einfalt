import { Transform, TransformCallback } from 'stream'
import fs from 'fs'
import Vinyl from 'vinyl'
import PluginError from 'plugin-error'
import { parse } from '../wxml'

export interface SpacingOptions {
  path: string
}

const spacingMap = new Map<string, string>()

const SPACING_PREFIX = [
  'm', // margin
  'mt', // margin-top
  'mb', // margin-bottom
  'ml', // margin-left
  'mr', // margin-right
  'mv', // margin-top margin-bottom
  'mh', // margin-left margin-right
  'p', // padding
  'pt', // padding-top
  'pb', // padding-bottom
  'pl', // padding-left
  'pr', // padding-right
  'pv', // padding-top padding-bottom
  'ph', // padding-left padding-right
  'h', // height
  'w' // width
]

function formatString(str = '') {
  return str.replaceAll('\'', '')
    .replaceAll('\"', '')
    .replaceAll('\{', '')
    .replaceAll('\}', '')
}

function getSpacingClass(tagName: string, className: string): string[] {
  const result: string[] = []
  if (!tagName.includes('class')) {
    return result
  }

  className.split(' ').forEach((item) => {
    const formatted = formatString(`${item.split('_')[0]}`)
    if (SPACING_PREFIX.includes(formatted)) {
      result.push(formatString(item))
    }
  })
  return result
}

function resolveClass(elements: any) {
  let result: string[] = []
  Object.keys(elements).forEach((tagName) => {
    const element = elements[tagName]
    if (Array.isArray(element)) {
      element.forEach((child) => {
        result = result.concat(resolveClass(child))
      })
    } else if (typeof element === 'object') {
      result = result.concat(resolveClass(element))
    } else if (typeof element === 'string') {
      result = result.concat(getSpacingClass(tagName, element))
    }
  })

  return Array.from(new Set(result))
}

function transformClass(className: string): string {
  const [prefix, value, value2] = className.split('_')
  let props = ''
  switch (prefix) {
    case 'm':
      props = `margin: ${value}px ${value2 ? `${value2}px` : ''};`
      break
    case 'mt':
      props = `margin-top: ${value}px;`
      break
    case 'mb':
      props = `margin-bottom: ${value}px;`
      break
    case 'ml':
      props = `margin-left: ${value}px;`
      break
    case 'mr':
      props = `margin-right: ${value}px;`
      break
    case 'mv':
      props = `margin-top: ${value}px; margin-bottom: ${value}px;`
      break
    case 'mh':
      props = `margin-left: ${value}px; margin-right: ${value}px;`
      break
    case 'p':
      props = `padding: ${value}px ${value2 ? `${value2}px` : ''};`
      break
    case 'pt':
      props = `padding-top: ${value}px;`
      break
    case 'pb':
      props = `padding-bottom: ${value}px;`
      break
    case 'pl':
      props = `padding-left: ${value}px;`
      break
    case 'pr':
      props = `padding-right: ${value}px;`
      break
    case 'pv':
      props = `padding-top: ${value}px; padding-bottom: ${value}px;`
      break
    case 'ph':
      props = `padding-left: ${value}px; padding-right: ${value}px;`
      break
    case 'h':
      props = `height: ${value}px;`
      break
    case 'w':
      props = `width: ${value}px;`
      break
  }

  return `.${className} {
  ${props}
}

`
}

export default function(options?: SpacingOptions): Transform {
  return new Transform({
    objectMode: true,
    transform(chunk: Vinyl, encoding: BufferEncoding, callback: TransformCallback) {
      if (chunk.isNull()) {
        return callback(null, chunk)
      }

      if (chunk.isStream()) {
        this.emit('error', new PluginError('einfalt:spacing', 'Stream not support'))
        return callback(null, chunk)
      }

      // 当不存在options
      if (!options?.path) {
        return callback(null, chunk)
      }

      const parsedFile = parse(String(chunk.contents))

      resolveClass(parsedFile).forEach((className) => {
        if (!spacingMap.has(className)) {
          spacingMap.set(className, '')
          if (!fs.existsSync(options.path)) {
            fs.writeFileSync(options.path, transformClass(className))
          } else {
            fs.appendFileSync(options.path, transformClass(className))
          }
        }
      })

      callback(null, chunk)
    }
  })
}
