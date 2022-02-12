import { join } from 'path'
import { NextHandleFunction } from 'connect'
import { StringUtils } from 'turbocommons-ts'

function getFileName(filePath?: string) {
  if (filePath) {
    return `/${
      StringUtils.formatCase(
        filePath.split('/')[0],
        StringUtils.FORMAT_LOWER_CAMEL_CASE
      )
    }.js`
  }
  return '/undefined.js'
}

export function serveMockMiddleware(apiPrefix: string, mockFileDir: string): NextHandleFunction {
  // Keep the named function. The name is visible in debug logs via `DEBUG=connect:dispatcher ...`
  return function einfaltServeMockMiddleware(req, res, next) {
    const url = req.url?.split('?')[0]

    const prefix = new RegExp(`^${apiPrefix}\/`, 'g')
    const replacedPath = url?.replace(prefix, '')
    const fileName = getFileName(replacedPath)
    const targetFilePath = join(process.cwd(), mockFileDir, fileName)
    delete require.cache[targetFilePath]
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mockData = require(targetFilePath)

    if (mockData) {
      res.setHeader('Content-Type', 'application/json')
      res.statusCode = mockData.httpCode ? mockData.httpCode : 200
      res.end(JSON.stringify(mockData[url!]))
      return
    }

    next()
  }
}
