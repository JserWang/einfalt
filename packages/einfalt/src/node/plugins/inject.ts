import { Transform, TransformCallback } from 'stream'
import Vinyl from 'vinyl'
import PluginError from 'plugin-error'
import { ResolvedConfig } from '../config'
import { isMatched } from '../utils'

function resolvePrependAdditional(config: ResolvedConfig, extname: string) {
  if (config.additional!.prepend?.[extname]) {
    return config.additional!.prepend[extname].content
  }
  return ''
}

function resolveAppendAdditional(config: ResolvedConfig, extname: string) {
  if (config.additional!.append?.[extname]) {
    return config.additional!.append[extname].content
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
        this.emit('error', new PluginError('einfalt:wxml', 'Stream not support'))
        return callback(null, chunk)
      }

      // 当不存在additional
      if (!config.additional || Object.keys(config.additional).length === 0) {
        return callback(null, chunk)
      }

      let { extname } = chunk
      extname = extname.substr(1, extname.length - 1)
      if (!config.additional.prepend?.[extname] && !config.additional.append?.[extname]) {
        return callback(null, chunk)
      }

      let prependData = ''
      let appendData = ''
      const prependOption = config.additional.prepend?.[extname]
      const appendOption = config.additional.append?.[extname]

      if (prependOption && (!prependOption.includes || isMatched(chunk.dirname, prependOption.includes))) {
        prependData = resolvePrependAdditional(config, extname)
      }

      if (appendOption && (!appendOption.includes || isMatched(chunk.dirname, appendOption.includes))) {
        appendData = resolveAppendAdditional(config, extname)
      }

      let code = String(chunk.contents)
      code = `${prependData ? `${prependData}\n` : ''}${code}${appendData ? `\n${appendData}` : ''}`
      chunk.contents = Buffer.from(code)

      callback(null, chunk)
    }
  })
}
