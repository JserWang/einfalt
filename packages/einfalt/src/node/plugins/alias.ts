import { Transform, TransformCallback } from 'stream'
import { platform } from 'os'
import path from 'path'
import Vinyl from 'vinyl'
import PluginError from 'plugin-error'
import { EmptyTransform } from '../utils'

export interface Alias {
  find: string | RegExp
  replacement: string
}

export type AliasOptions = readonly Alias[] | { [find: string]: string }

function matches(pattern: string | RegExp, content: string): boolean {
  if (pattern instanceof RegExp) {
    return pattern.test(content)
  }

  if (content.length < pattern.length) {
    return false
  }

  if (content === pattern) {
    return true
  }

  const contentStartsWithKey = content.indexOf(pattern) === 0
  const contentHasSlashAfterKey = content.substring(pattern.length)[0] === '/'
  return contentStartsWithKey && contentHasSlashAfterKey
}

function getEntries(entries: AliasOptions): readonly Alias[] {
  if (!entries) {
    return []
  }

  if (Array.isArray(entries)) {
    return entries
  }

  return Object.entries(entries).map(([key, value]) => {
    return { find: key, replacement: value }
  })
}

export default function(options?: AliasOptions): Transform {
  if (!options) {
    return EmptyTransform()
  }

  const entries = getEntries(options)
  if (entries.length === 0) {
    return EmptyTransform()
  }

  return new Transform({
    objectMode: true,
    transform(chunk: Vinyl, encoding: BufferEncoding, callback: TransformCallback) {
      if (chunk.isNull()) {
        return callback(null, chunk)
      }

      if (chunk.isStream()) {
        this.emit('error', new PluginError('einfalt:alias', 'Stream not support'))
        return callback(null, chunk)
      }

      let code = String(chunk.contents)

      const matchedEntry = entries.find(entry => matches(entry.find, code))

      if (!matchedEntry || !code) {
        return callback(null, chunk)
      }

      const platformPath = platform() === 'win32' ? path.win32 : path.posix
      let relativePath = platformPath.relative(chunk.dirname, platformPath.resolve(process.cwd(), matchedEntry.replacement))
      // replace '\' to '/' for windows
      relativePath = relativePath.replace(/\\/g, '/')
      relativePath = relativePath.endsWith('..') ? `${relativePath}/` : relativePath

      if (matchedEntry.replacement.endsWith('/')) {
        relativePath = relativePath.endsWith('/') ? relativePath : `${relativePath}/`
      }

      relativePath = relativePath === '' ? './' : relativePath

      code = code.replace(new RegExp(matchedEntry.find, 'g'), relativePath)

      chunk.contents = Buffer.from(code)

      callback(null, chunk)
    }
  })
}
