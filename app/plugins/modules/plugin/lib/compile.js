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

const debug = require('debug')('plugin-compile'),
      path = require('path'),
      { exec } = require('child_process'),
      { removeSync } = require('fs-extra')

/**
 * Recompile the plugin model
 *
 */
module.exports = (rootDir, pluginHome) => new Promise((resolve, reject) => {
    debug('precompiling plugins')

    // location of the compile.js code
    const compilejsHome = path.join(__dirname, '..', '..', '..', '..', 'bin')

    exec(`node compile.js -d '${rootDir}'`, { cwd: compilejsHome }, (error, stdout, stderr) => {
        removeSync(pluginHome)

        if (error) {
            reject(error)
        } else {
            resolve()
        }
    })
})
