#!/usr/bin/env node

const compile = require('../app/plugins/modules/plugin/lib/compile'),
      path = require('path')

if (process.argv[2] === 'cleanup') {
    compile(null, null, true)
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err)
        process.exit(1)
    })
} else {
    // determine the output directory
    const idx = process.argv.findIndex(_ => _ === '-d'),
           externalOnly = idx >= 0
    const rootDir = externalOnly                           // dir points to the final location of .pre-scanned
      ? process.argv[idx + 1]                              //    save the model to the given directory
      : path.join(__dirname, '..', 'app')                         //    save the model to the built-in directory

    compile(rootDir, externalOnly)
      .then(() => process.exit(0))
      .catch(err => {
          console.error(err)
          process.exit(1)
      })
}
