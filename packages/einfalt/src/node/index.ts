export * from './config'
export { createServer } from './server'
export { createLogger } from './logger'
export { normalizePath } from './utils'

// additional types
export type {
  EinfaltDevServer,
  ServerOptions
} from './server'
export type {
  BuildOptions,
  ResolvedBuildOptions
} from './build'

export type {
  Logger,
  LogOptions,
  LogLevel,
  LogType,
  LoggerOptions
} from './logger'
export type {
  AliasOptions,
  Alias
} from './plugins/alias'
export type {
  ComponentsOptions,
  ComponentResolver
} from './plugins/components'
export type {
  SpacingOptions
} from './plugins/spacing'
export type {
  Additional,
  AdditionalOption
} from './plugins/inject'
