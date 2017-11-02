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

const debug = require('debug')('preflight')
debug('starting')

/**
 * Preflight module
 *
 * preflight.register('update|create|delete|get', opts => ({ reason: "why this operation should be blocked" }))
 *
 * where opts is the canonical structure from the openwhisk npm, i.e. with the schema
 *   {
 *     name: 'entityName'
 *     namespace: 'entityNamespace',
 *     action: { ... }    <-- could be rule, trigger, etc.
 *   }
 */
module.exports = (commandTree, require) => {
    debug('init')

    /** map from op to [handler] */
    let registrar = {}

    const self = { isEnabled: true }

    // register commands for toggling the preflight module's enablement bit
    const status = () => {
        const dom = document.createElement('div'),
              status = document.createElement('strong')
        status.innerText = self.isEnabled ? 'enabled' : 'disabled'
        dom.appendChild(document.createTextNode('The preflight module is '))
        dom.appendChild(status)
        return dom
    }
    const enable = isEnabled => () => {
        self.isEnabled = isEnabled
        return status()
    }
    commandTree.listen('/preflight/off', enable(false))
    commandTree.listen('/preflight/on', enable(true))
    commandTree.listen('/preflight/status', status)
    commandTree.listen('/preflight/reset', () => {
        registrar = {}
        return 'Successfully removed all preflight checks'
    })

    // install a demo preflight blocker
    commandTree.listen('/preflight/demo', () => {
        self.register('update', () => ({ reason: 'This is a demo of the validator, it blocks all update operations' }))
        const dom = document.createElement('div'),
              clicky = document.createElement('span'),
              post = document.createElement('span'),
              postClicky = document.createElement('span'),
              cmd = 'let foo = x=>x',
              reset = 'preflight reset'
        dom.appendChild(document.createTextNode('Demo preflight validator installed. To see the preflight plugin in action, try: '))

        clicky.className = 'clickable clickable-blatant'
        clicky.innerText = cmd
        clicky.onclick = () => repl.pexec(cmd)

        post.innerText = '. To remove this demo check, use: '
        postClicky.className = 'clickable clickable-blatant'
        postClicky.innerText = reset
        postClicky.onclick = () => repl.pexec(reset)

        dom.appendChild(clicky)
        dom.appendChild(post)
        dom.appendChild(postClicky)

        return dom
    })

    /**
     * Register a handler for validation requests against the
     * given operation `op`.
     *
     * handler(opts) returns either a falsity or { reason: 'why the operation should not proceed' }
     *
     */
    self.register = (op, handler) => {
        let handlers = registrar[op]
        if (!handlers) {
            handlers = registrar[op] = []
        }
        handlers.push(handler)
    }

    /**
     * Validate the given operation `op` against the given openwhisk npm-style opts
     *
     */
    self.validate = (op, opts) => {
        // see if there exists a validator that disagrees                                       // filter out don't-cares
        return self.isEnabled && (registrar[op] || []).map(validator => validator(opts)).filter(x=>x)
        //                                                              ^^ do you disagree that this is valid?
    }

    self.preflight = (op, opts) => new Promise((resolve, reject) => {
        const nopes = self.validate(op, opts)
        if (nopes && nopes.length > 0) {
            reject({
                statusCode: 500,
                error: `Operation failed preflight checks: ${nopes.map(nope => nope.reason)}`
            })
        } else {
            // good to go, return the opts for further processing
            resolve(opts)
        }
    })

    debug('init done')
    return self
}
