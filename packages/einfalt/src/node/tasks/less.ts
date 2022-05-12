import { dirname } from 'path'
import gulp from 'gulp'
// @ts-ignore
import less from 'gulp-less'
// @ts-ignore
import px2rpx from 'gulp-px2rpx'
import rename from 'gulp-rename'
import chalk from 'chalk'
import { ResolvedConfig } from '../config'
import inject from '../plugins/inject'

function build(config: ResolvedConfig, source: string, target?: string) {
  config.logger.info(chalk.green('build less ') + chalk.dim('start'), {
    timestamp: true
  })
  target = target || config.build.outDir
  let hasError = false

  const renameExtname = config.platform === 'alipay' ? '.acss' : '.wxss'

  return gulp
    // 指定编译目录
    .src([source, ...config.build.ignore], { nodir: true, allowEmpty: true })
    .pipe(inject(config))
    .pipe(less())
    .on('error', (err: string) => {
      hasError = true
      config.logger.error(err, {
        timestamp: true
      })
    })
    .pipe(px2rpx())
    .pipe(rename({ extname: renameExtname }))
    .on('end', () => {
      if (!hasError) {
        config.logger.info(chalk.green('build less ') + chalk.dim('finished'), {
          timestamp: true
        })
      }
    })
    .pipe(gulp.dest(target))
}

export function lessTask(config: ResolvedConfig, source?: string) {
  let target = ''
  if (source) {
    target = dirname(source.replace(config.entry, config.build.outDir))
  } else {
    source = `${config.entry}/**/*.less`
  }

  return () => build(config, source!, target)
}
