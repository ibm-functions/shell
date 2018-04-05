/*
 * Copyright 2017-2018 IBM Corporation
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

const debug = require('debug')('auth plugin')

/**
 * This plugin introduces /wsk/auth, to help with switching between
 * OpenWhisk auth keys.
 *
 */

const fs = require('fs'),
      propertiesParser = require('properties-parser'),
      expandHomeDir = require('expand-home-dir'),
      wskpropsFile = expandHomeDir('~/.wskprops')

const usage = {
    auth: {
        toplevel: {
            commandPrefix: 'auth',
            title: 'Authorization Operations',
            header: 'Commands to switch, list, and remember OpenWhisk authorization keys',
            related: ['host']
        },
        list: {
            strict: 'list',
            command: 'list',
            title: 'List Auth Keys',
            header: 'List the OpenWhisk namespaces for which you have authorization keys',
            parents: ['auth'],
            related: ['host set']
        },
        switch: {
            strict: 'switch',
            command: 'switch',
            title: 'Switch Auth Keys',
            header: 'Switch to use an OpenWhisk namespace, by name',
            example: 'auth switch <namespace>',
            required: [{ name: 'namespace', docs: 'an OpenWhisk namespace', entity: 'namespace' }],
            parents: ['auth'],
            related: ['auth list', 'host set']
        },
        add: {
            strict: 'add',
            command: 'add',
            title: 'Add Auth Key',
            header: 'Install an OpenWhisk authorization key',
            example: 'auth add <auth>',
            required: [{ name: 'auth', docs: 'an OpenWhisk authorization key' }],
            parents: ['auth'],
            related: ['auth switch', 'auth list', 'host set']
        }
    },
    host: {
        toplevel: {
            commandPrefix: 'host',
            title: 'Host Operations',
            header: 'Commands to switch OpenWhisk API host',
            related: ['auth']
        },
        get: {
            strict: 'get',
            command: 'get',
            commandPrefix: 'host',
            title: 'Get API Host',
            header: 'Print the current OpenWhisk API host',
            example: 'host get',
            parents: ['host']
        },
        set: {
            strict: 'set',
            command: 'set',
            commandPrefix: 'host',
            title: 'Set API Host',
            header: 'Change the OpenWhisk API host to a chosen alternative',
            example: 'host set <which>',
            nRowsInViewport: 5,
            oneof: [
                { name: 'local', docs: 'Use a local OpenWhisk installation' },
                { name: 'us-south', docs: 'Use the IBM Cloud Dallas installation' },
                { name: 'eu-gb', docs: 'Use the IBM Cloud London installation' },
                { name: 'eu-de', docs: 'Use the IBM Cloud Frankrut installation' },
                { name: 'hostname', docs: 'Use a given hostname or IP address' }
            ],
            parents: ['host']
        }
    }
}
usage.auth.toplevel.available = [usage.auth.add, usage.auth.list, usage.auth.switch]
usage.host.toplevel.available = [usage.host.get, usage.host.set]

/**
 * The message we will use to inform the user of a auth switch event
 *
 */
const informUserOfChange = (wsk, commandTree, subject) => () => {
    setTimeout(() => eventBus.emit('/auth/change', {
        namespace: namespace.current(),
        subject: subject
    }), 0)

    return wsk.apiHost.get().then(host => commandTree.clearSelection(`You are now using the OpenWhisk host ${host}, and namespace ${namespace.current()}`))
}

/**
 * Notify other plugins of a host change event
 *
 */
const notifyOfHostChange = host => () => {
    eventBus.emit('/host/change', {
        namespace: namespace.current(),
        host: host
    })
}

/**
 * Read ~/.wskprops, and update its in-memory form to reflect the given AUTH
 *
 * @return resolves with the updated structure
 *
 */
const readFromLocalWskProps = (wsk, auth, subject) => wsk.apiHost.get().then(apiHost => new Promise((resolve, reject) => {
    // read from ~/.wskprops
    propertiesParser.read(wskpropsFile, (err, wskprops) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // the .wskprops file does not yet exist. manufacture
                // an in-memory form of the data we currently have
                resolve({
                    APIHOST: apiHost,
                    AUTH: auth
                })
            } else {
                reject(err)
            }
        } else {
            // we successfuly read the .wskprops file into an
            // in-memory struct; now update that struct
            wskprops.APIHOST = apiHost // in case this has also changed, via `host set`
            wskprops.AUTH = auth
            if (subject) wskprops.SUBJECT = subject
            resolve(wskprops)
        }
    })
}))

/**
 * Write the given wskprops data structure to ~/.wskprops
 *
 * @return resolves with the wskprops data structure
 *
 */
const writeToLocalWskProps = wskprops => new Promise((resolve, reject) => {
    let props = ''
    for (let key in wskprops) {
        props += `${key}=${wskprops[key]}\n`
    }
    fs.writeFile(wskpropsFile, props, err => {
        if (err) reject(err)
        else resolve(wskprops.AUTH)
    })
})

/**
 * Read-and-update an auth choice to ~/.wskprops
 *
 */
const updateLocalWskProps = (wsk, auth, subject) => readFromLocalWskProps(wsk, auth, subject).then(writeToLocalWskProps)

/**
 * List registered namespaces
 *
 */
const list = () => namespace.list()
      .then(list => list.map(ns => Object.assign({}, ns, {
	  type: 'namespaces',
	  name: ns.namespace,
          onclick: () => repl.pexec(`auth switch ${ns.namespace}`)
      })))

/** return the argv sliced after the index of verb */
const slice = (argv, verb) => argv.slice(argv.indexOf(verb) + 1)
const firstArg = (argv, verb) => argv[argv.indexOf(verb) + 1]

/**
 * Switch to use a different namespace, by name, given by argv[2]
 *
 */
const use = (wsk, commandTree) => verb => (_1, _2, _3, _4, _5, _6, argv) => namespace.get(firstArg(argv, verb)).then(auth => {
    if (auth) {
	return updateLocalWskProps(wsk, auth)
            .then(namespace.use)
            .then(informUserOfChange(wsk, commandTree))
    } else {
        return namespace.list().then(namespaces => {
            const ns = firstArg(argv, verb)
            console.error(`Namespace not found ${ns} ${JSON.stringify(namespaces)}`)
            throw new Error(`The details for this namespace were not found: ${ns}`)
        })
    }
})

/** this is the auth body */
module.exports = (commandTree, prequire) => {
    const wsk = prequire('/ui/commands/openwhisk-core')

    commandTree.subtree('/host', { usage: usage.host.toplevel })
    commandTree.subtree('/auth', { usage: usage.auth.toplevel })

    const clicky = (parent, cmd, exec = repl.pexec) => {
        const dom = document.createElement('span')
        dom.className = 'clickable clickable-blatant'
        dom.innerText = cmd
        dom.onclick = () => exec(cmd)
        parent.appendChild(dom)
    }

    /** register a new namespace, by auth, given by argv[2] */
    const addFn = (key, subject) => {
        debug('add', key, subject)

        const previousAuth = wsk.auth.get()
        return wsk.auth.set(key)
            .then(() => namespace.init(true)) // true means that we'll do the error handling
            .then(() => updateLocalWskProps(wsk, key, subject))
            .then(informUserOfChange(wsk, commandTree, subject))
            .catch(err => {
                if (err.statusCode === 401) {
                    // then the key is bogus, restore the previousAuth
                    return wsk.auth.set(previousAuth)
                        .then(() => {
                            err.error.error = 'The supplied authentication key was not recognized'
                            throw err
                        })

                } else {
                    console.log(err)
                    // otherwise, guide the user towards possibly helpful commands
                    const dom = document.createElement('div')
                    dom.appendChild(document.createTextNode('Please select a namespace, using '))
                    clicky(dom, 'auth list')
                    dom.appendChild(document.createTextNode(' or '))
                    clicky(dom, 'auth add', repl.partial)
                    return dom
                }
            })
    }
    const add = (_1, _2, _3, _4, _5, _6, argv) => addFn(firstArg(argv, 'add'))

    const listCmd = commandTree.listen('/auth/list', list, { usage: usage.auth.list })
    commandTree.synonym('/auth/ls', list, listCmd)

    const useFn = use(wsk, commandTree)
    const useCmd = commandTree.listen('/auth/switch', useFn('switch'), { usage: usage.auth.switch })
    // commandTree.synonym('/auth/switch', useFn('switch'), useCmd)
    //commandTree.synonym('/auth/use', useFn, useCmd)

    const addCmd = commandTree.listen('/auth/add', add, { usage: usage.auth.add })
    //commandTree.synonym('/auth/install', use, addCmd)

    /**
     * OpenWhisk API host: get and set commands
     *
     */
    commandTree.listen('/host/get', () => wsk.apiHost.get(), { usage: usage.host.get })
    commandTree.listen('/host/set',
                       (_1, _2, _a, _3, _4, _5, argv_without_options, options) => {
                           const argv = slice(argv_without_options, 'set')
                           let host = argv[0] || options.host // the new apihost to use
                           let ignoreCerts = options.ignoreCerts || options.insecureSSL || options.insecure
                           let isLocal = false // is this a local openwhisk?

                           if (!host || options.help) {
                               throw new Error('Usage: host set <hostname>')
                           } else if (host === '<your_api_host>') {
                               // clicking on the host in the upper right prefills some content;
                               // if the user hits return, we want the operation to be cancelled
                               // see shell issue #192
                               throw new Error('Operation cancelled')
                           }

                           //
                           // this command accepts short-hands for a
                           // couple of common scenarios. we check for
                           // those here
                           //
                           if (host === 'dallas' || host === 'us-south') {
                               // accept a short-hand for the Dallas Bluemix OpenWhisk
                               host = 'https://openwhisk.ng.bluemix.net'
                           } else if (host === 'london' || host === 'eu-gb') {
                               // accept a short-hand for the London Bluemix OpenWhisk
                               host = 'https://openwhisk.eu-gb.bluemix.net'
                           } else if (host === 'frankfurt' || host === 'eu-de') {
                               // accept a short-hand for the Frankfurt Bluemix OpenWhisk
                               host = 'https://openwhisk.eu-de.bluemix.net'
                           } else if (host === 'docker-machine' || host === 'dm' || host === 'mac' || host === 'darwin' || host === 'macos') {
                               // local docker-machine host (this is usually macOS)
                               host = 'http://192.168.99.100:10001'
                               ignoreCerts = true
                               isLocal = true
                           } else if (host === 'vagrant') {
                               // local vagrant
                               host = 'https://192.168.33.13'
                               ignoreCerts = true
                               isLocal = true
                           } else if (host === 'local' || host === 'localhost') {
                               // try a variety of options
                               const variants = [ 'https://192.168.33.13', 'https://192.168.33.16',        // these are vagrant
                                                  'http://172.17.0.1:10001', 'http://192.168.99.100:10001' // these are direct-to-controller
                                                ]
                               const request = require('request')

                               host = new Promise((resolve, reject) => {
                                   const ping = idx => {
                                       debug('ping', idx)
                                       const host = variants[idx]

                                       debug('trying local', host)

                                       const tryNext = err => {
                                           console.error(err)
                                           if (idx === variants.length - 1) {
                                               reject('No local OpenWhisk host found')
                                           } else {
                                               // nope! try the next one in the variants list
                                               ping(idx + 1)
                                           }
                                       }

                                       const req = request.get({ url: `${host}/ping`,
                                                                 rejectUnauthorized: false,
                                                                 timeout: 500
                                                               })
                                             .on('response', () => {
                                                 ignoreCerts = true
                                                 isLocal = true
                                                 resolve(host)
                                             }).on('error', tryNext)
                                   }
                                   ping(0)
                               })
                           }

                           return Promise.resolve(host).then(host => wsk.apiHost.set(host, { ignoreCerts })
                               .then(namespace.setApiHost)
                               .then(notifyOfHostChange(host))
                               .then(() => namespace.list().then(auths => {
                                   debug('got auths', auths)
                               //
                               // after switching hosts, we'll need to get a new AUTH key. either:
                               //
                               //    1. the user provided one on the CLI (specifiedKey), or
                               //    2. the user has not yet registered any keys for this host
                               //    3. there is exactly one key (that the user has previously registered with an auth add command)
                               //       in this case, we use that singleton auth key without question
                               //    4. there user has previously registered more than one; in this case, we list them
                               //
                               const specifiedKey = argv[1] || options.auth || options.key
                               if (specifiedKey) {
                                   // use `auth add` to register the key for this host
                                   return repl.qfexec(`auth add ${specifiedKey}`)
                               } else if (auths.length === 0) {
                                   if (isLocal) {
                                       // fixed key for local openwhisk
                                       return repl.qfexec('auth add 23bc46b1-71f6-4ed5-8c54-816aa4f8c502:123zO3xZCLrMN6v2BKK1dXYFpXlPkccOFqm12CdAsMgRU4VrNZ9lyGVCGuMDGIwP')
                                   }
                                   // no keys, yet. enter a special mode requesting further assistance
                                   namespace.setNoNamespace()
                                   const dom = document.createElement('div'),
                                         clicky = document.createElement('span'),
                                         cmd = 'auth add <AUTH_KEY>'

                                   clicky.className = 'clickable clickable-blatant'
                                   clicky.innerText = cmd
                                   clicky.onclick = () => repl.partial(cmd)

                                   dom.appendChild(document.createTextNode('Before you can proceed, please provide an OpenWhisk auth key, using '))
                                   dom.appendChild(clicky)
                                   return dom
                                       
                               } else if (auths.length === 1) {
                                   // if there's just one namespace, then select it
                                   return repl.qfexec(`auth switch ${auths[0].namespace}`)
                               } else {
                                   // otherwise, offer a list of them to the user
                                   namespace.setPleaseSelectNamespace()
                                   return list()
                               }
                               })))
                       },
                       { usage: usage.host.set })

    return {
        add: addFn
    }
}
