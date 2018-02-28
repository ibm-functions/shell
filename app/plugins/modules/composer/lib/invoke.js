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
 * Usage message
 *
 */
const usageMessage = {
    invoke: {
        title: 'Invoke an OpenWhisk composition',
        header: 'Invoke a given app and wait for its completion',
        example: 'app invoke <name> [-p key value]*',
        required: [{ name: 'name', docs: 'the name of your new app' }],
        optional: [{ name: '-p|--param key value', docs: 'bind a variable to a value' },
                   { name: '-P|--param-file file', docs: 'read variable bindings from a JSON file' }],
        related: ['app async', 'app create', 'app get', 'app list']
    },

    async: {
        title: 'Async an OpenWhisk composition',
        header: 'Invoke a given app asynchronously, and return a session id',
        example: 'app async <name> [-p key value]*',
        required: [{ name: 'name', docs: 'the name of your new app' }],
        related: ['app create', 'app get', 'app invoke', 'app list']
    }
}

const usage = cmd => usageMessage[cmd]

/**
 * Here is the app invoke entry point. Here we register command
 * handlers.
 *
 * We delegate to action invoke.
 *
 */
module.exports = (commandTree, prequire) => {

    /** cmd is either 'invoke' or 'async' */
    const doInvoke = cmd => function(_1, _2, args, { errors }, _4, _5, argvWithoutOptions, options) {
        const delegate = commandTree.find(`/wsk/action/${cmd}`).$

        const idx = args.indexOf('app')
        args[idx] = 'action'
        args[idx + 1] = cmd

        const name = argvWithoutOptions[argvWithoutOptions.indexOf(cmd) + 1]

        if (!name || options.help) {
            throw new errors.usage(usage(cmd))
        } else {
            return delegate.apply(undefined, arguments)
                .then(activation => activation.message || activation)   // message if change-context wrapper
                .then(activation => {
                    if (cmd === 'invoke' && ui.headless) {
                        // in headless mode, print just the result
                        return activation.response.result
                    } else if (cmd === 'async') {
                        activation.verb = 'invoke'
                        activation.sessionId = activation.activationId
                        if (!activation.name && activation.entity) activation.name = activation.entity.name
                        return activation
                    } else {
                        return repl.qfexec(`session get ${activation.activationId}`)
                    }
                })
        }
    }

    commandTree.listen(`/wsk/app/invoke`, doInvoke('invoke'), { docs: 'Synchronously invoke a Composer application and wait for its completion' })
    commandTree.listen(`/wsk/app/async`, doInvoke('async'), { docs: 'Asynchronously invoke a Composer application' })
}
