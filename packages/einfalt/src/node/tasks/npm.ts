import path from 'path'
import gulp from 'gulp'
import chalk from 'chalk'
import { ResolvedConfig } from '../config'
import { NPM_SOURCE } from '../constants'

function build(config: ResolvedConfig) {
  config.logger.info(chalk.green('copy npm ') + chalk.dim('start'), {
    timestamp: true
  })
  return gulp
    // 指定编译目录
    .src(`${NPM_SOURCE}/**`)
    .on('end', () => {
      config.logger.info(chalk.green('copy npm ') + chalk.dim('finished'), {
        timestamp: true
      })
    })
    .pipe(gulp.dest(path.join(config.build.outDir, NPM_SOURCE)))
}

export function npmTask(config: ResolvedConfig) {
  return () => build(config)
}
