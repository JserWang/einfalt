import { cac } from 'cac'
import chalk from 'chalk'
import { BuildOptions } from './build'
import { createLogger, LogLevel } from './logger'
import { ServerOptions } from './server'

const cli = cac('einfalt')

// global options
interface GlobalCLIOptions {
  '--'?: string[]
  debug?: boolean | string
  d?: boolean | string
  filter?: string
  f?: string
  config?: string
  c?: boolean | string
  root?: string
  r?: string
  mode?: string
  m?: string
  logLevel?: LogLevel
  l?: LogLevel
  clearScreen?: boolean
}

/**
 * removing global flags before passing as command specific sub-configs
 */
function cleanOptions(options: GlobalCLIOptions) {
  const ret = { ...options }
  delete ret['--']
  delete ret.debug
  delete ret.d
  delete ret.filter
  delete ret.f
  delete ret.config
  delete ret.c
  delete ret.root
  delete ret.r
  delete ret.mode
  delete ret.m
  delete ret.logLevel
  delete ret.l
  delete ret.clearScreen
  return ret
}

cli
  .option('-c, --config <file>', '[string] use specified config file')
  .option('-r, --root <path>', '[string] use specified root directory')
  .option('-l, --logLevel <level>', '[string] info | warn | error | silent')
  .option('--clearScreen', '[boolean] allow/disable clear screen when logging')
  .option('-d, --debug [feat]', '[string | boolean] show debug logs')

cli
  .command('[root]')
  .alias('serve')
  .option('--host [host]', '[string] specify hostname')
  .option('--port <port>', '[number] specify port')
  .option('--strictPort', '[boolean] exit if specified port is already in use')
  .option('--mode <mode>', '[string] set env mode')
  .action(async(root: string, options: ServerOptions & GlobalCLIOptions) => {
    const { createServer } = await import ('./server')
    try {
      const server = await createServer({
        root,
        mode: options.mode,
        configFile: options.config,
        logLevel: options.logLevel,
        clearScreen: options.clearScreen,
        server: cleanOptions(options) as ServerOptions
      })
      await server.listen()
    } catch (e) {
      createLogger(options.logLevel).error(
        chalk.red(`error when starting dev server:\n${e.stack}`)
      )
      process.exit(1)
    }
  })

// build
cli
  .command('build [root]')
  .option('--outDir <dir>', '[string] output directory (default: dist)')
  .option(
    '--assetsDir <dir>',
    '[string] directory under outDir to place assets in (default: _assets)'
  )
  .option(
    '--sourcemap',
    '[boolean] output source maps for build (default: false)'
  )
  .option(
    '--minify [minifier]',
    '[boolean] enable/disable minification, '
    + 'or specify minifier to use (default: terser)'
  )
  .option(
    '--emptyOutDir',
    '[boolean] force empty outDir when it\'s outside of root'
  )
  .option('-m, --mode <mode>', '[string] set env mode')
  .action(async(root: string, options: BuildOptions & GlobalCLIOptions) => {
    const { doBuild } = await import('./build')
    const buildOptions = cleanOptions(options) as BuildOptions

    try {
      await doBuild({
        root,
        mode: options.mode,
        configFile: options.config,
        logLevel: options.logLevel,
        clearScreen: options.clearScreen,
        build: buildOptions
      })
    } catch (e) {
      createLogger(options.logLevel).error(
        chalk.red(`error during build:\n${e.stack}`)
      )
      process.exit(1)
    }
  })

cli.help()
// eslint-disable-next-line @typescript-eslint/no-var-requires
cli.version(require('../../package.json').version)

cli.parse()
