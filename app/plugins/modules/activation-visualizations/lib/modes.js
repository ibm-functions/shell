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
 * Turn an options struct into a cli string
 *
 * @param options is the command line options struct given by the
 * user.
 *
 */
const toString = options => {
    let str = ''
    for (let key in options) {
        // underscore comes from minimist
        if (key !== '_' && options[key] !== undefined) {
            const dash = key.length === 1 ? '-' : '--',
                  value = options[key] === true || options[key] === false ? '' : ` ${options[key]}`
            str = `${str} ${dash}${key}${value}`
        }
    }

    return str
}

/**
 * Create a view mode.
 *
 * @param mode the name of the view mode, a string
 * @param options is the command line options struct given by the
 * user.
 *
 */
const mode = mode => options => ({
    mode,
    direct: entity => repl.qexec(`${mode} ${toString(Object.assign({}, { name: entity && entity.name }, options))}`)
})

/**
 * The view modes. Change this whenever a new view mode is added to the tool.
 *
 */
const modes = [
    mode('table'),
    mode('timeline'),
    mode('grid')
]

/**
 * Return a view mode model, crafted for the given default mode, and
 * any command line options the user might have passed in.
 *
 */
exports.modes = (defaultMode, options) => modes.map(_ => _(options)).map(_ => {
    if (_.mode === defaultMode) {
        return Object.assign({defaultMode: true}, _)
    } else {
        return _
    }
})
