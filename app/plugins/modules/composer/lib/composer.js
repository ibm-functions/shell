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

const debug = require('debug')('composer-utils')
debug('starting')

const path = require('path'),
      redis = require('redis'),
      messages = require('./messages.json'),
      { app:appBadge } = require('./badges'),
      lsKey = 'ibm.cloud.composer.storage'

debug('modules loaded')

/** global constants */
const constants = {
    composerPackage: 'openwhisk-composer'
}

// cache of init()
let initDone, manager
const cacheIt = wsk => ({ package, message }) => {
    initDone = package
    manager = require('@ibm-functions/composer/manager')(wsk.auth.getSubjectId(),
                                                         package.parameters.find(({key})=>key==='$config').value.redis)

    // when the window is closed, let's uncache this, and close our redis connection
    eventBus.on('/window/reload', () => {
        try {
            console.log('Uncaching manager')
            manager.quit()
            initDone = false
            manager = false
        } catch (err) {
            console.error(err)
        }
    })

    // localStorage.setItem(lsKey, JSON.stringify(package))

    return { package, manager, message }
}

/**
 * Report to the user that redis is slow in coming up
 *
 */
const slowInit = package => ({
    package,
    message: messages.slowInit
})

/**
 * Wait till the redis service is pingable, then pass through the given res
 *
 */
const waitTillUp = (redisURI, options={}, package) => new Promise((resolve, reject) => {
    if (options.noping) {
        return resolve({package})
    }

    try {
        console.log('composer::waitTillUp')

        // print dots to the console, if we're in headless mode
        let dots
        try {
            if (process.stdout && ''.yellow) {
                //process.stdout.write('Waiting for redis'.yellow)
                //dots = setInterval(() => process.stdout.write('.'.yellow), 2000)
            }
        } catch (err) {
            console.error(err)
        }

        let client, alreadySaidDone
        const handleError = err => {
            try {
                client.quit()

                try {
                    // we were printing dots to the console, if we're in headless mode, clear that
                    if (!alreadySaidDone && dots && ''.green) {
                        console.log(' [Done]'.green) // terminal newline
                        clearInterval(dots)
                        alreadySaidDone = true
                    }
                } catch (err) {
                    console.error(err)
                }

                if (err) {
                    console.error(err)
                    resolve(slowInit(package))
                } else {
                    resolve({ package })
                }
            } catch (err2) {
                console.error(err2)
                resolve(slowInit(package))
            }
        }

        client = redis.createClient(redisURI,{
            connect_timeout: 5000,
            retry_strategy: options => {
                if (options.error && options.error.code === 'ECONNREFUSED') {
                    // End reconnecting on a specific error and flush all commands with
                    // a individual error
                    handleError(options.error)
                }
                if (options.total_retry_time > 1000 * 60) {
                    // End reconnecting after a specific timeout and flush all commands
                    // with a individual error
                    handleError('retry time exceeded')
                }
                if (options.attempt > 30) {
                    // End reconnecting with built in error
                    handleError('retry count exceeded')
                }
                // reconnect after
                return Math.min(options.attempt * 100, 3000);
            }
        })

        client.on('error', handleError)
        client.ping(handleError)

    } catch (err) {
        console.error(err)
        reject('Internal Error')
    }
})

/**
 * Extract the redis uri from a service key
 *    TODO this probably belongs elsewhere, in the bluemix plugin e.g.
 *
 */
const uri = (key, {provider}={}) => {
    if (!provider || provider === 'redis') return key.uri
    else if (provider && provider === 'rediscloud') return `redis://:${key.password}@${key.hostname}:${key.port}`
}

/**
 * Acquire a redis instance
 *
 */
const acquireRedis = options => {
    if (options && options.url) {
        // use our shared redis instance
        return repl.qexec(`wsk package update bluemix.redis`, undefined, undefined, {
            parameters: {
                '_secrets': {
                    creds: {
                        uri: options.url
                    }
                }
            }
        }).then(package => ({package})) // wrap it up

    } else {
        // otherwise create a private instance
        return repl.qexec(`storage redis init --user ${constants.composerPackage}` + (options && options.provider ? ` --provider ${options.provider}` : ''))
    }
}

/**
 * Populate the composer-conductor package
 *
 */
const populatePackage = options => {
    return acquireRedis(options)
        .then( ({package}) => uri(package.parameters.find(({key})=>key==='_secrets').value.creds, options))
        .then(redis => { // this contains the redis secrets
            //
            // create the enclosing package, with the redis secrets as a bound parameter
            //
            const notify = true, // internal conductor feld
                  type = options && options.url ? 'url' : 'private',
                  $config = { redis, notify, type }

            return repl.qexec(`wsk package update ${constants.composerPackage}`, undefined, undefined, {
                parameters: { $config }
            })
                .then(composerPackage => {
                    // create the conductor action
                    return repl.qexec(`let ${composerPackage.name}/conductor = "${path.join(__dirname, '..', 'node_modules', '@ibm-functions/composer', 'conductor.js')}" -t 300000`)
                        .then(() => waitTillUp(redis, options, composerPackage))
                })
        })
}

/**
 * Ignore any caches, and populate the openwhisk and redis bits
 *
 */
const populateFromScratch = (wsk, options) => {
    return repl.qexec(`wsk package get ${constants.composerPackage}`)
        .catch(err => {
            if (err.statusCode !== 404) {
                // anything other than "not found" is a problem
                throw err
            } else {
                return { parameters: [{key: '$config', value: { type: 'none'} }] }
            }
        })
        .then(package => package.parameters.find(({key}) => key === '$config').value)
        .then($config => {
            if ($config.type === 'private') {
                return repl.qexec(`storage redis destroy --user ${constants.composerPackage}` + (options && options.provider ? ` --provider ${options.provider}` : ''))
            }
        })
        .then(() => populatePackage(options).then(cacheIt(wsk)))
}

/**
 * Initialize the composer-conductor for this namespace
 *
 * @return { package, manager }
 *
 */
exports.init = (wsk, options) => {
    // has the user asked to switch redis instances?
    const resetRequested = options && options.reset

    if (!resetRequested && initDone) {
        // found in cache!
        return Promise.resolve({
            package: initDone,
            manager
        })

    } else {
        const cachedInLocalStorage = false//localStorage.getItem(lsKey)
        if (!resetRequested && cachedInLocalStorage) {
            return repl.qexec(`wsk package get ${constants.composerPackage}`) // double check that the package exists
                .then(() => Promise.resolve(cacheIt(wsk)({package: JSON.parse(cachedInLocalStorage)})))
                .catch(err => populatePackage(options).then(cacheIt(wsk)));
        } else if (resetRequested) {
            return populateFromScratch(wsk, options)
        } else{
            return repl.qexec(`wsk package get ${constants.composerPackage}`)
                .then(package => ({package})).then(cacheIt(wsk))
                .catch(err => {
                    if (err.statusCode === 404) {
                        return populateFromScratch(wsk, options)
                    } else {
                        throw err
                    }
                })
        }
    }
}

/**
 * Is the given struct a valid FSM?
 *   TODO, this is a primitive form of validation, for now
 *
 */
exports.isValidFSM = maybe => maybe && typeof maybe === 'object' && maybe.hasOwnProperty('Entry') && typeof maybe.Entry === 'string'


/**
 * Return the store credentials
 *
 */
exports.properties = () => repl.qfexec(`wsk package get ${constants.composerPackage}`)
    .catch(err => {
        if (err.statusCode === 404) {
            const msg = document.createElement('dom'),
                  clicky = document.createElement('span'),
                  cmd = 'app init'

            msg.appendChild(document.createTextNode('Backing store not yet initialized. Consider using '))

            clicky.className = 'clickable clickable-blatant'
            clicky.innerText = cmd
            clicky.onclick = () => repl.pexec(cmd)
            msg.appendChild(clicky)
            msg.appendChild(document.createTextNode('.'))
            
            throw msg
        } else {
            throw err
        }
    })

/**
 * Extract the FSM source from the given entity
 *
 */
exports.getFSM = entity => {
    const fsmPair = entity.parameters && entity.parameters.find( ({key}) => key === '$invoke')  // parameter binding?
          || entity.annotations && entity.annotations.find( ({key}) => key === 'fsm')        // or annotation?

    if (fsmPair) {
        return fsmPair.value
    }
}

/**
 * If the given entity has an associated FSM, return it, otherwise
 * return the entity
 *
 */
exports.maybeFSM = entity => exports.getFSM(entity) || `/${entity.namespace}/${entity.name}`

/**
 * Fetch the given named entity, and its corresponding FSM-compatible representation
 *
 */
exports.fetch = (wsk, name) => wsk.ow.actions.get(wsk.owOpts({ name })).then(entity => ({ entity, fsm: exports.maybeFSM(entity) }))

/**
 * Move a given entity out of the way
 *
 */
//exports.moveAside = entity => repl.qexec(`mv "/${entity.namespace}/${entity.name}" "/${entity.namespace}/${entity.name}-orig"`)
exports.moveAside = (wsk, name) => repl.qexec(`mv "${name}" "${name}-orig"`)
    .then(resp => resp.message) // extract the entity
    .then(entity => ({ entity, fsm: exports.maybeFSM(entity) }))

/**
 * Create an invokeable entity for the given fsm
 *    re: the $name, conductor offers the feature of naming sessions, we don't currently use it
 */
const createBinding = ({wsk, appName, fsm}) => {
    return exports.init(wsk, { noping: true })
        .then(({package:composerPackage}) => {
            const bindName = `${composerPackage.name}.${appName}`
            return repl.qexec(`wsk package bind "${composerPackage.name}" "${bindName}"`,
                              undefined, undefined,
                              { parameters: { $invoke: fsm, /*$name: appName*/ }
                              })
        })
}

/**
 * Delete an app-specific binding
 *
 */
exports.deleteBinding = name => repl.qexec(`wsk package delete ${constants.composerPackage}.${name}`)
    .catch(err => {
        console.error(err)
        return { error: name }
    }).then(() => ({ ok: name }))

/**
 * Merge previous and current and internal annotations
 *
 */
const mergeAnnotations = (A1, A2, type, fsm) => {
    const annotations = A1.concat(A2),
          fsmAnnotation = annotations.find(({key}) => key === 'fsm'),
          badgesAnnotation = annotations.find(({key}) => key === 'wskng.combinators'),
          badge = {"type":"composition","role":"replacement","badge":type}

    if (!fsmAnnotation) {
        annotations.push({ key: 'fsm', value: fsm })
    } else {
        fsmAnnotation.value = fsm
    }

    if (!badgesAnnotation) {
        annotations.push({ key: 'wskng.combinators', value: [badge] })
    } else {
        const existing = badgesAnnotation.value.find(({type}) => type === 'composition')
        if (existing) {
            existing.badge = type
        } else {
            badgesAnnotation.push(badge)
        }
    }

    return annotations
}

/**
 * Create an invokeable entity for the given fsm
 *
 */
exports.create = ({name, fsm, type, annotations=[], parameters=[], wsk, commandTree, execOptions, cmd='update'}) => {
    debug('create')
    const slash = name.indexOf('/'),
          packageName = slash > 0 && name.substring(0, slash),
          packageNameWithSlash = packageName ? `${packageName}/` : '', // for the action create
          appName = name.substring(slash + 1),
          fqnAppName = `${packageNameWithSlash}${appName}`,
          EMPTY = Promise.resolve({ parameters: [], annotations: [] })

    // create the binding, then create the action wrapper to give the app a name;
    // for updates, we also need to fetch the action, so we can merge the annotations and parameters
    return Promise.all([createBinding({wsk, appName, fsm}),
                        !packageName ? Promise.resolve() : repl.qexec(`package update "${packageName}"`),
                        cmd === 'create' ? EMPTY : repl.qexec(`wsk action get ${fqnAppName}`).catch(err => {
                            if (err.statusCode === 404) return EMPTY
                            else throw err
                        })
                       ])
        .then(([binding, appPackage, currentAction]) => wsk.ow.actions[cmd](wsk.owOpts({
            name: fqnAppName,
            action: {
                exec: {
                    kind: 'sequence',
                    components: [`/${binding.namespace}/${binding.name}/conductor`]
                },
                parameters: currentAction.parameters.concat(parameters),
                annotations: mergeAnnotations(currentAction.annotations, annotations, type, fsm),
                limits: {
                    timeout: 5 * 60 * 1000 // 5-minute timeout
                }
            }
        })))
        .then(entity => ui.headless ? Object.assign(entity, { verb: 'update', type: 'app' }) : repl.qfexec(`app get "/${entity.namespace}/${entity.name}"`))
        .catch(err => {
            debug('@@@@@@@@@', err)
            throw err
        })
}

/**
 * Create an invokeable entity for the given fsm, and replace a given entity
*
*/
exports.update = ({name, entity, fsm, type, wsk, commandTree, execOptions}) => {
    return exports.create({ name: name || entity.name,
                            annotations: entity.annotations,
                            parameters: entity.parameters,
                            fsm, type, wsk, commandTree, execOptions })
}

/**
 * Does the given action represent a composer app?
 *
 */
exports.isAnApp = action => {
    const allManagement = action.annotations && action.annotations.find(({key}) => key === 'wskng.combinators'),
          anyAppManagement = allManagement && allManagement.value.find(({type}) => type === 'composition')

    return anyAppManagement
}

/**
 * Helper method for kill and purge operations, which share enough code...
 *
 */
const killOrPurge = ({wsk, cmd, successMessage, failureMessage}) => sessionId => exports.init(wsk).then(({manager}) => {
    return cmd(manager, sessionId).then(response => successMessage)
})

/**
 * Kill a given session
 *
 */
exports.kill = wsk => killOrPurge({ wsk,
                                    cmd: (manager, sessionId) => manager.kill(sessionId),
                                    successMessage: 'Successfully terminated the given session',
                                    failureMessage: 'Error terminating the given session'
                                  })

/**
 * Purge session state
 *
 */
exports.purge = wsk => killOrPurge({ wsk,
                                     cmd: (manager, sessionId) => manager.purge(sessionId),
                                     successMessage: 'Successfully purged the given session',
                                     failureMessage: 'Error purging the given session'
                                   })

/**
 * Is the given sessionId a valid form?
 *
 */
const sessionPattern = /[a-fA-F0-9]{32}(:.*)?/
exports.isValidSessionId = sessionId => sessionId && (typeof sessionId === 'string') && sessionId.match(sessionPattern)

/**
 * Named sessions are sessionId:nameOfApp
 *
 * Suggested usage: 
 *    const { activationId, name } = splitNamedSession(sessionId)
 *
 */
const sessionColonNamePattern = /^([^:]+):(.*)$/    // named sessions are sessionId:nameOfApp
exports.splitNamedSession = sessionId => {
    const split = sessionId.split(sessionColonNamePattern)
    if (split && split.length >= 3) {
        return {
            activationId: split[1],
            name: split[2]
        }
    } else {
        return {
            activationId: sessionId,
            name: 'conductor' // fallback
        }
    }
}

/**
 * Error reporting
 *
 */
exports.handleError = (err, reject) => {
    console.error(err)
    if (reject) {
        reject(err)
    } else if (typeof err === 'string') {
        throw new Error(err)
    } else {
        throw err
    }
}

/**
 * Entity view modes
 *
 */
exports.vizAndfsmViewModes = (defaultMode='visualization') => [
    { mode: 'visualization', defaultMode: defaultMode==='visualization', direct: ui.showEntity },
    { mode: 'fsm', label: 'JSON', defaultMode: defaultMode==='fsm', direct: entity => ui.showEntity(entity, { show: 'fsm' }) }
]

/**
 * Entity view mode if we have javascript source
 *
 */
exports.codeViewMode = {
    mode: 'source', label: 'code', direct: entity => ui.showEntity(entity, { show: 'source' })
}

/**
 * Check for unknown options
 *
 */
exports.hasUnknownOptions = (options, expected) => {
    const M = expected.reduce((M, key) => { M[key] = true; return M; } , {})
    for (let opt in options) {
        // underscore comes from minimist
        if (opt !== '_' && !M[opt]) {
            throw new Error(`Unexpected option ${opt}`)
        }
    }
}

/**
 * Amend the result of an `action get`, to make the entity appear more
 * like an app
 *
 */
exports.decorateAsApp = action => {
    action.prettyType = appBadge
    action.fsm = action.annotations.find(({key}) => key === 'fsm').value
    action.modes = exports.vizAndfsmViewModes().concat((action.modes||[]).filter(_ => _.mode !== 'code'))

    if (action.exec) {
        action.exec.prettyKind = 'app'
    }

    return action
}

debug('init done')
