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
const usage = () => ({
    title: 'List Recent Sessions',
    header: 'Returns a list of recent composition activations (a.k.a. "sessions").',
    example: 'session list',
    optional: [{ name: '--name', docs: 'filter to show only a given named composition' },
               { name: '--limit', docs: 'show at most N sessions' },
               { name: '--skip', docs: 'skip over the most recent N sessions' }],
    parents: ['composer', { command: 'composer session' }],
    related: ['grid', 'summary']
})

/**
 * Create renderable entities out of the session list data
 *
 */
const map = (result, manager, statusPretty) => {
    return Promise.resolve(result.map(activation => {
        activation.sessionId = activation.activationId
        activation.onclick = () => repl.pexec(`app get ${name}`)
        activation.onActivationClick = () => repl.pexec(`session get ${sessionId}`)

        return activation
    }))
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
    return map(result, manager)
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
              limit = !options.name && (options.limit||10)        // analogous to wsk activation list --limit

        // let the first argument be the name to filter by
        if (args[idx]) options.name = args[idx]

        // for now, if the user specified a name, we need to do all
        // filtering on the client side
        if (options.name) options.clientSideFiltering = true

        if (options.help || options.name === true) {
            // user asked for usage, or user specified --name with no arg
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
