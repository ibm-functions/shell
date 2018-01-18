/*
 * Copyright 2017 IBM Corporation
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

const debug = require('debug')('plugins')

const fs = require('fs-extra'),
      path = require('path'),
      events = require('events'),
      mkdirp = require('mkdirp-promise'),
      { exec } = require('child_process'),
      TMP = 'plugins'  // we'll stash the original plugins here

debug('modules loaded')

global.plugins = require(path.join(__dirname, '../../../../content/js/plugins'))
global.localStorage = { getItem: () => '{}' }
global.eventBus = new events.EventEmitter()
global.ui = {
    startsWithVowel: () => false
}

debug('bootstrap done')

/**
 * Write the plugin list to the .pre-scanned file in app/plugins/.pre-scanned
 *
 */
const writeToFile = (dir, modules) => new Promise((resolve, reject) => {
    fs.writeFile(path.join(dir, '.pre-scanned'),
                 JSON.stringify(modules, undefined, 4),
                 err => {
                     if (err) reject(err)
                     else resolve()
                 })
})

/**
 * Uglify the javascript
 *
 */
const uglify = modules => modules.flat.map(module => new Promise((resolve, reject) => {
    if (!process.env.UGLIFY) resolve()
    debug('uglify %s', module.path)

    const src = path.join(__dirname, '..', '..', '..', module.path),
          target = src, // we'll copy it aside, and overwrite the original
          tmpPath = path.join(TMP, module.path),
          tmpDir = path.join(tmpPath, '..') // we want the name of the enclosing directory

    //console.log(`uglifying ${module.route} ${src}`)

    mkdirp(tmpDir)
        .then(() => fs.copy(src, tmpPath).then(() => tmpPath))
        .then(() => {
            exec(`${path.join(__dirname, '..', 'node_modules', '.bin', 'uglifyjs')} --compress --mangle -o "${target}" -- "${tmpPath}"`,
                 (err, stdout, stderr) => {
                     if (err) reject(err)
                     else resolve()
                 })
        })
        .catch(reject)
}))

/**
 * Generic filesystem scanning routine
 *     Note that, when scanning for plugins, we ignore subdirectories named "helpers"
 *
 */
const readDirRecursively = dir => path.basename(dir) !== 'helpers' && path.basename(dir) !== 'node_modules' && fs.statSync(dir).isDirectory()
      ? Array.prototype.concat(...fs.readdirSync(dir).map(f => readDirRecursively(path.join(dir, f))))
      : dir


module.exports = (rootDir, externalOnly, cleanup = false) => new Promise((resolve, reject) => {

    /**
     * assemble the list of plugins, then minify the plugins, if we can,
     * and write the list to the .pre-scanned file
     *
     */
    if (cleanup) {
        // copy the TMP originals back in place
        debug('cleanup')
        Promise.all(require('../../../../content/js/plugins.js').scanForPlugins(TMP)
            .map(pluginJsFile => {
                const pluginRoot = path.join(__dirname, '..', '..', '..', '..'),
                    originalLocation = path.join(pluginRoot, pluginJsFile)
                return fs.copy(pluginJsFile, originalLocation)
            })).then(()=>resolve()).catch(err=>reject(err))

    } else {
        const pluginRoot = path.join(rootDir, 'plugins')       // pluginRoot points to the root of the modules subdir

        debug('rootDir is %s', rootDir)
        debug('pluginRoot is %s', pluginRoot)
        debug('externalOnly is %s', externalOnly)

        return mkdirp(path.join(pluginRoot, 'modules'))
            .then(() => plugins.assemble({ pluginRoot, externalOnly }))
            .then(modules => Object.assign(modules, {
                flat: modules.flat.map(module => Object.assign(module, {
                    // make the paths relative to the root directory
                    path: path.relative(path.join(__dirname, '..', '..', '..'), module.path)
                }))
            }))
            .then(modules => Promise.all([writeToFile(pluginRoot, modules), ...uglify(modules)]))
            .then(()=>resolve()).catch(err=>reject(err))
    }
})
