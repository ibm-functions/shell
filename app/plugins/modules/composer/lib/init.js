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

const { init, hasUnknownOptions } = require('./composer')

/**
 * Format usage message
 *
 */
const usage = cmd => `Initialize and manage the prerequisite services.

\tapp ${cmd} --url|--auto [--cleanse]

Required parameters:
\t--url      if you have an existing service instance, provide its access URL here; or
\t--auto     provision an instance now [EXPERIMENTAL]

Options:
\t--cleanse  wipe out all session records
\t--reset    add this option if you want to do a forced switch from a previous configuration`

/**
 * Here is the app create module entry point. Here we register command
 * handlers.
 *
 */
module.exports = (commandTree, prequire) => {
    const wsk = prequire('/ui/commands/openwhisk-core')

    const doInit = cmd => function(_1, _2, _a, modules, fullCommand, execOptions, args, options) {
        const idx = args.indexOf(cmd) + 1

        // check for unknown options
        hasUnknownOptions(options, ['h', 'help', 'cleanse', 'auto', 'url', 'reset', 'noping'])

        if (options.help || !(options.auto || options.url)) {
            throw new modules.errors.usage(usage(cmd))
        }

        return init(wsk, options)
            .then(({manager, message}={}) => {
                if (options.cleanse) {
                    console.log('app init cleanse requested')
                    return manager.flush().then(() => ({ message }))
                } else {
                    return { message } 
                }
            })
            .then(({message}) => message || `Successfully initialized${options.cleanse ? ' and reset' : ''} the required services. You may now create compositions.`)
    }

    // Install the routes
    commandTree.listen(`/wsk/app/init`, doInit('init'), { docs: 'Set up the preconditions for creating compositions',
                                                          okOptions: ['url', 'auto' ] // ok to log these options
                                                        })
}
