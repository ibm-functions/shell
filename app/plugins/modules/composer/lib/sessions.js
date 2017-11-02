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

const { init, splitNamedSession } = require('./composer')

/**
 * Usage message
 *
 */
const usage = () => `List recent sessions.

\tsession list [--name app] [--limit N] [--skip N]

Options:
\t--name     filter sessions by name
\t--limit N  return at most N sessions
\t--skip S   skip S sessions
`

/**
 * Form e.g. -p skip 20
 *
 */
const opt = (options, key) => options[key] ? `-p ${key} ${options[key]}` : ''

/**
 * Fetch the result of the session
 *
 */
const getResult = (sessionId, manager, status) => {
    if (status === 'live') {
        return Promise.resolve({ result: status })
    } else {
        return manager.get(sessionId, 30).catch(internalError => ({ internalError }))
    }
}

/**
 * Get the end time from last invocation in the trace of the given session
 *
 */
const getEndTime = (sessionId, manager, status) => status === 'live' ? Promise.resolve() : manager.trace(sessionId)
      .then(({trace}) => repl.qexec(`wsk activation get ${trace[trace.length - 1]}`))
      .then(({end}) => end)
      .catch(internalError => ({ internalError }))

const getNameAndStartTime = sessionId => repl.qexec(`wsk activation get ${sessionId}`)
      .then(sessionActivation => {
          if (sessionActivation.cause) {
              return repl.qexec(`wsk activation get ${sessionActivation.cause}`)  // this is how we'll know the name and start
          } else {
              // hmm, this session came from elsewhere, not created by us
              return { name: 'unknown', start: sessionActivation.start }
          }
      })

/**
 * Create renderable entities out of the session list data
 *
 */
const map = (result, manager, status, statusPretty) => {
    return Promise.all(result[status].map(sessionId => {
        return Promise.all([getResult(sessionId, manager, status),              // fetch the session result
                            getNameAndStartTime(sessionId),                     // fetch name of the app and the start time of the session
                            getEndTime(sessionId, manager, status)])            // fetch last activation, so we have the end time
            .catch(err => {
                if (err.statusCode === 404) {
                    // then the activation record isn't ready yet,
                    // tell the user we're doing the best we can...
                    const result = {},
                          end = Date.now(),
                          cause = { name: 'starting up', start: end }
                    return [ result, end, cause ]
                } else {
                    throw err
                }
            })
           .then(([ result, {name,start}, end=start ]) => {
               if (result && result.internalError) {
                   // expired session
                   console.error(result.internalError)
                   return
               } else if (end.internalError) {
                   // expired session
                   console.error(end.internalError)
                   return
               }
               return {
                   type: 'activations',                             // this is how we want them rendered
                   prettyType: statusPretty || 'session',           // this is how we want them identified in the views
                   start, end, status, name, activationId:sessionId, sessionId, // these are the attributes
                   response: {
                       success: !result.error,
                       result
                   },
                   onclick: () => repl.pexec(`app get ${name}`),
                   onActivationClick: () => repl.pexec(`session get ${sessionId}`)
               }
           })
    })).then(L => L.filter(x=>x)) // remove any undefineds due to expired sessions
}

/**
 * Sort the given session list by reverse start time order
 *
 */
const sort = sessions => {
    sessions.sort((a,b) => b.start - a.start)
    return sessions
}

/**
  * Filter the given session list, according to the given user options
  *
  */
const filter = options => sessions => {
    if (options && options.name) {
        return sessions.filter(_ => _.name === options.name)
    } else {
        return sessions
    }
}

/**
  * Prune the given sessions list according to the given limit option
  *
  */
const prune = options => sessions => {
    if (options && options.clientSideFiltering && (options.limit || options.skip)) {
        const start = options.skip || 0,
              end = options.limit + start || sessions.length - start + 1

        return sessions.slice(start, end)
    } else {
        return sessions
    }
}

/**
 * Take a $list result and format it for human consumption
 *
 */
const formatListForUser = (options, manager) => result => {
    return Promise.all([map(result, manager, 'live', 'live'), map(result, manager, 'done')])
        .then(([live,done]) => live.concat(done))
        .then(filter(options))
        .then(sort)
        .then(prune(options))
}

/**
 * Here is the app sessions entry point. Here we register command
 * handlers.
 *
 */
module.exports = (commandTree, prequire) => {
    const wsk = prequire('/ui/commands/openwhisk-core')
    const doList = cmd => function(_1, _2, _a, modules, fullCommand, execOptions, args, options) {
        const idx = args.indexOf(cmd) + 1,
              next = options.cursor || options.next, // this is the redis "cursor"
              skip = !options.name && options.skip,               // analogous to wsk activation list --skip
              limit = !options.name && (options.limit||5)         // analogous to wsk activation list --limit

        // let the first argument be the name to filter by
        if (args[idx]) options.name = args[idx]

        // for now, if the user specified a name, we need to do all
        // filtering on the client side
        if (options.name) options.clientSideFiltering = true

        if (options.help || options.name === true) {
            // user specified --name with no arg
            throw new modules.errors.usage(usage())
        }

        const listOptions = { next }
        if (limit) listOptions.limit = limit
        if (skip) listOptions.skip = skip

        return init(wsk, { noping: true })
            .then(({manager}) => manager.list(listOptions).then(formatListForUser(options, manager)))
            .catch(err => {
                console.error(err)
                if (err.statusCode === 404) {
                    // make a pretty error message, where "app init" is clickable
                    const msg = document.createElement('div'),
                          clicky = document.createElement('span'),
                          error = new Error('You must first initialize the OpenWhisk composer')
                    msg.appendChild(document.createTextNode('You must first initialize the OpenWhisk composer, via '))
                    clicky.className = 'clickable clickable-blatant'
                    clicky.innerText = 'app init'
                    clicky.onclick = () => repl.pexec('app init')
                    msg.appendChild(clicky)
                    error.message = msg
                    throw error
                } else {
                    throw err
                }
            })
    }

    const syns = ['sessions', 'sess', 'ses'],
          verbs = ['list', 'ls']

    verbs.forEach(verb => {
        const cmd = commandTree.listen(`/wsk/session/${verb}`, doList(verb), { docs: 'List current and recently completed composition invocations' })

        syns.forEach(syn => {
            commandTree.synonym(`/wsk/${syn}/${verb}`, doList(verb), cmd)
        })
    })
}
