import { existsSync, rmSync } from 'fs'
import path from 'path'
import chalk from 'chalk'
import { InlineConfig, resolveConfig, ResolvedConfig } from './config'
import { emptyTask, normalizePath, transformIgnore } from './utils'
import { tsTask } from './tasks/typescript'
import { jsonDistTask, jsonTask } from './tasks/json'
import { wxmlDistTask, wxmlTask } from './tasks/wxml'
import { lessTask } from './tasks/less'
import { npmTask } from './tasks/npm'
import { wxsTask } from './tasks/wxs'
import { imageTask } from './tasks/image'
import { execute } from './tasks'
import { routerTask } from './tasks/router'

export interface BuildOptions {
  /**
   * Directory relative from `root` where build output will be placed. If the
   * directory exists, it will be removed before the build.
   * @default 'dist'
   */
  outDir: string
  /**
   * If `true`, a separate sourcemap file will be created. If 'inline', the
   * sourcemap will be appended to the resulting output file as data URI.
   * 'hidden' works like `true` except that the corresponding sourcemap
   * comments in the bundled files are suppressed.
   * @default false
   */
  sourcemap?: boolean | 'inline' | 'hidden'
  /**
   * Set to `false` to disable minification, or specify the minifier to use.
   * Available options are 'terser' or 'esbuild'.
   * @default 'terser'
   */
  minify?: boolean | 'terser'
  /**
   * Empty outDir on write.
   * @default true when outDir is a sub directory of project root
   */
  emptyOutDir?: boolean | null
  /**
   * 忽略目录
   */
  ignore?: string[]
}

export type ResolvedBuildOptions = Required<BuildOptions>

export function resolveBuildOptions(raw?: BuildOptions) {
  const resolved: ResolvedBuildOptions = {
    outDir: 'dist',
    sourcemap: false,
    minify: false,
    emptyOutDir: null,
    ...raw,
    ignore: transformIgnore(raw?.ignore)
  }

  // normalize false string into actual false
  if ((resolved.minify as any) === 'false') {
    resolved.minify = false
  }

  return resolved
}

export async function doBuild(inlineConfig: InlineConfig = {}) {
  const config = await resolveConfig(inlineConfig, 'build', 'production')
  const options = config.build

  config.logger.info(
    chalk.cyan(
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      `${chalk.green(
        `building for ${config.mode}...`
      )}`
    )
  )

  const resolve = (p: string) => path.resolve(config.root, p)
  const outDir = resolve(options.outDir)

  prepareOutDir(outDir, options.emptyOutDir, config)

  const spacingPath = config.resolve?.spacing?.path
  if (spacingPath && existsSync(spacingPath)) {
    rmSync(spacingPath)
  }

  await execute([
    tsTask(config),
    config.router ? routerTask(config) : emptyTask,
    wxmlTask(config),
    lessTask(config),
    jsonTask(config),
    wxmlDistTask(config),
    jsonDistTask(config),
    wxsTask(config),
    imageTask(config),
    // NOTE: 前面代码处理完后最终再执行copy npm
    npmTask(config)
  ])
}

export function prepareOutDir(outDir: string, emptyOutDir: boolean | null, config: ResolvedConfig) {
  if (existsSync(outDir)) {
    if (emptyOutDir !== null && !normalizePath(outDir).startsWith(`${config.root}/`)) {
      config.logger.warn(
        chalk.yellow(
          `\n${chalk.bold('(!)')} outDir ${chalk.white.dim(
            outDir
          )} is not inside project root and will not be emptied.\n`
          + 'Use --emptyOutDir to override.\n'
        )
      )
    } else if (emptyOutDir !== false) {
      rmSync(outDir, { recursive: true })
    }
  }
}
