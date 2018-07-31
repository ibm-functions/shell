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

const debug = require('debug')('preloader')

const path = require('path'),
      { preload } = require(path.join(__dirname, '../preload.json'))

/**
 * This plugin allows for plugins to register themselves to be
 * preloaded at startup, rather than in response to a user command
 *
 */
module.exports = (_, prequire) => {
    if (ui.headless) {
        debug('preloading in headless mode')
        preload.forEach(prequire)

    } else {
        eventBus.on('/window/init', () => {
            //
            // on init, use prequire to load each plugin that desires to
            // be preloaded
            //
            debug('preloading in ui mode')
            preload.forEach(prequire)
        })
    }
}
