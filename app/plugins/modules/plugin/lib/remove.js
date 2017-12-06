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

const path = require('path'),
      { remove } = require('fs-extra'),
      { success } = require('./util'),
      compile = require('./compile')

/**
 * Format usage message
 *
 */
const usage = `Remove installed shell plugin

\tplugin remove <plugin-name>`

const doRemove = (_a, _b, fullArgv, modules, rawCommandString, _2, argvWithoutOptions, dashOptions) => {
    argvWithoutOptions = argvWithoutOptions.slice(argvWithoutOptions.indexOf('remove') + 1)

    const name = argvWithoutOptions.shift()
    if (!name || dashOptions['help']) {
        throw new modules.errors.usage(usage)
    }

    const { app } = require('electron').remote
    const rootDir = path.join(app.getPath('userData'))
    const moduleDir = path.join(rootDir, 'plugins', 'modules')
    const pluginHome = path.join(moduleDir, name)

    debug(`remove plugin ${name} in ${pluginHome}`)


    return remove(pluginHome)
        .then(() => compile(rootDir, true))
        .then(() => success('removed'))
}

module.exports = (commandTree, prequire) => {
    commandTree.listen('/plugin/remove', doRemove, { docs: 'Remove installed shell plugin' })
}
