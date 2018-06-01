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
 * This plugin introduces /wsk/activations/await command, which will
 * block until the previous invocation (emanating from the openwhisk
 * shell) completes
 *
 */

const debug = require('debug')('await')

const POLL_INTERVAL = process.env.POLL_INTERVAL || 1000,
      minimist = require('yargs-parser')

/** does the given activation have a truthy value for the given annotation key "anno */
const hasTruthyAnno = (activation, anno) => activation.annotations && activation.annotations.find(({key, value}) => key === anno && value)

/** was the given activation handled by the conductor */
const isConductorActivation = activation => hasTruthyAnno(activation, 'conductor') && hasTruthyAnno(activation, 'topmost')

const handleComposer = (commandTree, options) => activation => {
    if (isConductorActivation(activation)) {
        // then this is a conductor action, so delegate to await-app
        if (options.raw) {
            // caller asked for the raw session record, of the conductor
            return activation
        } else {
            //
            // otherwise, user wants the actual return value of the composition
            //
            // since we have ready access to the name and path of the wrapper,
            //       pass it through, to avoid fetching it again in await-app
            //
            return repl.qfexec(`await-app ${activation.activationId}`)
        }
    } else {
        // otherwise, this is a normal activation, so return it to the user
        return activation//commandTree.changeContext(`/wsk/activation`, activation.activationId)(activation)
    }
}

module.exports = (commandTree, require) => {
    const wsk = require('/ui/commands/openwhisk-core'),
          history = require('/ui/commands/history')

    const doAwait = (_1, _2, fullArgv, modules) => new Promise((resolve, reject) => {
        debug('begin await')

        const argvWithOptions = fullArgv.slice(fullArgv.indexOf('await') + 1),
              options = minimist(argvWithOptions, { alias: { 'r': 'remote' } }),
              argv = options._ // this is a minimist thing

        let activationId = argv[argv.length - 1]

        /**
         * Fetch the activation record for a given activationId.
         *
         * We need to handle the case where the activation has not yet
         * been recorded... the inner fetchPoll loop deals with that
         *
         */
        const fetch = activationId => new Promise((resolve, reject) => {
            const fetchPoll = () => repl.qexec(`wsk activation get ${activationId}`)
                  .then(resolve)
                  .catch(err => {
                      if (err && err.error && err.error.error === 'The requested resource does not exist.') {
                          // the activation isn't even recorded, yet!
                          debug('fetch needs to poll', activationId)
                          setTimeout(() => fetchPoll(), POLL_INTERVAL)
                      } else {
                          reject(err)
                      }
                  })
            fetchPoll()
        })

        /**
         * Check to see whether the given activation has completed
         *
         */
        const poll = activation => new Promise((resolve, reject) => {
            const iter = () => {
                  if (activation.end || activation.response.status) {
                      // then the activation has finished!
                      debug('await complete')
                      resolve(activation)
                  } else {
                      // otherwise, the activation is recorded, but not yet complete, so retry after some time
                      debug('poll still waiting for completion', activation.activationId)
                      setTimeout(() => fetch(activation.activationId).then(poll), POLL_INTERVAL)
                  }
            }
            iter()
        })

        const findActivationId = () => new Promise((resolve, reject) => {
            if (activationId) {
                resolve(activationId)
            } else {
                if (options && options.remote) {
                    // the user has requested that we ignore local history; so fetch the last activation from openwhisk
                    return repl.qexec(`wsk activation last`).then(poll).catch(reject);
                } else {
                    // otherwise, use our local history to find the last activation id
                    const lastActivationCommand = history.find(entry => entry.entityType === 'actions' && (entry.verb === 'invoke' || entry.verb === 'async'))
                    if (lastActivationCommand) {
                        // in some cases, the history does not yet record the activationId, so poll until it does
                        const findPoll = iter => {
                            if (lastActivationCommand.response && lastActivationCommand.response.activationId) {
                                // got it!
                                resolve(lastActivationCommand.response.activationId)
                            } else {
                                if (iter > 100) {
                                    reject('No recent activations to await')
                                } else {
                                    debug('need to poll history', lastActivationCommand)
                                    setTimeout(() => findPoll(iter + 1), 1000)
                                }
                            }
                        }
                        findPoll(0)
                    } else {
                        reject('No recent activations to await')
                    }
                }
            }
        })

        findActivationId()
            .then(fetch)
            .then(poll)
            .then(handleComposer(commandTree, options))
            .then(resolve, reject)
    })
    
    // install the routes
    wsk.synonyms('activations').forEach(syn => {
        commandTree.listen(`/wsk/${syn}/await`, doAwait, { docs: 'Wait until a previous activation completes (default: the last activation)' })
    })
}
