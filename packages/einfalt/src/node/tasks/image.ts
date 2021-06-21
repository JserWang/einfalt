import gulp from 'gulp'
import chalk from 'chalk'
import { ResolvedConfig } from '../config'

function build(config: ResolvedConfig) {
  config.logger.info(chalk.green('copy images ') + chalk.dim('start'), {
    timestamp: true
  })
  return gulp
    // 指定编译目录
    .src('src/**/*.{gif,jpg,jpeg,png,svg}')
    .on('end', () => {
      config.logger.info(chalk.green('copy images ') + chalk.dim('finished'), {
        timestamp: true
      })
    })
    .pipe(gulp.dest(config.build.outDir))
}

export function imageTask(config: ResolvedConfig) {
  return () => build(config)
}
