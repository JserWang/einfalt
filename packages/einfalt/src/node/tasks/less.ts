import { dirname } from 'path'
import gulp from 'gulp'
// @ts-ignore
import less from 'gulp-less'
// @ts-ignore
import px2rpx from 'gulp-px2rpx'
// @ts-ignore
import rename from 'gulp-rename'
// @ts-ignore
import inject from 'gulp-inject-string'
import chalk from 'chalk'
import { ResolvedConfig } from '../config'
import { resolveAppendAdditional, resolvePrependAdditional } from '../utils'

function build(config: ResolvedConfig, source: string, target?: string) {
  config.logger.info(chalk.green('build less ') + chalk.dim('start'), {
    timestamp: true
  })
  target = target || config.build.outDir
  let hasError = false
  return gulp
    // 指定编译目录
    .src([source, ...config.build.ignore], { nodir: true })
    .pipe(inject.append(resolveAppendAdditional(config, 'less')))
    .pipe(inject.prepend(resolvePrependAdditional(config, 'less')))
    .pipe(less({ allowEmpty: true }))
    .on('error', (err: string) => {
      hasError = true
      config.logger.error(err, {
        timestamp: true
      })
    })
    .pipe(px2rpx())
    .pipe(rename({ extname: '.wxss' }))
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
    target = dirname(source.replace('src', config.build.outDir))
  } else {
    source = 'src/**/*.less'
  }

  return () => build(config, source!, target)
}
