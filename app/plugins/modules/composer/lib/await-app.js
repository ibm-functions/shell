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

const debug = require('debug')('composer:session_get')
debug('loading')

const { session_get:usage } = require('./usage'),
      messages = require('./messages.json')

debug('finished loading modules')

const viewName = 'session',              // for back button and sidecar header labels
      viewNameLong = 'App Visualization',//    ... long form
      defaultMode = 'visualization'      // on open, which view mode should be selected?

/**
 * Format the given activation record for display as a session
 *
 */
const formatSessionResponse = projection => activation => {
    activation.prettyType = 'sessions'

    // entity onclick handler
    activation.onclick = () => repl.pexec(`app get "/${path}"`)

    // add our visualization view mode
    if (!activation.modes) activation.modes = []
    activation.modes.find(({mode}) => mode === 'logs').label = 'trace'

    const path = activation.annotations.find(({key}) => key === 'path').value

    activation.modes.push({
        mode: defaultMode,
        label: 'Session Flow',
        direct: entity => repl.pexec(`session flow ${activation.activationId}`)
    })

    return activation
}

/**
 * This is the command handler for await-app
 *
 */
const await = (wsk, cmd, projection) => (_a, _b, argv_full, modules, _1, _2, argvNoOptions, commandLineOptions) => new Promise((resolve, reject) => {
    let sessionId = argvNoOptions[argvNoOptions.indexOf(cmd) + 1]

    if (typeof sessionId === 'number') {
        // see https://github.com/ibm-functions/shell/issues/284
        // minimist bug: it auto-converts numeric-looking strings
        // into Numbers! thus all-numeric uuids become javascript
        // Numbers :(

        // the solution is to scan the original (before minimist
        // mucked things up) argv_full, looking for an arg that is
        // ==, but not === the one that minimist gave us.
        // THUS NOTE THE USE OF == in `arg == options.name` <-- important
        sessionId = argv_full.find(arg => arg == sessionId && arg !== sessionId)
    }
    debug('session get', sessionId)

    if (commandLineOptions.last || commandLineOptions['last-failed']) {
        //
        // then the user is asking for the last session; if last===true, this means the user didn't specify a name filter,
        // and rather just wants the last of any name
        //
        const errorOnly = !!commandLineOptions['last-failed'],
              lastWhat = commandLineOptions.last || commandLineOptions['last-failed']  // true means last; string means last of a certain name

        if (commandLineOptions.last && commandLineOptions['last-failed']) {
            // quick sanity check: did the user ask for both??
            return reject(messages.errors.lastAndLastFailed)
        }

        // overfetch, because the backend model is not sorted
        repl.qexec(`session list --limit ${commandLineOptions.limit||200} ${commandLineOptions.skip!==undefined ? '--skip ' + commandLineOptions.skip : ''} ${lastWhat === true ? '' : '--name ' + lastWhat}`)
            .then(A => {
                if (A && A.length > 0) {
                    const idx = !errorOnly ? 0 : A.findIndex(_ => _.statusCode !== 0)
                    if (idx < 0) {
                        throw new Error('No such session found')
                    } else {
                        return repl.qexec(`session ${cmd} ${A[idx].sessionId} ${commandLineOptions.cli ? '--cli' : ''}`)
                    }
                }
            })
            .then(session => {
                // did we find something?
                if (!session) {
                    // nope :(
                    reject('No matching session found')
                } else {
                    // yay, we found something!
                    resolve(session)
                }
            })
            .catch(reject) // oops!
    } else {
        //
        // then the user is asking for a specific session
        //
        if (!sessionId) {
            reject(new modules.errors.usage(usage(cmd)))
        } else {
            repl.qexec(`wsk activation get ${sessionId}`)
                .then(activation => {
                    if (projection) {
                        resolve(projection(activation))
                    } else {
                        resolve(activation)
                    }
                }).catch(reject)
        }
    }
})

/**
 * Here is the await-app module entry point. Here we register command
 * handlers.
 *
 */
module.exports = (commandTree, prequire) => {
    const wsk = prequire('/ui/commands/openwhisk-core'),
          rawGet = commandTree.find('/wsk/activation/get').$

    // this one is mostly session get, but designed for internal consumption as an internal repl API
    commandTree.listen(`/wsk/app/await-app`, await(wsk, 'await-app'), { hide: true })

    // session get
    const sessionGet =  await(wsk, 'get')
    commandTree.listen(`/wsk/session/get`, sessionGet, { usage: usage('get'),
                                                         needsUI: true,
                                                         viewName,
                                                         fullscreen: true, width: 800, height: 600,
                                                         clearREPLOnLoad: true,
                                                         placeholder: 'Fetching session results...' })

    wsk.synonyms('activations').forEach(syn => {
        commandTree.listen(`/wsk/${syn}/get`, function() {
            if (!rawGet) {
                return Promise.reject()
            }

            return rawGet.apply(undefined, arguments)
                .then(response => {
                    debug('response', response)

                    if (response && response.annotations && response.annotations.find(({key, value}) => key === 'conductor' && value)) {
                        debug('activation is session')
                        return formatSessionResponse()(response)
                    } else {
                        debug('activation is not session')
                        return response
                    }
                })
        })
    })

    // project out just the session result
    commandTree.listen(`/wsk/session/result`, await(wsk, 'result', _ => _.response.result), { usage: usage('result') })
}
