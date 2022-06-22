import { dirname, resolve } from 'path'
import gulp from 'gulp'
import chalk from 'chalk'
// @ts-ignore
import { readJsonSync, writeJsonSync } from 'fs-extra'
import merge from 'lodash.merge'
import { ResolvedConfig } from '../config'
import alias from '../plugins/alias'
import inject from '../plugins/inject'

function build(config: ResolvedConfig, source: string, target?: string) {
  config.logger.info(chalk.green('build json ') + chalk.dim('start'), {
    timestamp: true
  })
  target = target || config.build.outDir
  return gulp
    // 指定编译目录
    .src([source, ...config.build.ignore], { nodir: true })
    .pipe(inject(config))
    .on('end', () => {
      config.logger.info(chalk.green('build json ') + chalk.dim('finished'), {
        timestamp: true
      })
    })
    .pipe(gulp.dest(target))
}

function processDist(config: ResolvedConfig, source: string, target?: string) {
  target = target || config.build.outDir
  return gulp.src([source, ...config.build.ignore], { nodir: true })
    .pipe(alias(config.resolve?.alias))
    .pipe(gulp.dest(target))
}

export function jsonTask(config: ResolvedConfig, source?: string) {
  let target = ''
  if (source) {
    target = dirname(source.replace(config.entry, config.build.outDir))
  } else {
    source = `${config.entry}/**/*.json`
  }
  return () => build(config, source!, target)
}

export function jsonDistTask(config: ResolvedConfig, source?: string) {
  let target = ''
  if (!source) {
    source = `${config.build.outDir}/**/*.json`
  } else {
    target = dirname(source)
  }
  return () => processDist(config, source!, target)
}

export function appJsonTask(config: ResolvedConfig) {
  try {
    const srcAppJson = readJsonSync(resolve(config.root, 'src', 'app.json'))
    const outDirAppJson = readJsonSync(resolve(config.root, config.build.outDir, 'app.json'))

    const merged = merge(outDirAppJson, srcAppJson)
    writeJsonSync(resolve(config.root, config.build.outDir, 'app.json'), merged, { spaces: 2 })
  } catch (e) {
    config.logger.error(e)
  }
}
