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

const debug = require('debug')('store')
debug('starting')

const fs = require('fs'),
      path = require('path')

debug('modules loaded')

/**
 * This module implements a simple localStorage layer for headless mode
 *
 */
module.exports = app => {
    debug('init')

    const userData = path.join(app.getPath('userData'), 'ibm-fsh-local-storage.json')

    debug('userData %s', userData)

    try {
        data = JSON.parse(fs.readFileSync(userData))
    } catch (err) {
        if (err.code === 'ENOENT') {
            data = {}
        } else {
            throw err
        }
    }

    debug('parsed userData')

    /**
     * Flush the model to disk
     *
     */
    const flush = () => {
        try {
            debug('flush')
            fs.writeFileSync(userData, JSON.stringify(data))
            debug('flush done')
        } catch (err) {
            console.error(err)
        }
    }

    const self = {
        /**
         * Retrieve an entry from localStorage. The LocalStorage API
         * says to return null if there's no such key, to distinguish
         * from the something being of value `undefined`.
         *
         */
        getItem: key => data[key] || null,
  
        /**
         * Update an entry in localStorage
         *
         */
        setItem: (key, val) => {
            data[key] = val
            flush()
            return val
        },

        /**
         * Remove an entry from localStorage
         *
         */
        removeItem: key => {
            const val = data[key]
            delete data[key]
            flush()
            return val
        }
    }

    debug('init done')
    return self
}
