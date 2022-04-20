import { dirname } from 'path'
import gulp from 'gulp'
import chalk from 'chalk'
// @ts-ignore
import { ResolvedConfig } from '../config'
import alias from '../plugins/alias'
import define from '../plugins/define'
import inject from '../plugins/inject'

function build(config: ResolvedConfig, source: string, target?: string) {
  config.logger.info(chalk.green('build javascript ') + chalk.dim('start'), {
    timestamp: true
  })
  target = target || config.build.outDir
  let hasError = false
  return gulp
    // 指定编译目录
    .src([source, ...config.build.ignore, `!${config.paths?.router}`], { nodir: true })
    .pipe(inject(config))
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
        config.logger.info(chalk.green('build javascript ') + chalk.dim('finished'), {
          timestamp: true
        })
      }
    })
    .pipe(gulp.dest(target))
}

export function jsTask(config: ResolvedConfig, source?: string) {
  let target = ''
  if (source) {
    target = dirname(source.replace(config.entry, config.build.outDir))
  } else {
    source = `${config.entry}/**/*.js`
  }

  return () => build(config, source!, target)
}
