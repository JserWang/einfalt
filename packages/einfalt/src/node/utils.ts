import { Transform, TransformCallback } from 'stream'
import { dirname, basename, extname, join, posix, relative, resolve } from 'path'
import {
  existsSync,
  statSync,
  readFileSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  rmSync
} from 'fs'
import { createHash } from 'crypto'
import os from 'os'
import debug from 'debug'
import chalk from 'chalk'
import { FS_PREFIX } from './constants'
import { ResolvedConfig } from './config'

export function slash(p: string): string {
  return p.replace(/\\/g, '/')
}

// set in bin/einfalt.js
const filter = process.env.EF_DEBUG_FILTER

const { DEBUG } = process.env

interface DebuggerOptions {
  onlyWhenFocused?: boolean | string
}

export function createDebugger(
  ns: string,
  options: DebuggerOptions = {}
): debug.Debugger['log'] {
  const log = debug(ns)
  const { onlyWhenFocused } = options
  const focus = typeof onlyWhenFocused === 'string' ? onlyWhenFocused : ns
  return (msg: string, ...args: any[]) => {
    if (filter && !msg.includes(filter)) {
      return
    }
    if (onlyWhenFocused && !DEBUG?.includes(focus)) {
      return
    }
    log(msg, ...args)
  }
}

export const isWindows = os.platform() === 'win32'
const VOLUME_RE = /^[A-Z]:/i

export function normalizePath(id: string): string {
  return posix.normalize(isWindows ? slash(id) : id)
}

export const EmptyTransform = () =>
  new Transform({
    objectMode: true,
    transform(chunk, __, callback: TransformCallback) {
      callback(null, chunk)
    }
  })

export function parsePath(filePath: string) {
  return {
    dirname: dirname(filePath),
    basename: basename(filePath, extname(filePath))
  }
}

export function lookupFile(
  dir: string,
  formats: string[],
  pathOnly = false
): string | undefined {
  for (const format of formats) {
    const fullPath = join(dir, format)
    if (existsSync(fullPath) && statSync(fullPath).isFile()) {
      return pathOnly ? fullPath : readFileSync(fullPath, 'utf-8')
    }
  }
  const parentDir = dirname(dir)
  if (parentDir !== dir) {
    return lookupFile(parentDir, formats, pathOnly)
  }
}

/**
 * Delete every file and subdirectory. **The given directory must exist.**
 * Pass an optional `skip` array to preserve files in the root directory.
 */
export function emptyDir(dir: string, skip?: string[]): void {
  for (const file of readdirSync(dir)) {
    if (skip?.includes(file)) {
      continue
    }
    const abs = resolve(dir, file)
    rmSync(abs, { recursive: true })
  }
}

export function copyDir(srcDir: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true })
  for (const file of readdirSync(srcDir)) {
    const srcFile = resolve(srcDir, file)
    const destFile = resolve(destDir, file)
    const stat = statSync(srcFile)
    if (stat.isDirectory()) {
      copyDir(srcFile, destFile)
    } else {
      copyFileSync(srcFile, destFile)
    }
  }
}

export function md5(text: string) {
  return createHash('md5').update(text, 'utf8').digest('hex')
}

export interface Hostname {
  // undefined sets the default behaviour of server.listen
  host: string | undefined
  // resolve to localhost when possible
  name: string
}

export function resolveHostname(
  optionsHost: string | boolean | undefined
): Hostname {
  let host: string | undefined
  if (
    optionsHost === undefined
    || optionsHost === false
    || optionsHost === 'localhost'
  ) {
    // Use a secure default
    host = '127.0.0.1'
  } else if (optionsHost === true) {
    // If passed --host in the CLI without arguments
    host = undefined // undefined typically means 0.0.0.0 or :: (listen on all IPs)
  } else {
    host = optionsHost
  }

  // Set host name to localhost when possible, unless the user explicitly asked for '127.0.0.1'
  const name
    = (optionsHost !== '127.0.0.1' && host === '127.0.0.1')
    || host === '0.0.0.0'
    || host === '::'
    || host === undefined
      ? 'localhost'
      : host

  return { host, name }
}

export function fsPathFromId(id: string): string {
  const fsPath = normalizePath(id.slice(FS_PREFIX.length))
  return fsPath.startsWith('/') || fsPath.match(VOLUME_RE)
    ? fsPath
    : `/${fsPath}`
}

const trailingSeparatorRE = /[\?&]$/
const timestampRE = /\bt=\d{13}&?\b/
export function removeTimestampQuery(url: string): string {
  return url.replace(timestampRE, '').replace(trailingSeparatorRE, '')
}

export function timeFrom(start: number, subtract = 0): string {
  const time: number | string = Date.now() - start - subtract
  const timeString = (`${time}ms`).padEnd(5, ' ')
  if (time < 10) {
    return chalk.green(timeString)
  } else if (time < 50) {
    return chalk.yellow(timeString)
  } else {
    return chalk.red(timeString)
  }
}

/**
 * pretty url for logging.
 */
export function prettifyUrl(url: string, root: string): string {
  url = removeTimestampQuery(url)
  const isAbsoluteFile = url.startsWith(root)
  if (isAbsoluteFile || url.startsWith(FS_PREFIX)) {
    let file = relative(root, isAbsoluteFile ? url : fsPathFromId(url))
    const seg = file.split('/')
    const npmIndex = seg.indexOf('node_modules')
    const isSourceMap = file.endsWith('.map')
    if (npmIndex > 0) {
      file = seg[npmIndex + 1]
      if (file.startsWith('@')) {
        file = `${file}/${seg[npmIndex + 2]}`
      }
      file = `npm: ${chalk.dim(file)}${isSourceMap ? ' (source map)' : ''}`
    }
    return chalk.dim(file)
  } else {
    return chalk.dim(url)
  }
}

export function isObject(value: unknown): value is Record<string, any> {
  return Object.prototype.toString.call(value) === '[object Object]'
}

export function transformIgnore(ignore?: string[]) {
  return ignore?.map(item => `!${item}`) || []
}

export function resolvePrependAdditional(config: ResolvedConfig, extname: string) {
  if (config.additional?.prepend && config.additional?.prepend[extname]) {
    return config.additional?.prepend[extname]
  }
  return ''
}

export function resolveAppendAdditional(config: ResolvedConfig, extname: string) {
  if (config.additional?.append && config.additional?.append[extname]) {
    return config.additional?.append[extname]
  }
  return ''
}
