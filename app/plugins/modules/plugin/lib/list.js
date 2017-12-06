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

/**
 * Format usage message
 *
 */
const usage = `List installed shell plugins

\tplugin list`

const doList = (_a, _b, fullArgv, modules, rawCommandString, _2, argvWithoutOptions, dashOptions) => {
    if (dashOptions['help']) {
        throw new modules.errors.usage(usage)
    }

    const path = require('path')
    const fs = require('fs-extra')
    const { app } = require('electron').remote
    const pluginHome = path.join(app.getPath('userData'), 'plugins', 'modules')

    if (fs.pathExistsSync(pluginHome)) {
        const dirs = fs.readdirSync(pluginHome)
        if (dirs.length > 0)
            return dirs.join('\n')
    }
    return 'no plugin installed.'
}

module.exports = (commandTree, prequire) => {
    commandTree.listen('/plugin/list', doList, { docs: 'List install shell plugins' })
}
