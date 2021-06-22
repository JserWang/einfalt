import { dirname, resolve } from 'path'
import gulp from 'gulp'
import ts from 'gulp-typescript'
import chalk from 'chalk'
// @ts-ignore
import inject from 'gulp-inject-string'
import { ResolvedConfig } from '../config'
import alias from '../plugins/alias'
import define from '../plugins/define'
import { resolveAppendAdditional, resolvePrependAdditional } from '../utils'

function build(config: ResolvedConfig, source: string, target?: string) {
  config.logger.info(chalk.green('build typescript ') + chalk.dim('start'), {
    timestamp: true
  })
  target = target || config.build.outDir
  const tsProject = ts.createProject(resolve(config.root, 'tsconfig.json'))
  let hasError = false
  return gulp
    // 指定编译目录
    .src([source, ...config.build.ignore], { nodir: true })
    .pipe(inject.prepend(resolvePrependAdditional(config, 'ts')))
    .pipe(inject.append(resolveAppendAdditional(config, 'ts')))
    .pipe(tsProject())
    .on('error', (err: string) => {
      hasError = true
      config.logger.error(err, {
        timestamp: true
      })
    })
    .pipe(alias(config.resolve?.alias))
    .pipe(define(config))
    .on('end', () => {
      if (!hasError) {
        config.logger.info(chalk.green('build typescript ') + chalk.dim('finished'), {
          timestamp: true
        })
      }
    })
    .pipe(gulp.dest(target))
}

export function tsTask(config: ResolvedConfig, source?: string) {
  let target = ''
  if (source) {
    target = dirname(source.replace('src', config.build.outDir))
  } else {
    source = 'src/**/*.ts'
  }

  return () => build(config, source!, target)
}
