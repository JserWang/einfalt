#!/usr/bin/env node
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-var-requires */

const path = require('path')
const fs = require('fs-extra')

;(async() => {
  const templates = fs
    .readdirSync(__dirname)
    .filter(d => d.startsWith('template-'))
  for (const t of templates) {
    const pkgPath = path.join(__dirname, t, 'package.json')
    const pkg = require(pkgPath)
    pkg.devDependencies.einfalt = `^${require('../einfalt/package.json').version}`

    fs.writeJSONSync(pkgPath, pkg, { spaces: 2 })
  }
})()
