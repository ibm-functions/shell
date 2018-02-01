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

const debug = require('debug')('plugin commands')
debug('loading')

const fs = require('fs-extra'),
      path = require('path'),
      { success } = require('./util')

debug('finished loading modules')

/**
 * Format usage message
 *
 */
const usage = `List commands offered by a previously installed shell plugin

\tplugin commands <plugin>`

const doList = (_a, _b, fullArgv, modules, rawCommandString, _2, argvWithoutOptions, dashOptions) => {
    const { app } = require('electron').remote
    const prescanned = path.join(app.getPath('userData'), 'plugins', '.pre-scanned')

    const plugin = argvWithoutOptions[argvWithoutOptions.indexOf('commands') + 1]

    if (dashOptions['help'] || !plugin) {
        throw new modules.errors.usage(usage)
    }

    return fs.readFile(prescanned)
        .then(JSON.parse)
        .then(({commandToPlugin, flat}) => {
            const commands = [],
                  pluginIsInstalled = flat.find(({route}) => route === plugin)

            if (!pluginIsInstalled) {
                const err = new Error(`Plugin ${plugin} is not installed`)
                err.code = 404
                throw err
            }

            for (let command in commandToPlugin) {
                const hostingPlugin = commandToPlugin[command]
                if (hostingPlugin === plugin) {
                    commands.push(command)
                }
            }
            return commands
        })
        .then(commands => success(false, `offered by the ${plugin} plugin`, commands))
}

module.exports = (commandTree, prequire) => {
    commandTree.listen('/plugin/commands', doList, { docs: 'List commands offered by an installed shell plugin' })
}
