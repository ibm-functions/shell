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
 * This plugin introduces an rm command under all of the entity trees,
 * e.g. /wsk/actions/rm and /wsk/rules/rm. It augments the delete API
 * of OpenWhisk to offer wildcard deletion; e.g.
 *
 *   rm foo bar
 *   rm foo* bar
 *
 */

const minimist = require('minimist')

/** sum of numbers in an array */
//const arraySum = A => A.reduce((sum, c) => sum + c, 0)
const flatten = A => [].concat.apply([], A)

/**
 * Report an error, then return the given value
 *
 */
const errorThen = val => err => {
    console.error(err)
    return val
}

/** here is the module */
module.exports = (commandTree, require) => {
    const wsk = require('/ui/commands/openwhisk-core'),
          letPlugin = require('/openwhisk-extensions/actions/let')

    /**
     * Given a package name and an entity within that package, return the fully qualified name of the entity
     *
     */
    const reify = (package, field) => {
        const entities = package[field]
        if (entities) {
            return entities.map(entity => `${package.name}/${entity.name}`)
        }
    }

    /** Recursive removal helpers */
    const rmHelper = type => entities => {
        if (!entities || entities.length === 0) {
            return Promise.resolve([])
        } else {
            return repl.qexec(`${type} rm -r -q ${entities.join(' ')}`, undefined, undefined, { raw: true })
        }
    }
    const rmActions = rmHelper('actions')
    const rmTriggers = rmHelper('triggers');

    /**
     * Recursively remove a package and its contents
     *
     */
    const deletePackageAndContents = package => repl.qexec(`package get ${package} --no-retry`)
          .then(package => Promise.all([ rmActions(reify(package, 'actions')),
                                         rmTriggers(reify(package, 'feeds'))
                                       ]))
          .then(flatten)
          .then(removedSoFar => repl.qexec(`package delete ${package} --no-retry`).then(() => removedSoFar.concat([package])))

    /**
     * Return the fully qualified name of the given entity
     *
     */
    const fqn = entity => `/${entity.namespace}/${entity.name}`

    /**
     * Fetch entities of the given type
     *
     */
    const BATCH = 200 // keep this at 200, but you can temporarily set it to lower values for debugging
    const fetch = (type, skip = 0, soFar = []) => {
        return repl.qexec(`${type} list --limit ${BATCH} --skip ${skip}`)
            .then(items => {
                if (items.length === BATCH) {
                    // then there may be more
                    return fetch(type, skip + BATCH, soFar.concat(items))
                } else if (items.length === 0) {
                    return soFar
                } else {
                    return soFar.concat(items)
                }
            })
    }

    /**
     * Do a glob-style match, using the given list of patterns
     *
     */
    const glob = (type, list) => {
        const wildcards = list.filter(pattern => pattern.indexOf('*') >= 0).map(pattern => new RegExp(pattern.replace(/\*/g, '.*'))),
              exacts = list.filter(pattern => pattern.indexOf('*') < 0).map(item => ({ isExact: true, item: item }))

        if (wildcards.length === 0) {
            return Promise.resolve(exacts)
        } else {
            return fetch(type)
                .then(items => items.filter(item => wildcards.find(wildcard => item.name.match(wildcard))))
                .then(wildcardMatches => exacts.concat(wildcardMatches.map(fqn).map(item => ({ isExact: false, item: item }))))
        }
    }
    
    /**
     * This is the core logic
     *
     */
    const rm = type => (block, nextBlock, fullArgv, _1, _2, execOptions) => {
        const options = minimist(fullArgv, { alias: { q: 'quiet', f: 'force', r: 'recursive' }, boolean: ['quiet', 'force', 'recursive']}),
              argv = options._,
              toBeDeletedList = argv.slice(argv.indexOf('rm') + 1)

        if (toBeDeletedList.length === 0) {
            //
            // if no entity specified on the command line, check to
            // see if there is a selection; if so, use that entity
            //
            const sidecar = document.querySelector('#sidecar')
            if (sidecar && sidecar.entity && sidecar.entity.type !== 'activations') {
                toBeDeletedList.push(`/${sidecar.entity.namespace}/${sidecar.entity.name}`)
                type = sidecar.entity.type
                console.log('rm using implicit entity name', toBeDeletedList[0])
            }
        }

        return glob(type, toBeDeletedList).then(toBeDeleted => Promise.all(toBeDeleted.map(match => {
            const isExact = match.isExact,
                  arg = match.item

            if (options.recursive && type === 'actions') {
                //
                // check to see if this is a sequence. if so, delete
                // any anonymous/inline functions associated with it
                //
                //    e.g. let seq = a -> x=>x -> b
                //                         |
                //                         ^^^^^^ delete this, too
                //
                return repl.qexec(`action get ${arg} --no-retry`, block)
                    .then(action => {
                        if (action.annotations && action.annotations.find(kv => kv.key === 'exec' && kv.value === 'sequence')) {
                            return Promise.all(action.exec.components.map(component => repl.qexec(`action get ${component} --no-retry`, block)
                                                                          .then(component => {
                                                                              if (letPlugin.isAnonymousLetFor(component, arg)) { // arg is the parent sequence
                                                                                  return repl.qexec(`action delete ${component.name} --no-retry`, block)
                                                                                      .then(() => [component.name]) // deleted one
                                                                                      .catch(errorThen([]))   // deleted zero
                                                                              } else {
                                                                                  return []                         // deleted zero
                                                                              }
                                                                          }).catch(errorThen([])))) // get failed, sequence component already deleted, so deleted zero here!
                                .then(flatten)
                                .then(counts => repl.qfexec(`${type} delete ${arg} --no-retry`, block, nextBlock) // now we can delete the sequence
                                      .then(() => counts.concat(arg))) // total deleted count

                        } else {
                            // not a sequence, plain old delete
                            return repl.qfexec(`${type} delete ${arg} --no-retry`, block, nextBlock).then(() => [arg]) // deleted one
                        }
                    })

            } else if (options.recursive && type === 'packages') {
                return deletePackageAndContents(arg)

            } else {
                // no special handling for other entity types
                return repl.qfexec(`${type} delete "${arg}" --no-retry`, block, nextBlock).then(() => [arg]) // deleted one
                    .catch(err => {
                        if (err.statusCode === 404 && !isExact) {
                            // if this item was found due to a wildcard match, then don't complain if we didn't find it
                        } else {
                            throw err
                        }
                    })
            }

        }))).then(flatten)
            .then(removed => {
                if (execOptions.raw) {
                    return removed
                } else {
                    const count = removed.length
                    if (options && options.quiet) {
                        return count
                    } else {
                        return `deleted ${count} ${count === 1 ? 'element' : 'elements'}`
                    }
                }
            })
    }

    // Install the routes
    ['actions', 'triggers', 'rules', 'packages'].forEach(type => {
        const handler = rm(type)
        wsk.synonyms(type).forEach(syn => {
            const cmd = commandTree.listen(`/wsk/${syn}/rm`, handler, { docs: `Delete one or more OpenWhisk ${type}` })
            
            const deleteCmd = commandTree.find(`/wsk/${syn}/delete`)
            if (deleteCmd && deleteCmd.options) deleteCmd.options.hide = true
        })
    })

    // expose a programmatic API
    return {
        rm
    }
}
