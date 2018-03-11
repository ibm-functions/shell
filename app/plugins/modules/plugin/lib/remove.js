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
debug('loading')

const path = require('path'),
      { remove } = require('fs-extra'),
      { success } = require('./util'),
      { remove:usage } = require('../usage'),
      compile = require('./compile')

debug('finished module imports')

const doRemove = (_a, _b, fullArgv, { ui, errors }, rawCommandString, _2, argvWithoutOptions, dashOptions) => {
    debug('command execution started')

    argvWithoutOptions = argvWithoutOptions.slice(argvWithoutOptions.indexOf('remove') + 1)

    const name = argvWithoutOptions.shift()

    const rootDir = ui.userDataDir()
    const moduleDir = path.join(rootDir, 'plugins', 'modules')
    const pluginHome = path.join(moduleDir, name)

    debug(`remove plugin ${name} in ${pluginHome}`)


    return remove(pluginHome)
        .then(() => compile(rootDir, true, false, true))   // the last true means we want a reverse diff
        .then(removedCommands => success('removed', 'will no be longer available, after reload', removedCommands))
}

module.exports = (commandTree, prequire) => {
    const cmd = commandTree.listen('/plugin/remove', doRemove, { usage })
    commandTree.synonym('/plugin/uninstall', doRemove, cmd)
}

debug('loading done')
