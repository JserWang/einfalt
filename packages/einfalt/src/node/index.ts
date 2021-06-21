export * from './config'
export { createServer } from './server'
// export { build } from './build'
// export { optimizeDeps } from './optimizer'
// export { send } from './server/send'
export { createLogger } from './logger'
// export { resolvePackageData, resolvePackageEntry } from './plugins/resolve'
export { normalizePath } from './utils'

// additional types
export type {
  EinfaltDevServer,
  ServerOptions
  // CorsOptions,
  // FileSystemServeOptions,
  // CorsOrigin,
  // ServerHook,
  // ResolvedServerOptions
} from './server'
export type {
  BuildOptions,
  // LibraryOptions,
  // LibraryFormats,
  ResolvedBuildOptions
} from './build'
// export type {
//   DepOptimizationMetadata,
//   DepOptimizationOptions
// } from './optimizer'
// export type { Plugin } from './plugin'
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
