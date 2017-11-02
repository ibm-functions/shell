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
const usage = {
    try: 'Usage: try <task> [catch] <recovery>',
    recover: 'Usage: recover <task> with <recovery>'
}

/**
 * Here is the await-app module entry point. Here we register command
 * handlers.
 *
 */
module.exports = (commandTree, prequire) => {
    const wsk = prequire('/ui/commands/openwhisk-core'),
          type = 'try-catch'

    const Try = cmd => function(_1, _2, _a, _3, fullCommand, execOptions, args, options) {
        const idx = args.indexOf(cmd) + 1,
              taskName = args[idx],
              handlerName = args.length == 4 ? args[idx + 2] : args[idx + 1] // "recover x with y" or "try x catch y", versus "try x y"

        if (!handlerName || !taskName || options.help) {
            throw new Error(usage[cmd])
        }

        return Promise.all([moveAside(wsk, taskName), fetch(wsk, handlerName)])
            .then( ([{entity:task,fsm:taskFSM}, {entity:handler,fsm:handlerFSM}]) => {
                // make the FSM
                const fsm = composer.compile(composer.try(taskFSM, handlerFSM))

                if (options.name) {
                    // we were asked to create a new action for this FSM
                    return create({ name: options.name, fsm, wsk, commandTree, execOptions, type })
                } else {
                    // replace the task entity with the fsm
                    return update({ name: taskName, entity: task, // taking over this entity's name
                                    fsm, wsk, commandTree, execOptions, type })
                }
            })
    }

    // Install the routes
    //wsk.synonyms('actions').forEach(syn => {
    //commandTree.intention(`/wsk/${syn}/try`, Try, { docs: '' })
    //})
    commandTree.intention(`/wsk/app/try`, Try('try'), { docs: '' })
    commandTree.intention(`/wsk/app/recover`, Try('recover'), { docs: '' })
}
