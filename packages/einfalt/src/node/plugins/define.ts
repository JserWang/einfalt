import { Transform, TransformCallback } from 'stream'
// @ts-ignore
import Vinyl from 'vinyl'
// @ts-ignore
import PluginError from 'plugin-error'
import MagicString from 'magic-string'
import { ResolvedConfig } from '../config'

export default function(config: ResolvedConfig): Transform {
  const userDefine: Record<string, string> = {}
  // eslint-disable-next-line no-restricted-syntax
  for (const key in config.define) {
    const val = config.define[key]
    userDefine[key] = typeof val === 'string' ? val : JSON.stringify(val)
  }

  const processEnv: Record<string, string> = {}
  const { env } = config
  // eslint-disable-next-line no-restricted-syntax
  for (const key in env) {
    processEnv[`process.env.${key}`] = JSON.stringify(env[key])
  }

  const replacements: Record<string, string | undefined> = {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || config.mode),
    ...userDefine,
    ...processEnv
  }

  const pattern = new RegExp(
    `(?<!\\.)\\b(${
      Object.keys(replacements)
        .map((str) => {
          return str.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&')
        })
        .join('|')
    })\\b`,
    'g'
  )

  return new Transform({
    objectMode: true,
    transform(chunk: Vinyl, encoding: BufferEncoding, callback: TransformCallback) {
      if (chunk.isNull()) {
        return callback(null, chunk)
      }

      if (chunk.isStream()) {
        this.emit('error', new PluginError('einfalt:define', 'Stream not support'))
        return callback(null, chunk)
      }

      const code = String(chunk.contents)
      const s = new MagicString(code)
      let hasReplaced = false
      let match

      // eslint-disable-next-line no-cond-assign
      while ((match = pattern.exec(code))) {
        hasReplaced = true
        const start = match.index
        const end = start + match[0].length
        const replacement = `${replacements[match[1]]}`
        s.overwrite(start, end, replacement)
      }

      if (!hasReplaced) {
        return callback(null, chunk)
      }

      chunk.contents = Buffer.from(s.toString())

      callback(null, chunk)
    }
  })
}
