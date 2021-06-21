import { NextHandleFunction } from 'connect'
import { createDebugger, prettifyUrl, timeFrom } from '../../utils'

const logTime = createDebugger('einfalt:time')

export function timeMiddleware(root: string): NextHandleFunction {
  // Keep the named function. The name is visible in debug logs via `DEBUG=connect:dispatcher ...`
  return function einfaltTimeMiddleware(req, res, next) {
    const start = Date.now()
    const { end } = res
    res.end = (...args: any[]) => {
      logTime(`${timeFrom(start)} ${prettifyUrl(req.url!, root)}`)
      // @ts-ignore
      return end.call(res, ...args)
    }
    next()
  }
}
