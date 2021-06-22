import { dirname } from 'path'
import gulp from 'gulp'
// @ts-ignore
import inject from 'gulp-inject-string'
import chalk from 'chalk'
import { ResolvedConfig } from '../config'
import components from '../plugins/components'
import wxml from '../plugins/wxml'
import { resolveAppendAdditional, resolvePrependAdditional } from '../utils'

function build(config: ResolvedConfig, source: string, target?: string) {
  config.logger.info(chalk.green('build wxml ') + chalk.dim('start'), {
    timestamp: true
  })
  target = target || config.build.outDir
  return gulp
    // 指定编译目录
    .src([source, ...config.build.ignore], { nodir: true })
    .pipe(inject.append(resolveAppendAdditional(config, 'wxml')))
    .pipe(inject.prepend(resolvePrependAdditional(config, 'wxml')))
    .pipe(wxml())
    .on('end', () => {
      config.logger.info(chalk.green('build wxml ') + chalk.dim('finished'), {
        timestamp: true
      })
    })
    .pipe(gulp.dest(target))
}

function processDist(config: ResolvedConfig, source: string, target?: string) {
  target = target || config.build.outDir
  return gulp
    .src([source, ...config.build.ignore], { nodir: true })
    .pipe(components(config.resolve?.components))
    .pipe(gulp.dest(target))
}

export function wxmlTask(config: ResolvedConfig, source?: string) {
  let target = ''
  if (source) {
    target = dirname(source.replace('src', config.build.outDir))
  } else {
    source = 'src/**/*.wxml'
  }

  return () => build(config, source!, target)
}

export function wxmlDistTask(config: ResolvedConfig, source?: string) {
  let target = ''
  if (!source) {
    source = `${config.build.outDir}/**/*.wxml`
  } else {
    target = dirname(source)
  }

  return () => processDist(config, source!, target)
}
