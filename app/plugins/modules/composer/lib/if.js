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
      { fetch, create, update, moveAside } = require('./composer')

/**
 * Format usage message
 *
 */
const usage = () => 'Usage: if <condition> then <task> [else <elseTask>], where condition returns {value:true|false}'

/**
 * Here is the await-app module entry point. Here we register command
 * handlers.
 *
 */
module.exports = (commandTree, prequire) => {
    const wsk = prequire('/ui/commands/openwhisk-core'),
          type = 'if-then'

    const iffy = cmd => function(_1, _2, _a, _3, fullCommand, execOptions, _args, options) {
        const idx = _args.indexOf(cmd) + 1,
              args = _args.slice(idx),
              conditionName = args[0],
              taskName = args.length === 2 || args.length === 3 && args[1] !== 'then' ? args[1] : args[2], // "if x y/if x y z" versus "if x then y"
              elseTaskName =  (args.length > 3 || args.length === 3 && args[1] !== 'then') && args[args.length - 1], // "if x y z" versus "if x then y else z"
              elsePartOfName = elseTaskName ? `_else_${elseTaskName}` : '',
              name = options.name || `if_${conditionName}_then_${taskName}${elsePartOfName}`

        if (!conditionName || !taskName || !name || options.help) {
            throw new Error(usage())
        }

        const fetches = [fetch(wsk, taskName), fetch(wsk, conditionName)]
        if (elseTaskName) {
            // also fetch the else task!
            fetches.push(fetch(wsk, elseTaskName))
        }

        return Promise.all(fetches)
            .then( ([{fsm:taskFSM}, {fsm:conditionFSM}, elseBits]) => {
                // make the FSM
                const fsm = composer.compile(elseBits ? composer.if(conditionFSM, taskFSM, elseBits.fsm) : composer.if(conditionFSM, taskFSM))

                // we were asked to create a new action for this FSM
                return create({ name, fsm, wsk, commandTree, execOptions, type })
            })
    }

    // Install the routes
    commandTree.intention(`/wsk/app/if`, iffy('if'), { docs: 'Conditionalize the execution of a task' })
}
