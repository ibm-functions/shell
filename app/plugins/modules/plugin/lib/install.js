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

const debug = require('debug')('plugin install')
debug('loading')

const tmp = require('tmp'),
      path = require('path'),
      fs = require('fs-extra'),
      { exec, spawn } = require('child_process'),
      compile = require('./compile'),
      { success } = require('./util')

debug('finished module imports')

/**
 * Format usage message
 *
 */
const usage = `Install shell plugin

\tplugin install <plugin-name>`

const doInstall = (_a, _b, fullArgv, { ui, errors }, rawCommandString, _2, argvWithoutOptions, dashOptions) => {
    debug('command execution started')

    argvWithoutOptions = argvWithoutOptions.slice(argvWithoutOptions.indexOf('install') + 1)

    const name = argvWithoutOptions.shift()
    if (!name || dashOptions['help']) {
        throw new errors.usage(usage)
    }

    const rootDir = ui.userDataDir()
    const moduleDir = path.join(rootDir, 'plugins', 'modules')
    const targetDir = path.join(moduleDir, name)                  // final location of the plugin

    debug(`installing ${name}`)

    // make a staging area for the npm install
    return new Promise((resolve, reject) => {
        tmp.dir((err, pluginHome, cleanupDir) => {
            const cleanup = () => Promise.resolve(true)//fs.remove(pluginHome)//.then(cleanupDir, cleanupDir)
            const fail = err => {
                debug(err)
                return cleanup().then(() => reject(err)).catch(reject)
            }

            if (err) {
                fail(err)
            } else {
                debug(`install plugin ${name} in ${pluginHome}`)

                exec('npm init -y', { cwd: pluginHome }, (error, stdout, stderr) => {
                    if (error) {
                        return fail(error)
                    }

                    if (stderr.length > 0) {
                        debug(stderr)
                    }
                    if (stdout.length > 0) {
                        debug(stdout)
                    }

                    const sub = spawn('npm',
                                      ['install', name, '--prod', '--no-save', '--no-shrinkwrap'],
                                      { cwd: pluginHome })

                    if (!sub) {
                        fail('Internal Error')
                    }

                    sub.stderr.on('data', data => {
                        const error = data.toString()
                        if (error.indexOf('code E404') >= 0) {
                            // the user tried to install a plugin which
                            // doesn't exist in the npm registry
                            sub.kill()
                            return reject(`The plugin ${name} does not exist`)
                        } else if (error.indexOf('ERR') >= 0) {
                            // some other error we don't know about
                            return reject(error)
                        } else {
                            debug(error)
                        }
                    })

                    sub.stdout.on('data', data => {
                        debug(data.toString())
                    })

                    sub.on('close', code => {
                        debug('npm install done')

                        if (code !== 0) {
                            reject()
                        } else {
                            //
                            // NOTE: fs.move doesn't work on linux; fs-extra seems to do hard links?? hence the use of fs.copy
                            //
                            return fs.ensureDir(targetDir)
                                .then(() => fs.copy(path.join(pluginHome, 'node_modules', name), targetDir))
                                .then(() => fs.copy(path.join(pluginHome, 'node_modules'), path.join(targetDir, 'node_modules')))
                                .then(() => Promise.all([compile(rootDir, true), cleanup()]))  // recompile the plugin model
                                .then(([newCommands]) => success('installed',
                                                                 'will be available, after reload',
                                                                 newCommands))
                                .then(resolve)
                                .catch(fail)
                        }
                    })
                })
            }
        })
    })
}

module.exports = (commandTree, prequire) => {
    commandTree.listen('/plugin/install', doInstall, { docs: 'Install a Shell plugin' })
}

debug('loading done')
