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

const { init } = require('./composer'),
      messages = require('./messages.json'),
      parseDuration = require('parse-duration')

debug('finished loading modules')

const viewName = 'session',              // for back button and sidecar header labels
      viewNameLong = 'App Visualization',//    ... long form
      defaultMode = 'visualization'      // on open, which view mode should be selected?

/**
 * Usage message
 *
 */
const usageMessage = {
    get: `Display the full details of a session. (Hint: use session result to see only the return value)`,
    result: `Display the return value of a session. (Hint: use session get to see the full details)`
}
const flags = cmd => cmd==='get' && ui.headless ? '\n\t--cli                    display the results textually; by default, the graphical shell will open' : ''
const usage = cmd => `${usageMessage[cmd]}

\tsession ${cmd} <sessionId>|--last [name]

Required parameters:
\tsessionId                a session id; or
\t--last [appName]         show the last session; optionally the last session of the given app name
\t--last-failed [appName]  ibid, except the last failed session

Options:
\t--skip S                 skip over S sessions
\t--timeout 3s|5m|...      wait no more than a specified duration for the session results${flags(cmd)}`

/**
 * Get an activation
 *
 */
const get = activationId => new Promise((resolve, reject) => {
    const once = retryCount => repl.qexec(`wsk activation get ${activationId}`)
          .then(resolve)
          .catch(err => {
              if (err && err.statusCode === 404 && retryCount < 10) {
                  setTimeout(() => once(retryCount + 1), 100)
              } else {
                  reject(err)
              }
          });
    once(0)
})

/**
 * This is the command handler for await-app
 *
 */
const await = (wsk, cmd, projection) => (_a, _b, argv_full, modules, _1, _2, argvNoOptions, commandLineOptions) => new Promise((resolve, reject) => init(wsk, {noping: true}).then(({manager}) => {
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

    // parseDuration expects a string, and returns millis; we must be
    // aware that manager.get expects a value unit of seconds; the default is 30 seconds
    const defaultTimeout = 30
    const timeout = commandLineOptions.timeout ? parseDuration(commandLineOptions.timeout.toString()) / 1000 : defaultTimeout

    /** poll once for completion */
    const poll = iter => {
        if (iter > 100) {
            reject('Timeout waiting for composer application to finish')
        } else {
            manager.get(sessionId, timeout, true)
                .then(activation => {
                    if (projection) {
                        return resolve(projection(activation))
                    }

                    // entity onclick handler
                    activation.onclick = () => repl.pexec(`app get ${name}`)

                    // add our visualization view mode
                    if (!activation.modes) activation.modes = []
                    activation.modes.find(({mode}) => mode === 'logs').label = 'trace'

                    const path = activation.annotations.find(({key}) => key === 'path').value

                    const theActionItself = new Promise((resolve, reject) => { // fetch the action itself, so we have the FSM
                        repl.qexec(`wsk action get "/${path}"`).then(data => {
                            debug('action get call complete');
                            resolve(data);
                        }).catch(e => {
                            console.error('action get call complete - action deleted');
                            resolve({wskflowErr:e});
                        });
                    })

                    const trace = new Promise((resolve, reject) => { // fetch the rest of the activations in the trace
                        Promise.all(activation.logs.map(get)).then(data => {
                            debug('activation get call complete');
                            resolve(data);
                        })
                            .catch(e => {
                                console.error('activation get call complete - error');
                                resolve(e);
                            })
                    })

                    activation.modes.push({
                        mode: defaultMode,
                        label: 'Session Flow',
                        direct: entity => {
                            //
                            // rendering handler for wskflow activation visualization
                            //
                            if (true /*!entity.visualization*/) { // cache it (disabled for now)
                                entity.visualization = Promise.all([trace, theActionItself])
                                    .then(data => {
                                        debug('retrieved all data')
                                        const { visualize } = plugins.require('wskflow'),
                                              activations = data[0],
                                              content = document.createElement('div')

                                        let fsm;
                                        if (data[data.length-1].wskflowErr) {
                                            // 1) if an app was deleted, the last promise item returns an error
                                            console.error('app was deleted');
                                            fsm = 'deleted';

                                        } else {
                                            // 2) show graph
                                            fsm = data[data.length - 1].annotations.find(({key}) => key === 'fsm').value;  // extract the FSM
                                        }

                                        content.style.display = 'none'
                                        document.body.appendChild(content)
                                        visualize(fsm, content, undefined, 1, activations)
                                        content.style.display = ''
                                        content.style.flex = 1
                                        document.body.removeChild(content)

                                        return {
                                            type: 'custom',
                                            content
                                        }
                                    })
                            }

                            return entity.visualization
                        }
                    })

                    resolve(activation)
                })
                .catch(err => {
                    //
                    // hmm... maybe the user is confused and this is a plain activation?
                    //
                    return repl.qexec(`activation get ${sessionId}`)
                        .then(resolve)
                        .catch(err2 => {
                            //
                            // nope, there is truly nothing to be found here
                            //
                            console.error(err)
                            if (typeof err === 'string' && err.endsWith('is still running')) {
                                setTimeout(() => poll(iter + 1), 300)
                            } else if (typeof err == 'string' && err.startsWith('Cannot find trace for session')) {
                                reject('Trace data expired')
                            } else if (err.message && err.message.indexOf('ECONNREFUSED') >= 0) {
                                reject(messages.slowInit)
                            } else {
                                if (typeof err === 'string' && err.indexOf('Cannot find') >= 0) {
                                    // the composer's manager API does
                                    // not nicely wrap this error with
                                    // a status code :(
                                    reject({ code: 404, message: err })
                                } else {
                                    reject(err)
                                }
                            }
                        })
                })
        }
    }

    if (commandLineOptions.help) {
        reject(new modules.errors.usage(usage(cmd)))

    } else if (commandLineOptions.last || commandLineOptions['last-failed']) {
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
                    const idx = !errorOnly ? 0 : A.findIndex(_ => !_.statusCode !== 0)
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
            poll(0)
        }
    }
}))

/**
 * Here is the await-app module entry point. Here we register command
 * handlers.
 *
 */
module.exports = (commandTree, prequire) => {
    const wsk = prequire('/ui/commands/openwhisk-core')

    // Install the routes
    const docs = { docs: 'Show the result of a session' }

    // this one is mostly session get, but designed for internal consumption as an internal repl API
    commandTree.listen(`/wsk/app/await-app`, await(wsk, 'await-app'), { hide: true })

    // session get
    commandTree.listen(`/wsk/session/get`, await(wsk, 'get'), Object.assign({}, docs, { needsUI: true,
                                                                                        viewName,
                                                                                        fullscreen: true, width: 800, height: 600,
                                                                                        clearREPLOnLoad: true,
                                                                                        placeholder: 'Fetching session results...' }))

    // project out just the session result
    commandTree.listen(`/wsk/session/result`, await(wsk, 'result', _ => _.response.result), docs)
}
