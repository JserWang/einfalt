import { Transform, TransformCallback } from 'stream'
import Vinyl from 'vinyl'
import PluginError from 'plugin-error'
import { clearRouteBlock, hasRouteBlock } from '../wxml'

export default function(): Transform {
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

      let code = String(chunk.contents)

      if (!hasRouteBlock(code)) {
        return callback(null, chunk)
      }

      // 存在route block则清空
      code = clearRouteBlock(code)
      chunk.contents = Buffer.from(code)

      callback(null, chunk)
    }
  })
}
