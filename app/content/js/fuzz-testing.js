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



/**
 * For testing, we sometimes want to disable certain features, to
 * validate error handling.
 *
 */

const debug = require('debug')('fuzz testing')
debug('loading')

const nope = filepath => filepath.toString().indexOf('.wskprops') >= 0 || filepath.toString().indexOf('.cf/config.json') >= 0

const fuzzies = {
    noAuth: () => {
        const fs = require('fs'),
              rf = fs.readFile,
              rfs = fs.readFileSync

        fs.readFile = function(filepath, options, cb) {
            if (nope(filepath)) {
                debug('fs.readFile blocked', filepath)
                rf('fjdioafjadisofjadsoifasfsdfjadisfjadisofjasifas', options ? cb : options)
            } else {
                if (!cb) {
                    rf(filepath, options)
                } else {
                    rf(filepath, options, cb)
                }
            }
        }

        fs.readFileSync = function(filepath, options) {
            if (nope(filepath)) {
                console.error(`fs.readFileSync blocked ${filepath}`)
                return rfs('fjdioafjadisofjadsoifasfsdfjadisfjadisofjasifas')
            } else {
                return rfs(filepath, options)
            }
        }
    }
}

module.exports = fuzz => {
    if (typeof fuzz === 'string') {
        fuzz = JSON.parse(fuzz)
    }

    //debug('options', fuzz.rules)

    (fuzz.rules || []).forEach(rule => {
        // intentionally unprotected against failures, because we
        // want the test to fail
        debug('rule', rule)
        fuzzies[rule]()
    })

    return fuzz.prefs
}
