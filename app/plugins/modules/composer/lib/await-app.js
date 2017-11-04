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

const { init } = require('./composer'),
      messages = require('./messages.json'),
      parseDuration = require('parse-duration')

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
const await = (wsk, cmd, projection) => (_a, _b, _c, modules, _1, _2, argvNoOptions, commandLineOptions) => new Promise((resolve, reject) => init(wsk, {noping: true}).then(({manager}) => {
    const sessionId = argvNoOptions[argvNoOptions.indexOf(cmd) + 1]

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
                .then(result => manager.trace(sessionId)
                      .then( ({trace}) => ({result, trace})))
                .then(({result, trace}) => {
                    // we're done! let's update the name, to hide the conductor

                    // fake it till we make it: we invoked the
                    // conductor to get the result, but would like
                    // to display the name of the invoked app
                    //const { activationId, name } = splitNamedSession(sessionId)
                    const activationId = sessionId

                    // now fetch the last activation, so we have the duration
                    Promise.all([get(trace[0]), get(trace[trace.length - 1])])
                        .then(([firstOne, lastOne]) => {
                            const name = commandLineOptions.name,
                                  path = [{key:'path', value: commandLineOptions.path}] // mimic a path annotation

                            let namePromise = name ? Promise.resolve({name,path})      // then the user invoked from the shell, and we have the name
                                : !firstOne.cause ? Promise.resolve({firstOne})        // bad: we have no way of getting the name
                                : repl.qexec(`wsk activation get ${firstOne.cause}`)   // then the user is doing a session get, we need to fetch the name

                            namePromise.then(namedActivation => {
                                const $get = Object.assign({}, lastOne)

                                $get.originalActivationId = $get.activationId
                                $get.activationId = sessionId
                                $get.response.success = result.error ? false : true
                                $get.response.status = $get.response.success ? 'success' : 'failure'
                                $get.response.result = result
                                $get.name = namedActivation.name
                                $get.logs = trace
                                $get.prettyType = viewName

                                // update path annotation
                                const pathAnno = $get.annotations.find(_ => _.key === 'path'),
                                      realAnno = namedActivation && namedActivation.annotations && namedActivation.annotations.find(_ => _.key === 'path')
                                if (pathAnno && realAnno) {
                                    pathAnno.value = realAnno.value
                                }

                                // entity onclick handler
                                $get.onclick = () => repl.pexec(`app get ${name}`)

                                // $get._innerStart = $get.start
                                // $get._innerEnd = $get.end
                                $get.start = firstOne.start
                                $get.end = lastOne.end
                                $get.duration = $get.end - $get.start

                                // add our visualization view mode
                                if (!$get.modes) $get.modes = []
                                $get.modes.find(({mode}) => mode === 'logs').label = 'trace'

                                let theActionItself = new Promise((resolve, reject) => { // fetch the action itself, so we have the FSM
                                    repl.qexec(`wsk action get ${$get.name}`).then(data => {
                                        console.log('action get call complete');
                                        resolve(data);
                                    }).catch(e => {
                                        console.error('action get call complete - action deleted');
                                        resolve({wskflowErr:e});
                                    });
                                })

                                let theRestOfThem = new Promise((resolve, reject) => { // fetch the rest of the activations in the trace
                                    Promise.all($get.logs.slice(1, $get.logs.length - 1).map(get)).then(data => {
                                        console.log('activation get call complete');
                                        resolve(data);
                                    })
                                    .catch(e => {
                                        console.error('activation get call complete - error');
                                        resolve(e);
                                    })
                                })

                                $get.modes.push({
                                    mode: defaultMode,
                                    label: 'Session Flow',
                                    direct: entity => {
                                        //
                                        // rendering handler for wskflow activation visualization
                                        //
                                        if (true /*!entity.visualization*/) { // cache it (disabled for now)
                                           entity.visualization = Promise.all([firstOne, theRestOfThem, lastOne, theActionItself])
                                                .then(data => {

                                                    console.log('retrieved all data')
                                                    const {visualize} = plugins.require('wskflow'),
                                                        activations = [].concat(data[0], data[1], data[2]),
                                                        content = document.createElement('div');

                                                    let fsm;
                                                    // 1) if an app was deleted, the last promise item returns an error
                                                    if(data[data.length-1].wskflowErr){
                                                        console.error('app was deleted');
                                                        fsm = 'deleted';

                                                    }
                                                    // 2) if an older version app generated this session 
                                                    else if(namedActivation.version && data[data.length-1].version != namedActivation.version){
                                                        console.error('session was generated by an older version app');
                                                        fsm = `outdated ${data[data.length-1].version} ${namedActivation.version}`; // 'outdated appV sessionV'
                                                    }
                                                    // 3) show graph  
                                                    else{                                                       
                                                        fsm = data[data.length - 1].annotations.find(({key}) => key === 'fsm').value;  // extract the FSM
                                                    }

                                                    content.style.display = 'none'
                                                    document.body.appendChild(content)
                                                    visualize(fsm, content, undefined, 1, activations)
                                                    content.style.display = ''
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

                                if (projection) {
                                    resolve(projection($get))
                                } else {
                                    resolve($get)
                                }
                            })
                        })
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
                                reject(err)
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
        repl.qexec(`session list --limit ${commandLineOptions.limit||100} ${commandLineOptions.skip!==undefined ? '--skip ' + commandLineOptions.skip : ''} ${lastWhat === true ? '' : '--name ' + lastWhat}`)
            .then(A => {
                if (A && A.length > 0) {
                    if (errorOnly) {
                        // --last-failed: the array is sorted from
                        // latest to earliest, so the default array
                        // find scan does the right thing, here; _
                        // here is a session
                        return Promise.all(A.map(_ => repl.qexec(`session ${cmd} ${_.sessionId}`)))
                            .then(sessions => sessions.find(_ => !_.response.success))
                    } else {
                        // --last
                        return repl.qexec(`session ${cmd} ${A[0].sessionId} ${commandLineOptions.cli ? '--cli' : ''}`)
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
