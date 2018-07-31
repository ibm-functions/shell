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

const debug = require('debug')('composer-preload')
debug('loading')

const path = require('path')

/**
 * Listen for drag and drop, and try to show a preview of the
 * composition on drop.
 *
 */
const listenForDrops = () => {
    if (!ui.headless && typeof document !== 'undefined') {
        document.addEventListener('drop', event => {
            const { dataTransfer } = event,
                  { files, items, types } = dataTransfer

            if (files.length === 1) {
                debug('got one dropped file')

                            repl.pexec(`app preview ${files[0].path}`)
                                .catch(err => {
                                    debug('not an app', err)
                                })
            }
        })
    }
}

module.exports = (commandTree, prequire) => {
    // listen for drag and drop
    listenForDrops()

    // give visibility to our @demos directory on the module path
    if (ui.addPath) {
        ui.addPath(path.join(__dirname, '../composer/@demos'))
    }
}
