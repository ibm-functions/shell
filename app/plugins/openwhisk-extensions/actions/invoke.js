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
 * The plugin overrides the default invoke behavior, so that `invoke`
 * is synchronous. It introduces an `async` command that offers the
 * "wsk" CLI behavior of asynchronous invocation.
 *
 * This plugin ofers an example of override: note how it fits the
 * delegation pattern: it delegates to the underlying `invoke` plugin
 * to perform the actual invocation.
 *
 */

/**
 * Make a documentation struct
 *
 */
const docs = docString => { docs: docString }

/**
 * Fetch the full activation record from a partial one. Blocking
 * invokes, with the OpenWhisk API, give back a partial activation
 * record. One thing these partial records lack is logs.
 *
 */
const fetch = partialActivation => repl.qfexec(`await ${partialActivation.activationId}`)
const fetchFromError = error => {
    if (error.statusCode === 502) {
        // then this is a action error, display it as an activation failure
        return fetch(error.error)
    } else {
        // then this is some user (i.e. tool user) error, rethrow the
        // exception so that the repl can display it
        throw error
    }
}

/**
 *
 *
 */
const respond = options => response => {
    if (options.quiet) {
        return true
    } else {
        if (options.result || options.r) {
            response.message = response.message.response.result
        }
        return response
    }
}

/**
 * This is the command impl for synchronous invocation. We add `-b` if
 * it isn't already on the command argv; this tells the underlying
 * impl to perform a blocking invocation.
 *
 */
const doInvoke = rawInvoke => function() { // we'll use "arguments" to pass through the invoke args to the delegate
    if (!arguments[2].find(opt => opt === '-b' || opt === '--blocking')) {
        // doInvoke means blocking invoke, so make sure that the argv
        // indicates that we want a blocking invocation
        arguments[2].push('-b')
        arguments[4] = arguments[4].slice(0) + ' -b' // clone it, via slice, to avoid contaminating command history
    }

    const options = arguments[7]

    // for now, strip off -r,as we need the activationId. revisit this
    // later, if necessary; it's preserved in the options variable,
    // and the respond method will handle the -r there. hopefully this
    // is good enough [NMM 20170922]
    arguments[2] = arguments[2].filter(_ => _ !== '-r' && _ !== '--result' && _ != '-br')

    // do the invocation, then fetch the full activation record
    // (blocking invokes return incomplete records; no logs)
    return rawInvoke.apply(undefined, arguments)
        .then(fetch, fetchFromError)
        .then(respond(options))
}

/**
 * This is the command impl for asynchronous invocation. We reuse the
 * underlying invoke impl, and so there is a bit of rejiggering so
 * that command history shows `async`, but the underlying impl sees
 * `invoke.
 *
 */
const doAsync = rawInvoke => function() { // we'll use "arguments" to pass through the invoke args to the delegate
    const idx = arguments[2].findIndex(arg => arg === 'async')
    arguments[2][idx] = 'invoke'
    arguments[4] = arguments[4].slice(0).replace(/^async/, 'invoke') // clone it, via slice, to avoid contaminating command history

    return rawInvoke.apply(undefined, arguments)
}

/**
 * Here is the module. It registers command handlers, and finds the
 * delegate, i.e. the underlying invoke impl.
 *
 */
module.exports = (commandTree, require) => {
    const wsk = require('/ui/commands/openwhisk-core'),
          rawInvoke = commandTree.find('/wsk/actions/invoke'), // this is the command impl we're overriding, we'll delegate to it
          syncInvoke = doInvoke(rawInvoke.$),                  // the command handler for sync invokes
          asyncInvoke = doAsync(rawInvoke.$)                   //             ... and for async

    wsk.synonyms('actions').forEach(syn => {
        commandTree.listen(`/wsk/${syn}/invoke`, syncInvoke, docs('Invoke an action'))
        commandTree.listen(`/wsk/${syn}/async`, asyncInvoke, docs('Invoke an action asynchronously'))
    })
}
