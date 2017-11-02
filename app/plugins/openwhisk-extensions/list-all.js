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
const doList = (block, nextBlock, fullArgv, _, command) => {
    const options = command.substring(command.indexOf('list') + 1),
          list = type => repl.qexec(`wsk ${type} list ${options}`)

    return Promise.all(types.map(list)).then(flatten)
}

/**
 * Here is the module
 *
 */
module.exports = (commandTree, require) => {
    commandTree.listen(`/wsk/list`, doList, { docs: `List entities in the current namespace` })
}
