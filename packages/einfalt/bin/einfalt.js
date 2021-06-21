#!/usr/bin/env node

global.__einfalt_start_time = Date.now()

// check debug mode first before requiring the CLI.
const debugIndex = process.argv.findIndex(arg => /^(?:-d|--debug)$/.test(arg))
const filterIndex = process.argv.findIndex(arg =>
  /^(?:-f|--filter)$/.test(arg)
)

if (debugIndex > 0) {
  let value = process.argv[debugIndex + 1]
  if (!value || value.startsWith('-')) {
    value = 'einfalt:*'
  } else {
    // support debugging multiple flags with comma-separated list
    value = value
      .split(',')
      .map(v => `einfalt:${v}`)
      .join(',')
  }
  process.env.DEBUG = value

  if (filterIndex > 0) {
    const filter = process.argv[filterIndex + 1]
    if (filter && !filter.startsWith('-')) {
      process.env.EF_DEBUG_FILTER = filter
    }
  }
}

function start() {
  require('../dist/node/cli')
}

start()
