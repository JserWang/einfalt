import { dirname } from 'path'
import gulp from 'gulp'
import chalk from 'chalk'
import { ResolvedConfig } from '../config'

function build(config: ResolvedConfig, source: string, target?: string, keyword?: string) {
  config.logger.info(chalk.green(`copy ${keyword} `) + chalk.dim('start'), {
    timestamp: true
  })
  target = target || config.build.outDir
  return gulp
    // 指定编译目录
    .src([source, ...config.build.ignore], { nodir: true })
    .on('end', () => {
      config.logger.info(chalk.green(`copy ${keyword} `) + chalk.dim('finished'), {
        timestamp: true
      })
    })
    .pipe(gulp.dest(target))
}

export function copyTask({ config, source, extname }: {config: ResolvedConfig; source?: string; extname: string}) {
  let target = ''
  if (source) {
    target = dirname(source.replace(config.entry, config.build.outDir))
  } else {
    source = `${config.entry}/**/*.${extname}`
  }
  return () => build(config, source!, target, extname)
}
