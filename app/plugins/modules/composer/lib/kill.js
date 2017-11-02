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


const composer = require('./composer')

const usage = {
    kill: `Kill a live session.

\tsession kill <sessionId>`,

    purge: `Purge the stored state for a completed session.

\tsession purge <sessionId>`
}

/**
 * Here is the app kill entry point. Here we register command
 * handlers.
 *
 */
module.exports = (commandTree, prequire) => {
    const wsk = prequire('/ui/commands/openwhisk-core')

    /** command handler */
    const doIt = (cmd, operation) => (_1, _2, _a, modules, fullCommand, execOptions, args, options) => {
        const idx = args.indexOf(cmd),
              sessionId = args[idx + 1]

        if (!sessionId || options.help || !composer.isValidSessionId(sessionId)) {
            throw new modules.errors.usage(usage[cmd])
        }

        return operation(sessionId)
    }

    commandTree.listen(`/wsk/session/kill`, doIt('kill', composer.kill(wsk)), { docs: 'Terminate the execution of a given Composer session' })
    commandTree.listen(`/wsk/session/purge`, doIt('purge', composer.purge(wsk)), { docs: 'Clean up any leftover state from a given Composer session' })
}
