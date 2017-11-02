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
      badges = require('./badges'),
      { init, getFSM, create, handleError } = require('./composer')

/**
 * Format usage message
 *
 */
const usage = () => 'Usage: letc a1 -> a2 -> a3 -> ...'

/**
 * Here is the await-app module entry point. Here we register command
 * handlers.
 *
 */
module.exports = (commandTree, prequire) => {
    const wsk = prequire('/ui/commands/openwhisk-core'),
          letc = function(_1, _2, _a, _3, fullCommand, execOptions, args, options) {
              //
              // first, elaborate the sequence components, using the `let` command
              //
              const idx = args.indexOf('letc')
              args[idx] = 'let'

              if (idx === args.length - 1 || options.help || args[idx + 1] === 'help') {
                  throw new Error(usage())
              }

              return init(wsk)
                  .then(() => repl.qexec(`${fullCommand.replace('letc ', 'let ')}`, false, false, { dryRun: true }) // dryRun will give us back just the name and components
                        .then( ({name, components, componentEntities, annotations, parameters}) => {
                            //
                            // great! we now have the components
                            //
                      
                            // but... some of the entities will be just names; and we need the source, in order to fetch any nested FSMs
                            return Promise.all(componentEntities.map(entity => {
                                if (typeof entity === 'string') {
                                    // fetch the source
                                    return wsk.ow.actions.get({ name: entity })
                                } else {
                                    // we already have it
                                    return entity
                                }
                            })).then(componentEntities => {
                                //
                                // if an entity is an FSM, then use it, rather the elaboration rather than the invokeable entity
                                //
                                for (let idx = 0; idx < componentEntities.length; idx++) {
                                    const fsm = getFSM(componentEntities[idx])
                                    if (fsm) {
                                        components[idx] = fsm
                                    }
                                }

                                //
                                // now use the composer to construct the FSM
                                //
                                const fsm = composer.compile(composer.sequence(...components))

                                //
                                // finally, construct an invokeable entity around the FSM
                                //
                                return create({ name, fsm, annotations, parameters, wsk, commandTree, execOptions, type: badges.sequence })
                            })
                        }))
                  .catch(handleError)
          }

    // Install the routes
    wsk.synonyms('actions').forEach(syn => {
        commandTree.listen(`/wsk/${syn}/letc`, letc, { docs: 'Create a composer sequence' })
    })
}
