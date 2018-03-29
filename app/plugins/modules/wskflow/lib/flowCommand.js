/*
 * Copyright 2018 IBM Corporation
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

const debug = require('debug')('wskflow flow command')
debug('loading')

const PromisePool = require('es6-promise-pool'),
      usage = require('../usage'),
      path = require('path'),
      visualize = require('./visualize'),
      { zoomToFitButtons } = require(path.join(__dirname, '../../composer/lib/composer'))

const viewName = 'session flow'

debug('finished loading modules')

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
 * Fetch the action itself, so we have the FSM
 *
 */
const fetchTheAction = session => {
    const path = session.annotations.find(({key}) => key === 'path').value

    return repl.qexec(`wsk action get "/${path}"`)
        .catch(err => {
            console.error('action get call incomplete due to error', path, err.message);
            return { wskflowErr: err }
        })
}

/**
 * Fetch the rest of the activations in the trace; fetch at most 2 at a time
 *
 */
const generatePromises = activation => function *() { // generator function
    for (let idx = 0; idx < activation.logs.length; idx++) {
        yield get(activation.logs[idx]) // yield generates one value
    }
}
// by default, PromisePool does not return any arguments in then, causing activations to always be undefined 
// use event listeners here to access return data as described in the docs  
const fetchTrace = activation => new Promise((resolve, reject) => {
    const data = [], 
          pool = new PromisePool(generatePromises(activation), 2) // at most 2 at a time, here

    pool.addEventListener('fulfilled', event => data.push(event.data.result))
    pool.addEventListener('rejected', event => data.push(event.data.error))

    pool.start().then(() => resolve(data))
})

module.exports = (commandTree, prequire) => {

    // register the "session flow" command
    commandTree.listen('/wsk/session/flow', (_1, _2, _3, { errors }, _4, _5, args, options) => {
        const sessionId = args[args.indexOf('flow') + 1]
        debug('session flow', sessionId)

        // fetch the session, then fetch the trace (so we can show the flow) and action (to get the FSM)
        return repl.qexec(`session get ${sessionId}`)
            .then(session => Promise.all([session, fetchTrace(session), fetchTheAction(session)]))
            .then(([session, activations, action]) => {

                let fsm;
                if (action.wskflowErr) {
                    // 1) if an app was deleted, the last promise item returns an error
                    const error = new Error(`${viewName} unavailable, as the composition was deleted`);
                    error.code = 404
                    throw error

                } else {
                    // extract the FSM
                    fsm = action.annotations.find(({key}) => key === 'fsm').value
                }

                const {view, controller} = visualize(fsm, undefined, undefined, undefined, activations)


                // set the default mode to session flow
                session.modes.find(({defaultMode}) => defaultMode).defaultMode = false
                session.modes.find(({label}) => label === 'Session Flow').defaultMode = true

                if (!session.modes.find(({label}) => label === '1:1')) {
                    zoomToFitButtons(controller)
                        .forEach(_ => session.modes.push(_))
                }

                return Object.assign(session, {
                    viewName: session.type,
                    type: 'custom',
                    content: view,
                    isEntity: true
                })
            })

    }, { usage: usage.flow })
}
