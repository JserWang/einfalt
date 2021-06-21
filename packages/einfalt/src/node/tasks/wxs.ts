import { dirname } from 'path'
import gulp from 'gulp'
import chalk from 'chalk'
import { ResolvedConfig } from '../config'

function build(config: ResolvedConfig, source: string, target?: string) {
  config.logger.info(chalk.green('copy wxs ') + chalk.dim('start'), {
    timestamp: true
  })
  target = target || config.build.outDir
  return gulp
    // 指定编译目录
    .src([source, ...config.build.ignore], { nodir: true })
    .on('end', () => {
      config.logger.info(chalk.green('copy wxs ') + chalk.dim('finished'), {
        timestamp: true
      })
    })
    .pipe(gulp.dest(target))
}

export function wxsTask(config: ResolvedConfig, source?: string) {
  let target = ''
  if (source) {
    target = dirname(source.replace('src', config.build.outDir))
  } else {
    source = 'src/**/*.wxs'
  }
  return () => build(config, source!, target)
}
