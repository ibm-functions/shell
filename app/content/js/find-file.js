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

const debug = require('debug')('find-file')
debug('loading')

/**
 * Maybe the given filepath is asar-relative, as indicated by a
 * leading @ character?
 *
 */
const specialPaths = [] // any special paths added via self.addPath
const defaultSpecial = { filepath: require('path').join(__dirname, '..') } // default special is the app/ top-level

exports.findFile = (filepath, safe) => {
    if (!filepath) {
        if (!safe) {
            throw new Error('Please specify a file')
        } else {
            // caller asked us to play nice
            return ''
        }
    } else if (filepath.charAt(0) === '@') {
        // ui.js is in the /app/build directory
        // the === '.' part handles the case where the call was e.g. ui.findFile('@demos'), i.e. the special dir itself
        const desiredPrefix = require('path').dirname(filepath) === '.' ? filepath : require('path').dirname(filepath)
        const special = specialPaths.find(({prefix}) => desiredPrefix.indexOf(prefix) === 0) || defaultSpecial

        debug('resolving @ file', filepath, desiredPrefix, special)
        return require('path').join(special.filepath, filepath)

    } else {
        debug('resolving normal file')
        return require('expand-home-dir')(filepath)
    }
}

/**
 * Augment the module load path
 *
 */
exports.addPath = filepath => {
    const path = require('path')

    // use app-module-path to augment the node module require path
    require('app-module-path').addPath(path.resolve(filepath))

    debug('addPath', filepath)

    // remember this for self.findFile
    const prefix = path.basename(filepath)
    if (prefix.charAt(0) === '@') {
        specialPaths.push({ prefix , filepath: path.dirname(filepath) })
    }
}
