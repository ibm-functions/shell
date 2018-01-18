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

const debug = require('debug')('plugins'),
      path = require('path'),
      fs = require('fs-extra'),
      util = require('util')

/**
 * Format usage message
 *
 */
const usage = `List installed shell plugins

\tplugin list`

/**
 * Flatten an array of arrays
 *
 */
const flatten = arrays => [].concat.apply([], arrays)

/**
 * Pull out the sub-directories in the given directory, if it is an @-style npm group
 *
 */
const extractNested = root => dir => dir.charAt(0) === '@'
      ? fs.readdir(path.join(root, dir)).then(subdirs => subdirs.map(subdir => `${dir}/${subdir}`))
      : dir // we'll flatten this below

const doList = (_a, _b, fullArgv, modules, rawCommandString, _2, argvWithoutOptions, dashOptions) => {
    if (dashOptions['help']) {
        throw new modules.errors.usage(usage)
    }

    const { app } = require('electron').remote
    const pluginHome = path.join(app.getPath('userData'), 'plugins', 'modules')

    // help the REPL render our records
    const type = 'plugins',
          onclick = false    // no drilldown for now

    return fs.pathExists(pluginHome)
        .then(exists => fs.readdir(pluginHome))
        .then(dirs => Promise.all(dirs.map(extractNested(pluginHome))))
        .then(flatten)
        .then(installedPlugins => {
            console.error(installedPlugins)
            if (installedPlugins.length > 0) {
                return installedPlugins.map(name => ({type, name, onclick}))
            } else {
                return 'no user-installed plugins found'
            }
        })
}

module.exports = (commandTree, prequire) => {
    commandTree.listen('/plugin/list', doList, { docs: 'List install shell plugins' })
}
