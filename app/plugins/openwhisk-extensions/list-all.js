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
 * This plugin introduces /wsk/list, which lists entities across all entity types.
 *
 */

const minimist = require('minimist'),
      types = ['actions', 'packages', 'triggers', 'rules' ]

/**
 * Flatten an array of arrays
 *
 */
const flatten = arrays => [].concat.apply([], arrays);

/**
 * The command handler
 *
 */
const doList = (_1, _2, _3, { errors }, _5, _6, args, options) => {
    if (options.help) {
        throw new errors.usage(`List all entities in the current namespace

    wsk list`)
    } else if (Object.keys(options).length > 3 || (Object.keys(options).length > 1 && !options.help)) {
        // minimist always adds options._, and repl will add both
        // options.help and options.h if either is specified
        throw new errors.usage(`This command accepts no optional arguments`)
    } else if (args.length - args.indexOf('list') > 1) {
        throw new errors.usage(`This command accepts no positional arguments`)
    }

    const list = type => repl.qexec(`wsk ${type} list`)

    return Promise.all(types.map(list)).then(flatten)
}

/**
 * Here is the module
 *
 */
module.exports = (commandTree, require) => {
    commandTree.listen(`/wsk/list`, doList, { docs: 'List all entities in the current namespace' })
}
