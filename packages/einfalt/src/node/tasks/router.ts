import { resolve, dirname } from 'path'
import gulp from 'gulp'
import ts from 'gulp-typescript'
import chalk from 'chalk'
import { ResolvedConfig } from '../config'
import alias from '../plugins/alias'
import define from '../plugins/define'
import router from '../plugins/router'

function build(config: ResolvedConfig) {
  config.logger.info(chalk.green('transform router ') + chalk.dim('start'), {
    timestamp: true
  })
  const tsProject = ts.createProject(resolve(config.root, 'tsconfig.json'))
  let hasError = false
  return gulp
    // 指定编译目录
    .src([config.paths!.router!, ...config.build.ignore], { nodir: true })
    .pipe(router(config))
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
        config.logger.info(chalk.green('transform router ') + chalk.dim('finished'), {
          timestamp: true
        })
      }
    })
    .pipe(gulp.dest(
      dirname(config.paths!.router!.replace(config.entry, config.build.outDir))
    ))
}

export function routerTask(config: ResolvedConfig) {
  return () => build(config)
}
