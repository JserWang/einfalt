import { dirname } from 'path'
import gulp from 'gulp'
import chalk from 'chalk'
import { ResolvedConfig } from '../config'
import components from '../plugins/components'
import template from '../plugins/template'
import inject from '../plugins/inject'
import spacing from '../plugins/spacing'

function build(config: ResolvedConfig, source: string, target?: string, extname?: string) {
  config.logger.info(chalk.green(`build ${extname} `) + chalk.dim('start'), {
    timestamp: true
  })
  target = target || config.build.outDir
  return gulp
    // 指定编译目录
    .src([source, ...config.build.ignore], { nodir: true })
    .pipe(inject(config))
    .pipe(template())
    .pipe(spacing(config.resolve?.spacing))
    .on('end', () => {
      config.logger.info(chalk.green(`build ${extname} `) + chalk.dim('finished'), {
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

export function templateTask(config: ResolvedConfig, source?: string) {
  const extname = config.platform === 'alipay' ? 'axml' : 'wxml'
  let target = ''
  if (source) {
    target = dirname(source.replace(config.entry, config.build.outDir))
  } else {
    source = `${config.entry}/**/*.${extname}`
  }

  return () => build(config, source!, target, extname)
}

export function templateDistTask(config: ResolvedConfig, source?: string) {
  let target = ''
  if (!source) {
    source = `${config.build.outDir}/**/*.${config.platform === 'alipay' ? 'axml' : 'wxml'}`
  } else {
    target = dirname(source)
  }

  return () => processDist(config, source!, target)
}
