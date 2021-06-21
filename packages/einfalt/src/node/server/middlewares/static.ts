import sirv, { Options } from 'sirv'
import { NextHandleFunction } from 'connect'

const sirvOptions: Options = {
  dev: true,
  etag: true,
  extensions: [],
  setHeaders(res, pathname) {
    // Matches js, jsx, ts, tsx.
    // The reason this is done, is that the .ts file extension is reserved
    // for the MIME type video/mp2t. In almost all cases, we can expect
    // these files to be TypeScript files, and for Vite to serve them with
    // this Content-Type.
    if (/\.[tj]sx?$/.test(pathname)) {
      res.setHeader('Content-Type', 'application/javascript')
    }
  }
}

export function servePublicMiddleware(dir: string): NextHandleFunction {
  const serve = sirv(dir, sirvOptions)

  // Keep the named function. The name is visible in debug logs via `DEBUG=connect:dispatcher ...`
  return function einfaltServePublicMiddleware(req, res, next) {
    serve(req, res, next)
  }
}
