import { Transform, TransformCallback } from 'stream'
import Vinyl from 'vinyl'
import PluginError from 'plugin-error'
import { ResolvedConfig } from '../config'
import { isMatched } from '../utils'

export interface Additional {
  [file: string]: {
    content: string
    includes?: RegExp | RegExp[]
    excludes?: RegExp | RegExp[]
  }
}

export interface AdditionalOption {
  prepend?: Additional
  append?: Additional
}

function resolvePrependAdditional(config: ResolvedConfig, extname: string) {
  if (config.resolve?.additional!.prepend?.[extname]) {
    return config.resolve?.additional!.prepend[extname].content
  }
  return ''
}

function resolveAppendAdditional(config: ResolvedConfig, extname: string) {
  if (config.resolve?.additional!.append?.[extname]) {
    return config.resolve?.additional!.append[extname].content
  }
  return ''
}

export default function(config: ResolvedConfig): Transform {
  return new Transform({
    objectMode: true,
    transform(chunk: Vinyl, encoding: BufferEncoding, callback: TransformCallback) {
      if (chunk.isNull()) {
        return callback(null, chunk)
      }

      if (chunk.isStream()) {
        this.emit('error', new PluginError('einfalt:inject', 'Stream not support'))
        return callback(null, chunk)
      }

      // 当不存在additional
      if (!config.resolve?.additional || Object.keys(config.resolve?.additional).length === 0) {
        return callback(null, chunk)
      }

      const additional = config.resolve?.additional
      let { extname } = chunk
      extname = extname.substr(1, extname.length - 1)
      if (!additional.prepend?.[extname] && !additional.append?.[extname]) {
        return callback(null, chunk)
      }

      let prependData = ''
      let appendData = ''
      const prependOption = additional.prepend?.[extname]
      const appendOption = additional.append?.[extname]

      // fix for windows
      const chunkName = chunk.dirname.replace(/\\/g, '/')
      if (prependOption
        && (!prependOption.includes || isMatched(chunkName, prependOption.includes))
        && (!prependOption.excludes || !isMatched(chunkName, prependOption.excludes))) {
        prependData = resolvePrependAdditional(config, extname)
      }

      if (appendOption
        && (!appendOption.includes || isMatched(chunkName, appendOption.includes))
        && (!appendOption.excludes || !isMatched(chunkName, appendOption.excludes))) {
        appendData = resolveAppendAdditional(config, extname)
      }

      let code = String(chunk.contents)
      code = `${prependData ? `${prependData}\n` : ''}${code}${appendData ? `\n${appendData}` : ''}`
      chunk.contents = Buffer.from(code)

      callback(null, chunk)
    }
  })
}
