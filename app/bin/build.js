#!/usr/bin/env node

/*
 * Copyright 2018 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const debug = require('debug')('build'),
      color = require('colors'),
      path = require('path'),
      fs = require('fs'),
      { parseOptions } = require(path.join(__dirname, '../config/options')),
      { parseConfig } = require(path.join(__dirname, '../config/config'))

/**
 * Tell the user where we're at
 *
 */
const task = taskName => console.log('task: '.dim + taskName)

/**
 * Read in index.html
 *
 */
const readIndex = options => new Promise((resolve, reject) => {
    const { templateDir } = options

    debug('read template', templateDir)
    task('read index.html template')

    fs.readFile(path.join(templateDir, 'index.html'), (err, data) => {
        if (err) {
            reject(err)
        } else {
            resolve(data.toString())
        }
    })
})

/**
 * Evaluate macros in the given string, using the given setting of configurations
 *
 */
const evaluateMacros = settings => str => {
    debug('settings', settings)
    task('evaluate macros')

    for (let key in settings) {
        str = str.replace(new RegExp('\\$\\{' + key + '\\}', 'g'), settings[key])
    }

    return str
}

/**
 * Ensure that the buildDir exists
 *
 */
const makeBuildDir = options => new Promise((resolve, reject) => {
    const { buildDir } = options

    fs.mkdir(buildDir, err => {
        if (err && err.code !== 'EEXIST') {
            reject(err)
        } else {
            resolve()
        }
    })
})

/**
 * Write the updated index.html
 *
 */
const writeIndex = options => str => new Promise((resolve, reject) => {
    const { appName, buildDir } = options

    task('write index.html')

    fs.writeFile(path.join(buildDir, 'index.html'), str, err => {
        if (err) {
            reject(err)
        } else {
            resolve()
        }
    })
})

/**
 * Stash the chosen configuration settings to the buildDir, and update
 * the app/package.json so that the productName field reflects the
 * chosen setting
 *
 */
const writeConfig = (options, settings) => new Promise((resolve, reject) => {
    const { buildDir } = options

    task('write config')

    fs.writeFile(path.join(buildDir, 'config.json'), JSON.stringify(settings, undefined, 4), err => {
        if (err) {
            reject(err)
        } else {
            task('write package.json')

            const topLevel = require(path.join(__dirname, '../package.json')),
                  packageJson = Object.assign({}, topLevel, settings)

            fs.writeFile(path.join(buildDir, 'package.json'), JSON.stringify(packageJson, undefined, 4), err => {
                if (err) {
                    reject(err)
                } else {
                    resolve()
                }
            })
        }
    })
})

/**
 * Do a build
 *
 */
const doBuild = (options, settings) => () => Promise.all([ writeConfig(options, settings),
                                                           readIndex(options)
                                                           .then(evaluateMacros(settings))
                                                           .then(writeIndex(options))
                                                         ])

/**
 * Either project out a field of the configuration settings, or do a build
 *
 */
const doWork = (options, settings) => {
    if (options.get) {
        if (settings[options.get]) {
            // we were asked only to respond with a projection of the config settings
            debug('projecting', options.get, settings[options.get])
            return Promise.resolve(settings[options.get])
        }

        return Promise.reject('error: '.red + 'requested field ' + options.get.blue + ' not found in config file')
    }

    return makeBuildDir(options)
        .then(doBuild(options, settings))
        .then(() => 'ok:'.green + ' build successful')
}

/**
 * Build index.html
 *
 */
const buildIndex = parseOptions()                          // read options
      .then(options => parseConfig(options)                // read chosen configuration settings
            .then(settings => doWork(options, settings)))  // either project out a setting, or do a build

      .then(console.log)
      .catch(err => {
          console.error(err)
          process.exit(1)
      })
