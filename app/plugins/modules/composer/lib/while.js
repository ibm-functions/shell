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

const composer = require('@ibm-functions/composer'),
      { fetch, create } = require('./composer')

/**
 * Format usage message
 *
 */
const usage = () => 'Usage: while <condition> [do] <task>, where condition returns {value:true|false}'

/**
 * Here is the await-app module entry point. Here we register command
 * handlers.
 *
 */
module.exports = (commandTree, prequire) => {
    const wsk = prequire('/ui/commands/openwhisk-core'),
          type = 'loop'

    const loop = cmd => function(_1, _2, _a, _3, fullCommand, execOptions, args, options) {
        const idx = args.indexOf(cmd) + 1,
              conditionName = args[idx],
              taskName = args.length === 4 ? args[idx + 2] : args[idx + 1], // "while x do y" versus "while x y"
              name = options.name || `while_${conditionName}_do_${taskName}`

        if (!conditionName || !taskName || !name || options.help) {
            throw new Error(usage())
        }

        return Promise.all([fetch(wsk, taskName), fetch(wsk, conditionName)])
            .then( ([{entity:task,fsm:taskFSM}, {entity:condition,fsm:conditionFSM}]) => {
                // make the FSM
                const fsm = composer.while(conditionFSM, taskFSM)

                // we were asked to create a new action for this FSM
                return create({ name, fsm, wsk, commandTree, execOptions, type })
            })
    }

    // Install the routes
    commandTree.intention(`/wsk/app/while`, loop('while'), { docs: 'Create a composer loop' })
}
