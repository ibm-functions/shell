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

const debug = require('debug')('plugin')

const path = require('path'),
      fs = require('fs-extra'),
      { exec } = require('child_process'),
      compile = require('./compile'),
      { success } = require('./util')

/**
 * Format usage message
 *
 */
const usage = `Install shell plugin

\tplugin install <plugin-name>`

const doInstall = (_a, _b, fullArgv, modules, rawCommandString, _2, argvWithoutOptions, dashOptions) => {
    argvWithoutOptions = argvWithoutOptions.slice(argvWithoutOptions.indexOf('install') + 1)

    const name = argvWithoutOptions.shift()
    if (!name || dashOptions['help']) {
        throw new modules.errors.usage(usage)
    }

    const { app } = require('electron').remote
    const rootDir = path.join(app.getPath('userData'))
    const moduleDir = path.join(rootDir, 'plugins', 'modules')
    const pluginHome = path.join(moduleDir, `${name}-tmp`)

    fs.mkdirpSync(pluginHome)

    debug(`install plugin ${name} in ${pluginHome}`)

    return new Promise((resolve, reject) => {
        exec('npm init -y', { cwd: pluginHome }, (error, stdout, stderr) => {
            if (error) {
                fs.removeSync(pluginHome)
                return reject(error)
            }

            exec(`npm install ${name} --prod --no-save --no-shrinkwrap`, { cwd: pluginHome }, (error, stdout, stderr) => {
                if (error) {
                    fs.removeSync(pluginHome)
                    return reject(error)
                }

                fs.rename(path.join(pluginHome, 'node_modules', name), path.join(moduleDir, name), err => {
                    if (error) {
                        fs.removeSync(pluginHome)
                        return reject(error)
                    }

                    fs.rename(path.join(pluginHome, 'node_modules'), path.join(moduleDir, name, 'node_modules'), err => {
                        if (error) {
                            fs.removeSync(pluginHome)
                            return reject(error)
                        }

                        // recompile the plugin model
                        compile(rootDir, true)
                            .then(() => fs.removeSync(pluginHome))
                            .then(() => resolve(success('installed')))
                            .catch(reject)
                    })
                })
            })
        })
    })
}

module.exports = (commandTree, prequire) => {
    commandTree.listen('/plugin/install', doInstall, { docs: 'Install a Shell plugin' })
}
