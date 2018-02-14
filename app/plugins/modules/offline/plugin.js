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

const debug = require('debug')('offline plugin')
debug('loading')

const url = require('url')

debug('finished loading modules')

/**
 * Is the given hostname some localhost variant?
*
*/
const isLocal = host => {
    const { hostname } = url.parse(host)

    return hostname === 'localhost'
        || hostname.indexOf('172.') === 0
        || hostname.indexOf('192.') === 0
        || hostname === '0.0.0.0'
}

module.exports = (commandTree, prequire) => {
    // did the user click, requesting a switch to offline?
    let wentOffline = undefined

    if (typeof window !== 'undefined') {
        window.addEventListener('offline', () => repl.pexec('host get')
                                .then(host => {
                                    if (!isLocal(host)) {
                                        const notification = new Notification('Network Disconnected', {
                                            body: 'Your network appears to be offline. Click here to switch to your local OpenWhisk.'
                                        })
                                        notification.addEventListener('click', () => {
                                            // user asked to switch to local openwhisk
                                            debug('switching to local openwhisk')
                                            const currentNamespace = namespace.current()
                                            repl.pexec('host set local')
                                                .then(() => {
                                                    wentOffline = {
                                                        host, namespace: currentNamespace
                                                    }
                                                    debug('switched to offline host')
                                                })
                                        })
                                    }
                                }))

        window.addEventListener('online', () => {
            if (wentOffline) {
                const notification = new Notification('Network Reconnected', {
                    body: 'Your network appears to have returned online. Click here to switch back to your previous .'
                })
                notification.addEventListener('click', () => {
                    // wentOffline will be the prior host
                    const { host, namespace } = wentOffline
                    debug('restoring prior host', host, namespace)
                    repl.pexec(`host set ${host}`)
                        .then(() => repl.pexec(`auth switch ${namespace}`))
                        .then(() => {
                            wentOffline = undefined
                            debug('switched to prior host')
                        })
                })
            }
        })
    }
}

debug('finished loading')
