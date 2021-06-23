import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import dotenv from 'dotenv'
import dotenvExpand from 'dotenv-expand'
import { build } from 'esbuild'
import chalk from 'chalk'
import { Alias, AliasOptions } from './plugins/alias'
import { createDebugger, isObject, lookupFile, normalizePath } from './utils'
import { createLogger, Logger, LogLevel } from './logger'
import { BuildOptions, resolveBuildOptions, ResolvedBuildOptions } from './build'
import { ComponentsOptions } from './plugins/components'
import { ServerOptions } from './server'

const debug = createDebugger('einfalt:config')

export interface ConfigEnv {
  command: 'build' | 'serve'
  mode: string
}

interface Additional {
  [file: string]: {
    content: string
    includes?: RegExp | RegExp[]
  }
}

interface AdditionalOption {
  prepend?: Additional
  append?: Additional
}

export interface UserConfig {
  /**
   * Project root directory. Can be an absolute path, or a path relative from
   * the location of the config file itself.
   * @default process.cwd()
   */
  root?: string
  /**
   * 首页路径
   */
  home?: string
  /**
   * Directory to serve as plain static assets. Files in this directory are
   * served and copied to build dist dir as-is without transform. The value
   * can be either an absolute file system path or a path relative to <root>.
   *
   * Set to `false` or an empty string to disable copied static assets to build dist dir.
   * @default 'public'
   */
  publicDir?: string | false
  /**
   * Explicitly set a mode to run in. This will override the default mode for
   * each command, and can be overridden by the command line --mode option.
   */
  mode?: string
  /**
   * 指定router路径
   */
  router?: string
  /**
   * Define global variable replacements.
   * Entries will be defined on `window` during dev and replaced during build.
   */
  define?: Record<string, any>
  /**
   * Configure resolver
   */
  resolve?: {
    alias?: AliasOptions
    components?: ComponentsOptions
  }
  /**
   * Server specific options, e.g. host, port, https...
   */
  server?: ServerOptions
  /**
   * Build specific options
   */
  build?: BuildOptions
  /**
   * Log level.
   * Default: 'info'
   */
  logLevel?: LogLevel
  /**
   * Default: true
   */
  clearScreen?: boolean
  /**
   * Environment files directory. Can be an absolute path, or a path relative from
   * the location of the config file itself.
   * @default root
   */
  envDir?: string

  additional?: AdditionalOption
}

export type UserConfigFn = (env: ConfigEnv) => UserConfig | Promise<UserConfig>
export type UserConfigExport = UserConfig | Promise<UserConfig> | UserConfigFn

/**
 * Type helper to make it easier to use vite.config.ts
 * accepts a direct {@link UserConfig} object, or a function that returns it.
 * The function receives a {@link ConfigEnv} object that exposes two properties:
 * `command` (either `'build'` or `'serve'`), and `mode`.
 */
export function defineConfig(config: UserConfigExport): UserConfigExport {
  return config
}

export interface InlineConfig extends UserConfig {
  configFile?: string | false
  envFile?: false
}

export type ResolvedConfig = Readonly<UserConfig & {
  configFile: string | undefined
  inlineConfig: InlineConfig
  root: string
  publicDir: string
  command: 'build' | 'serve'
  mode: string
  server: ServerOptions
  env: Record<string, any>
  build: ResolvedBuildOptions
  logger: Logger
}>

export async function resolveConfig(
  inlineConfig: InlineConfig,
  command: 'build' | 'serve',
  defaultMode = 'development'
): Promise<ResolvedConfig> {
  let config = inlineConfig
  const mode = inlineConfig.mode || defaultMode
  process.env.NODE_ENV = mode

  const configEnv = {
    mode,
    command
  }

  let { configFile } = config
  if (configFile !== false) {
    const loadResult = await loadConfigFromFile(
      configEnv,
      configFile,
      config.root,
      config.logLevel
    )
    if (loadResult) {
      config = mergeConfig(loadResult.config, config)
      configFile = loadResult.path
    }
  }

  // Define logger
  const logger = createLogger(config.logLevel, {
    allowClearScreen: config.clearScreen
  })

  // resolve root
  const resolvedRoot = normalizePath(
    config.root ? path.resolve(config.root) : process.cwd()
  )

  // load .env files
  const envDir = config.envDir
    ? normalizePath(path.resolve(resolvedRoot, config.envDir))
    : resolvedRoot

  const userEnv = inlineConfig.envFile !== false && loadEnv(mode, envDir)

  const { publicDir } = config
  const resolvedPublicDir = publicDir !== false && publicDir !== ''
    ? path.resolve(
      resolvedRoot,
      typeof publicDir === 'string' ? publicDir : 'public'
    )
    : ''

  const resolved: ResolvedConfig = {
    ...config,
    configFile: configFile ? normalizePath(configFile) : undefined,
    inlineConfig,
    root: resolvedRoot,
    publicDir: resolvedPublicDir,
    command,
    mode,
    server: config.server ? config.server : {},
    build: resolveBuildOptions(config.build),
    env: {
      ...userEnv,
      MODE: mode
    },
    logger
  }

  if (process.env.DEBUG) {
    debug('using resolved config: %O', resolved)
  }

  return resolved
}

function mergeConfigRecursively(
  a: Record<string, any>,
  b: Record<string, any>,
  rootPath: string
) {
  const merged: Record<string, any> = { ...a }

  // eslint-disable-next-line no-restricted-syntax
  for (const key in b) {
    const value = b[key]
    if (value == null) {
      continue
    }

    const existing = merged[key]
    if (Array.isArray(existing) && Array.isArray(value)) {
      merged[key] = [...existing, ...value]
      continue
    }
    if (isObject(existing) && isObject(value)) {
      merged[key] = mergeConfigRecursively(
        existing,
        value,
        rootPath ? `${rootPath}.${key}` : key
      )
      continue
    }

    // fields that require special handling
    if (existing != null) {
      if (key === 'alias' && (rootPath === 'resolve' || rootPath === '')) {
        merged[key] = mergeAlias(existing, value)
        continue
      }
    }

    merged[key] = value
  }
  return merged
}

export function mergeConfig(
  a: Record<string, any>,
  b: Record<string, any>,
  isRoot = true
): Record<string, any> {
  return mergeConfigRecursively(a, b, isRoot ? '' : '.')
}

function mergeAlias(a: AliasOptions = [], b: AliasOptions = []): Alias[] {
  return [...normalizeAlias(a), ...normalizeAlias(b)]
}

function normalizeAlias(o: AliasOptions): Alias[] {
  return Array.isArray(o)
    ? o.map(normalizeSingleAlias)
    : Object.keys(o).map(find =>
      normalizeSingleAlias({
        find,
        replacement: (o as any)[find]
      })
    )
}

function normalizeSingleAlias({ find, replacement }: Alias): Alias {
  if (
    typeof find === 'string'
    && find.endsWith('/')
    && replacement.endsWith('/')
  ) {
    find = find.slice(0, find.length - 1)
    replacement = replacement.slice(0, replacement.length - 1)
  }
  return { find, replacement }
}

export async function loadConfigFromFile(
  configEnv: ConfigEnv,
  configFile?: string,
  configRoot: string = process.cwd(),
  logLevel?: LogLevel
): Promise<{
    path: string
    config: UserConfig
  } | null> {
  const start = Date.now()

  let resolvedPath: string | undefined
  let isTS = false
  let isMjs = false

  // check package.json for type: "module" and set `isMjs` to true
  try {
    const pkg = lookupFile(configRoot, ['package.json'])
    if (pkg && JSON.parse(pkg).type === 'module') {
      isMjs = true
    }
  } catch (e) {}

  if (configFile) {
    // explicit config path is always resolved from cwd
    resolvedPath = path.resolve(configFile)
    isTS = configFile.endsWith('.ts')
  } else {
    // implicit config file loaded from inline root (if present)
    // otherwise from cwd
    const jsconfigFile = path.resolve(configRoot, 'einfalt.config.js')
    if (fs.existsSync(jsconfigFile)) {
      resolvedPath = jsconfigFile
    }

    if (!resolvedPath) {
      const tsconfigFile = path.resolve(configRoot, 'einfalt.config.ts')
      if (fs.existsSync(tsconfigFile)) {
        resolvedPath = tsconfigFile
        isTS = true
      }
    }
  }

  if (!resolvedPath) {
    debug('no config file found.')
    return null
  }

  try {
    let userConfig: UserConfigExport | undefined

    if (isMjs) {
      const fileUrl = pathToFileURL(resolvedPath)
      if (isTS) {
        // before we can register loaders without requiring users to run node
        // with --experimental-loader themselves, we have to do a hack here:
        // bundle the config file w/ ts transforms first, write it to disk,
        // load it with native Node ESM, then delete the file.
        const bundled = await bundleConfigFile(resolvedPath, true)
        fs.writeFileSync(`${resolvedPath}.js`, bundled.code)
        // eslint-disable-next-line no-eval
        userConfig = (await eval(`import(fileUrl + '.js?t=${Date.now()}')`))
          .default
        fs.unlinkSync(`${resolvedPath}.js`)
        debug(
          `TS + native esm config loaded in ${Date.now() - start}ms`,
          fileUrl
        )
      } else {
        // using eval to avoid this from being compiled away by TS/Rollup
        // append a query so that we force reload fresh config in case of
        // server restart
        // eslint-disable-next-line no-eval
        userConfig = (await eval(`import(fileUrl + '?t=${Date.now()}')`))
          .default
        debug(`native esm config loaded in ${Date.now() - start}ms`, fileUrl)
      }
    }

    if (!userConfig && !isTS && !isMjs) {
      // 1. try to directly require the module (assuming commonjs)
      try {
        // clear cache in case of server restart
        delete require.cache[require.resolve(resolvedPath)]
        userConfig = require(resolvedPath)
        debug(`cjs config loaded in ${Date.now() - start}ms`)
      } catch (e) {
        const ignored = new RegExp(
          [
            'Cannot use import statement',
            'Must use import to load ES Module',
            // #1635, #2050 some Node 12.x versions don't have esm detection
            // so it throws normal syntax errors when encountering esm syntax
            'Unexpected token',
            'Unexpected identifier'
          ].join('|')
        )
        if (!ignored.test(e.message)) {
          throw e
        }
      }
    }

    if (!userConfig) {
      // 2. if we reach here, the file is ts or using es import syntax, or
      // the user has type: "module" in their package.json (#917)
      // transpile es import syntax to require syntax using rollup.
      // lazy require rollup (it's actually in dependencies)
      const bundled = await bundleConfigFile(resolvedPath)
      userConfig = await loadConfigFromBundledFile(resolvedPath, bundled.code)
      debug(`bundled config file loaded in ${Date.now() - start}ms`)
    }

    const config = await (typeof userConfig === 'function'
      ? userConfig(configEnv)
      : userConfig)
    if (!isObject(config)) {
      throw new Error('config must export or return an object.')
    }
    return {
      path: normalizePath(resolvedPath),
      config
    }
  } catch (e) {
    createLogger(logLevel).error(
      chalk.red(`failed to load config from ${resolvedPath}`)
    )
    throw e
  }
}

async function bundleConfigFile(
  fileName: string,
  mjs = false
): Promise<{ code: string; dependencies: string[] }> {
  const result = await build({
    entryPoints: [fileName],
    outfile: 'out.js',
    write: false,
    platform: 'node',
    bundle: true,
    format: mjs ? 'esm' : 'cjs',
    metafile: true,
    plugins: [
      {
        name: 'externalize-deps',
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            const id = args.path
            if (id[0] !== '.' && !path.isAbsolute(id)) {
              return {
                external: true
              }
            }
          })
        }
      },
      {
        name: 'replace-import-meta',
        setup(build) {
          build.onLoad({ filter: /\.[jt]s$/ }, async(args) => {
            const contents = await fs.promises.readFile(args.path, 'utf8')
            return {
              loader: args.path.endsWith('.ts') ? 'ts' : 'js',
              contents: contents
                .replace(
                  /\bimport\.meta\.url\b/g,
                  JSON.stringify(`file://${args.path}`)
                )
                .replace(
                  /\b__dirname\b/g,
                  JSON.stringify(path.dirname(args.path))
                )
                .replace(/\b__filename\b/g, JSON.stringify(args.path))
            }
          })
        }
      }
    ]
  })

  const [outputFile] = result.outputFiles

  return {
    code: outputFile.text,
    dependencies: result.metafile ? Object.keys(result.metafile.inputs) : []
  }
}

interface NodeModuleWithCompile extends NodeModule {
  _compile(code: string, filename: string): any
}

async function loadConfigFromBundledFile(
  fileName: string,
  bundledCode: string
): Promise<UserConfig> {
  /* eslint-disable node/no-deprecated-api */
  const extension = path.extname(fileName)
  const defaultLoader = require.extensions[extension]!
  require.extensions[extension] = (module: NodeModule, filename: string) => {
    if (filename === fileName) {
      (module as NodeModuleWithCompile)._compile(bundledCode, filename)
    } else if (defaultLoader) {
      defaultLoader(module, filename)
    }
  }
  // clear cache in case of server restart
  delete require.cache[require.resolve(fileName)]
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const raw = require(fileName)
  const config = raw.__esModule ? raw.default : raw
  require.extensions[extension] = defaultLoader
  return config
}

export function loadEnv(
  mode: string,
  envDir: string,
  prefix = 'EF_'
): Record<string, string> {
  if (mode === 'local') {
    throw new Error(
      '"local" cannot be used as a mode name because it conflicts with '
      + 'the .local postfix for .env files.'
    )
  }

  const env: Record<string, string> = {}
  const envFiles = [
    /** mode local file */ `.env.${mode}.local`,
    /** mode file */ `.env.${mode}`,
    /** local file */ '.env.local',
    /** default file */ '.env'
  ]

  // check if there are actual env variables starting with VITE_*
  // these are typically provided inline and should be prioritized
  // eslint-disable-next-line no-restricted-syntax
  for (const key in process.env) {
    if (key.startsWith(prefix) && env[key] === undefined) {
      env[key] = process.env[key] as string
    }
  }

  for (const file of envFiles) {
    const path = lookupFile(envDir, [file], true)
    if (path) {
      const parsed = dotenv.parse(fs.readFileSync(path), {
        debug: !!process.env.DEBUG || undefined
      })

      // let environment variables use each other
      dotenvExpand({
        parsed,
        // prevent process.env mutation
        ignoreProcessEnv: true
      } as any)

      // only keys that start with prefix are exposed to client
      for (const [key, value] of Object.entries(parsed)) {
        if (key.startsWith(prefix) && env[key] === undefined) {
          env[key] = value
        }
      }
    }
  }

  return env
}
