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

const namespace = (function() {
    let cached
    const self = {},
          key = 'wsk.namespaces',
          read = () => wsk.apiHost.get().then(host => {
              let model = cached
              if (!model) {
                  const raw = localStorage.getItem(key)
                  try {
                      //console.log(`ui::read ${host} ${raw}`)
                      model = raw ? JSON.parse(raw) : {}
                  } catch (e) {
                      console.error(`Error parsing namespace JSON ${raw}`)
                      console.error(e)
                      model = {}
                  }
              
                  if (!model[host]) {
                      console.log(`ui::read no model yet for ${host}`)
                      model[host] = {}
                  }

                  cached = model
              }
              return {
                  _full: model,            // the full model, needed for reserializing
                  _host: host,             // help for updates and reserializing
                  namespaces: model[host]  // this host's model
              }
          }),
          write = model => {
              cached = model._full
              localStorage.setItem(key, JSON.stringify(model._full))
          }

    let wsk

    const setApiHost = apiHost => {
        const apiHostDom = document.querySelector('#openwhisk-api-host')

        // strip off the proto
        const idx = apiHost.indexOf('://')
        apiHostDom.innerText = idx >= 0 ? apiHost.substring(idx + '://'.length) : apiHost
        //apiHostDom.setAttribute('size', apiHostDom.value.length + 3)
    }
    self.setApiHost = setApiHost

    /** for debugging only; removes localStorage model for current host */
    /*self.__reset = () => wsk.apiHost.get().then(host => read().then(model => {
        delete model[host]
        console.error('namespace::reset', host, model[host])
        write(model)
    }))
    self.__lookup = () => wsk.apiHost.get().then(host => read().then(model => console.error(`Namespace list for ${host} is ${model.namespaces ? JSON.stringify(model.namespaces) : 'empty'}`)))*/
    
    const setNamespace = namespace => {
        if (!namespace) {
            return setNeedsNamespace()
        }

        // UI bits
        console.log(`ui::setNamespace ${namespace}`)
        const namespaceDom = document.querySelector('#openwhisk-namespace')
        namespaceDom.className = 'clickable' // remove any prior oops
        namespaceDom.onclick = () => repl.pexec('auth list')
        namespaceDom.innerText = namespace
        namespaceDom.setAttribute('data-value', namespace)

        // persistence bits
        return store(namespace, wsk.auth.get())
    }

    /** user does not have a namespace! warn the user of how to proceed */
    self.setNoNamespace = () => {
        const namespaceDom = document.querySelector('#openwhisk-namespace')
        namespaceDom.className += ' oops'
        namespaceDom.innerText = 'no auth key!'
        namespaceDom.onclick = () => repl.partial('auth add <your_auth_key>')
        namespaceDom.removeAttribute('data-value')
    }

    /** user has a namespace, but needs to select one before they can proceed */
    self.setPleaseSelectNamespace = () => {
        const namespaceDom = document.querySelector('#openwhisk-namespace')
        namespaceDom.className += ' oops'
        namespaceDom.innerText = 'please select a namespace'
        namespaceDom.removeAttribute('data-value')
    }

    /** we don't know yet what's going on, all we know is that the wsk.namespace.get call failed */
    const setNeedsNamespace = err => {
        // oops, we're in a bit of a weird state. if we get here,
        // then the user has specified a valid api host, but
        // hasn't yet selected a namespace.
        return self.list().then(auths => {
            if (auths.length === 0) {
                // user has no namespaces, and so needs to use
                // auth add to tell us about one
                self.setNoNamespace()
            } else if (auths.length === 1) {
                // user has one namespace, so select it
                repl.pexec(`auth switch ${auths[0].namespace}`)
            } else {
                // user has many namespaces, so list them
                self.setPleaseSelectNamespace()
                repl.pexec(`auth list`)
            }
        })
    }
    self.setNeedsNamespace = setNeedsNamespace

    /** Record namespace to local store */
    const store = (namespace, auth) => {
        return read().then(model => {
            //console.log(`ui::store ${namespace} ${auth} ${JSON.stringify(model._full)}`)
            model._full[model._host][namespace] = auth
            //console.log(`ui::store2 ${namespace} ${auth} ${JSON.stringify(model._full)}`)
            write(model)

            // debug
            //read().then(model => console.log(`ui::store3 ${namespace} ${auth} ${JSON.stringify(model._full)}`))
        })
    }

    self.store = store

    /** initialize the apihost and namespace bits of the UI */
    self.init = (noCatch, {noAuthOk=false}={}) => {
        wsk = plugins.require('/ui/commands/openwhisk-core')
        return wsk.apiHost.get()      // get the current apihost
            .then(setApiHost)         // udpate the UI for the apihost
            .then(wsk.namespace.get)  // get the namespace associated with the current auth key
            .then(setNamespace)       // update the UI for the namespace
            .catch(err => {
                console.error('namespace::init error ' + JSON.stringify(err), err)
                document.body.classList.add('no-auth')
                if (!noCatch) {
                    return setNeedsNamespace(err)
                } else if (!noAuthOk) {
                    throw err
                }
            })
    }

    /** list known namespaces */
    self.list = () => read().then(model => {
        const namespaces = model.namespaces
        const A = []
        for (let namespace in namespaces) {
            A.push({
                namespace: namespace,
                auth: namespaces[namespace]
            })
        }
        console.log('namespace::list', A)
        return A
    })

    /** the currently selected namespace */
    self.current = () => document.querySelector('#openwhisk-namespace').getAttribute('data-value')

    /** switch to use the given openwhisk auth */
    self.use = auth => wsk.auth.set(auth).then(() => self.init()) // make sure init doesn't get any input
    
    /** fetch the namespace details for the given namespace, by name */
    self.get = name => read().then(model => model.namespaces[name])

    return self
})()

/** add a right-click context menu */
const addContextClickMenu = () => {
    const remote = require('electron').remote,
          buildEditorContextMenu = remote.require('electron-editor-context-menu')

    window.addEventListener('contextmenu', function(e) {
        // Only show the context menu in text editors.
        //if (!e.target.closest('textarea, input, [contenteditable="true"]')) return;

        const menu = buildEditorContextMenu();

        // The 'contextmenu' event is emitted after 'selectionchange' has fired but possibly before the
        // visible selection has changed. Try to wait to show the menu until after that, otherwise the
        // visible selection will update after the menu dismisses and look weird.
        setTimeout(function() {
            menu.popup(remote.getCurrentWindow());
        }, 30);
    });
}

const ui = (function() {
    const self = {},
          ui = self,
          commandTree = require('./content/js/command-tree'),
          util = require('util'),
          prettyPrintDuration = require('pretty-ms'),
          bottomStripe = require('./content/js/bottom-stripe'),
          {ipcRenderer, remote} = require('electron')

    remote.getCurrentWindow().on('enter-full-screen', function() {
        document.body.classList.add('fullscreen')
    })
    remote.getCurrentWindow().on('leave-full-screen', function() {
        document.body.classList.remove('fullscreen')
    })
        
    // this will be cleaned up once const ui becomes a module
    let history, sidecarVisibility, wsk, isAnonymousLet

    // do we want to stick to the sidecar, once it's open --- no escape to toggle it closed?
    let sidecarOnly = false

    const keys = {
        ENTER: 13,
        ESCAPE: 27,
        TAB: 9,
        C: 67,
        U: 85,
        UP: 38,
        P: 80,
        DOWN: 40,
        L: 76,
        N: 78,
        ZOOM_RESET: 48,
        ZOOM_IN: 187,
        ZOOM_OUT: 189,
        END: 35,
        HOME: 36
    }
    self.keys = keys

    /** show and hide the fullscreen widget */
    self.hideFullscreen = () => {
        document.querySelector('#full-screen').className = ''
    }
    self.showFullscreen = () => {
        const container = document.querySelector('#full-screen')
        ui.removeAllDomChildren(container)
        container.className = 'visible'
        return container
    }

    self.setStatus = (block, status) => {
        block.setAttribute('class', `${block.getAttribute('class').replace(/processing/, '').replace(/repl-active/, '')} ${status}`)
    }

    self.currentSelection = () => {
        const sidecar = document.getElementById('sidecar')
        return sidecar && sidecar.entity
    }
    self.clearSelection = () => sidecarVisibility.hide(true) // true means also clear selection model

    const isVowel = c => c === 'a' || c === 'e' || c === 'i' || c === 'o' || c === 'u'
    const startsWithVowel = s => isVowel(s.charAt(0))
    self.startsWithVowel = startsWithVowel

    /**
     * Send a synchronous message to the main process
     *
     */
    const tellMain = (message, channel) => new Promise((resolve, reject) => {
        ipcRenderer[channel === 'asynchronous-message' ? 'send' : 'sendSync'](channel || 'synchronous-message',
                             typeof message === 'string'
                             ? JSON.stringify({ operation: message })
                             : JSON.stringify(message))

        if (channel === 'asynchronous-message') {
            console.log('listening')
            ipcRenderer.on('asynchronous-reply', (event, response) => {
                console.log('got response', response)
                if (response === 'true') {
                    resolve(true)
                } else {
                    reject(response)
                }
            })
        } else {
            resolve(true)
        }
    })
    self.tellMain = tellMain

    /**
     * These are extensions to the base wsk CLI that are specific to the UI
     *
     */
    self.commands = {
    }

    self.getInitialBlock = () => document.querySelector('#main-repl .repl-block.repl-initial')
    self.getCurrentBlock = () => document.querySelector('#main-repl .repl-block.repl-active')
    self.getCurrentProcessingBlock = () => document.querySelector('#main-repl .repl-block.processing')
    self.getPrompt = block => block && block.querySelector && block.querySelector('input') || { focus: () => true }
    self.getInitialPrompt = () => self.getPrompt(self.getInitialBlock())
    self.getCurrentPrompt = () => self.getPrompt(self.getCurrentBlock())

    /**
     * Update the caret position in an html INPUT field
     *
     */
    const setCaretPosition = (ctrl,pos) => {
        if (ctrl.setSelectionRange) {
            ctrl.focus();
            ctrl.setSelectionRange(pos,pos);
        } else if (ctrl.createTextRange) {
            var range = ctrl.createTextRange();
            range.collapse(true);
            range.moveEnd('character', pos);
            range.moveStart('character', pos);
            range.select();
        }
    }
    const setCaretPositionToEnd = input => setCaretPosition(input, input.value.length)
    const updateInputAndMoveCaretToEOL = (input, newValue) => {
        input.value = newValue
        setTimeout(() => setCaretPositionToEnd(input), 0)
    }
    
    self.unlisten = prompt => prompt && (prompt.onkeypress = null)
    self.listen = prompt => {
        // console.log('repl::listen', prompt.parentNode.parentNode)
        prompt.parentNode.parentNode.className = `${prompt.parentNode.parentNode.getAttribute('data-base-class')} repl-active`
        prompt.onkeypress = event => {
            const char = event.keyCode
            if (char === keys.ENTER) {
                // user typed Enter; we've finished Reading, now Evalute
                repl.eval()
            }
        }

        prompt.onkeydown = event => {
            const char = event.keyCode
            if (char === keys.UP || (char === keys.P && event.ctrlKey)) {
                // go to previous command in history
                const newValue = (history.previous() || {raw: ''}).raw
                if (newValue) {
                    updateInputAndMoveCaretToEOL(prompt, newValue)
                }
            } else if (char === keys.C && event.ctrlKey) {
                // Ctrl+C, cancel
                repl.doCancel()

            } else if (char === keys.U && event.ctrlKey) {
                // clear line
                prompt.value = ''

            } else if (char === keys.ZOOM_RESET && (event.ctrlKey || event.metaKey)) {
                // zooming
                event.preventDefault()
                const main = document.querySelector('main')
                main.removeAttribute('data-zoom')
                // maybe? repl.scrollIntoView()

            } else if ((char === keys.ZOOM_IN || char === keys.ZOOM_OUT) && (event.ctrlKey || event.metaKey)) {
                // zooming
                event.preventDefault()
                const main = document.querySelector('main'),
                      factor = char === keys.ZOOM_IN ? 1 : -1,
                      newZoom = parseInt(main.getAttribute('data-zoom') || '1') + factor

                if (newZoom <= 10 && newZoom >= -2) {
                    // zoom, if we are within the supported zoom extent
                    main.setAttribute('data-zoom', newZoom)
                    // maybe? repl.scrollIntoView()
                }

            } else if (char === keys.L && (event.ctrlKey || event.metaKey)) {
                // clear screen; capture and restore the current
                // prompt value, in keeping with unix terminal
                // behavior
                const current = ui.getCurrentPrompt().value
                repl.pexec('clear')
                    .then(() => {
                        if (current) {
                            // restore the current prompt value
                            ui.getCurrentPrompt().value = current
                        }
                    })

            } else if (char === keys.HOME) {
                // go to first command in history
                const newValue = history.first().raw
                if (newValue) {
                    updateInputAndMoveCaretToEOL(prompt, newValue)
                }
            } else if (char === keys.END) {
                // go to last command in history
                const newValue = (history.last() || {raw: ''}).raw
                updateInputAndMoveCaretToEOL(prompt, newValue)
            } else if (char === keys.DOWN || (char === keys.N && event.ctrlKey)) {
                // going DOWN past the last history item will result in '', i.e. a blank line
                const newValue = (history.next() || {raw: ''}).raw
                updateInputAndMoveCaretToEOL(prompt, newValue)
            }
        }

        prompt.onpaste = repl.paste
    }

    self.installBlock = (parentNode, currentBlock, nextBlock) => () => {
        if (!nextBlock) return // error cases

        parentNode.appendChild(nextBlock)
        self.listen(self.getPrompt(nextBlock))
        nextBlock.querySelector('input').focus()
        nextBlock.setAttribute('data-input-count', parseInt(currentBlock.getAttribute('data-input-count')) + 1)

        repl.setContextUI({
            context: commandTree.currentContext(),
            selection: ui.currentSelection()
        }, nextBlock)
    }

    self.oopsMessage = err => {
        try {
            return (err.error && err.error.response && err.error.response.result && err.error.response.result.error && err.error.response.result.error.error) // feed creation error. nice
                || (err.error && err.error.response && err.error.response.result && err.error.response.result.error)
                || (err.error && err.error.error)
                || err.message
                || err.error
                || err
                || 'Internal Error'
        } catch (err) {
            console.error(err)
            return 'Internal Error'
        }
    }
    
    self.oops = (block, nextBlock) => err => {
        const message = self.oopsMessage(err)
        console.error(`${message} ${err} ${err && err.stack}`, err)

        if (!block) return // we're not attached to a prompt right now

        ui.setStatus(block, 'error')

        const resultDom = block.querySelector('.repl-result')
        const oops = document.createElement('div')
        oops.setAttribute('class', 'oops')

        if (err.message && err.message.nodeName) {
            // err.message is a DOM
            oops.appendChild(err.message)
        } else if (err.nodeName) {
            // err is a DOM
            oops.appendChild(err)
        } else {
            // we'll go with our formatted message
            oops.appendChild(document.createTextNode(message))
        }
        resultDom.appendChild(oops)

        // add the http status code, if we have it (helps with testing)
        oops.setAttribute('data-status-code', err.statusCode || err.code || 0)

        self.installBlock(block.parentNode, block, nextBlock)()

        // indicate that we've already rendered the block
        return false
    }
    
    self.ok = (parentNode, suffix) => {
        const okLine = document.createElement('div')

        const ok = document.createElement('span')
        okLine.appendChild(ok)
        ok.setAttribute('class', 'ok')
        ok.appendChild(document.createTextNode('ok'))

        if (suffix) {
            okLine.appendChild(typeof suffix === 'string' ? document.createTextNode(suffix) : suffix)
        }

        parentNode.appendChild(okLine)
        return okLine
    }

    /**
     * Render an activation response in the CLI portion of the UI
     *
     */
    self.showActivation = (response, resultDom) => {
        if (!response.response && response.activationId) {
            // probably non-blocking invoke
            // say "ok: invoked foo with id xxx"
            const suffix = document.createElement('span'),
                  nameParts = response.entity.name.split(/\//),
                  isAbsolute = response.entity.name.charAt(0) === '/',
                  ns = isAbsolute && nameParts[1],
                  restIndex = isAbsolute ? 2 : 0, // '/a/b/c' => ['', 'a', 'b', 'c'], rest starts at 2
                  nsForDisplay = !ns || ns === namespace.current() ? '' : `/${ns}/`,
                  prettyName = `${nsForDisplay}${nameParts.slice(restIndex).join('/')}`

            suffix.appendChild(document.createTextNode(`: invoked ${prettyName} with id `))

            const clickable = document.createElement('span')
            clickable.className = 'clickable activationId'
            clickable.innerText = response.activationId
            clickable.onclick = () => {
                const fetch = iter => 
                      repl.pexec(`await ${response.activationId}`)
                      .catch(err => {
                          if (iter < 10) {
                              setTimeout(() => fetch(iter + 1), 500)
                          }
                      })
                fetch(0)
            }
            suffix.appendChild(clickable)

            self.ok(resultDom, suffix)

        } else {
            // blocking invoke, we have a response
            ui.showEntity(response)
            ui.ok(resultDom)
        }
    }

    const removeAllDomChildren = node => {
        while (node.firstChild) {
            node.removeChild(node.firstChild);
        }
    }
    ui.removeAllDomChildren = removeAllDomChildren

    const limitFormatter = {
        logs: value => `${value} MB`,
        memory: value => `${value} MB`,
        timeout: value => `${value / 1000} sec`
    }

    // the naming convention of highlight.js sometimes differs from that of openwhisk
    const uiNameForKind_map = {
        nodejs: 'javascript'
    }
    const uiNameForKind = kind => uiNameForKind_map[kind] || kind

    self.maybeHideEntity = entity => {
        const sidecar = document.querySelector('#sidecar'),
              entityMatchesSelection = sidecar.entity
              && sidecar.entity.name === entity.name
              && sidecar.entity.namespace === entity.namespace

        console.log('repl::maybeHideEntity', entityMatchesSelection, entity)
        if (entityMatchesSelection) {
            sidecarVisibility.hide()
            return true
        }
    }

    /**
     * convenience routine for UI elements wishing to toggle sidecar visibility
     *
     */
    self.toggleSidecar = () => {
        sidecarVisibility.toggle()
    }

    /**
     * Return a renderer that will draw a representation of the action in the given parentNode
     *   (we need the useThisEntityType for the case of rules, where the entity only has the name and path)
     *
     */
    const renderActionBubble = parentNode => {
        const hash = {} // map name to color index
        let nextColorIndex = 0

        removeAllDomChildren(parentNode)

        // here is the renderer function that we promised to return
        return (entity, options) => {
            const actionNamespace = entity.namespace || (entity.path ? `/${entity.path}` : wsk.parseNamespace(entity))
            const actionName = entity.name || wsk.parseName(entity)

            if (typeof actionName !== 'string') {
                actionName = actionName.name
            }
            // name displayed in UI, and color index for node
            let colorIndex = hash[actionName]
            if (colorIndex === undefined) {
                colorIndex = nextColorIndex++
                hash[actionName] = colorIndex
            }

            const action = document.createElement('div')
            action.className = `sequence-component sequence-component-${colorIndex} ${options && options.css || ''}`
            parentNode.appendChild(action)

            const inner = document.createElement('div')
            inner.className = 'sequence-component-inner'
            action.appendChild(inner)

            // label of the bubble; note that this is purposefully asynchronous -- fetching the label shouldn't clog up the works
            repl.qexec(`wsk ${options && options.type || 'action'} get "${actionNamespace}/${actionName}"`)
                .then(entity => {
                    const combinatorArtifacts = entity.annotations && entity.annotations.find( ({key}) => key === 'wskng.combinators')
                    if (combinatorArtifacts && combinatorArtifacts.value) {
                        const annotations = util.isArray(combinatorArtifacts.value) ? combinatorArtifacts.value : [combinatorArtifacts.value]
                        annotations.forEach(annotation => {
                            if (annotation.label) {
                                action.setAttribute('title', annotation.label)
                                const innerName = document.createElement('div')
                                innerName.className = 'emphasize'
                                innerName.innerText = annotation.badge
                                const innerExtra = document.createElement('div')
                                innerExtra.className = 'deemphasize'
                                innerExtra.innerText = annotation.label
                                inner.appendChild(innerName)
                                inner.appendChild(innerExtra)
                            } else {
                                inner.innerText = annotation.badge
                            }
                        })
                    } else {
                        const anonymousCode = isAnonymousLet(entity)
                        if (anonymousCode) {
                            inner.innerText = anonymousCode
                        } else {
                            const innerName = document.createElement('div')
                            innerName.className = 'emphasize'
                            innerName.innerText = actionName
                            inner.appendChild(innerName)
                        }
                    }
                })

            // click handler
            if (actionNamespace) {
                const nsForClick = actionNamespace.indexOf('/') >= 0? actionNamespace : `/${actionNamespace}`
                action.onclick = () => repl.pexec(`wsk ${options && options.type || 'action'} get "${nsForClick}/${actionName}"`).then(ui.showEntity)
            }
        }
    }

    // e.g. 2017-06-15T14:41:15.60027911Z  stdout:
    const logPatterns = {
        activationId: /^[a-fA-f0-9]{32}/,
        logLine: /^\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.[\d]+Z)\s+(\w+):\s+(.*)/,
        openwhiskNoise: new RegExp('\/nodejsAction\/node_modules\/', 'g')
    }

    /**
     * Beautify the given stringified json, placing it inside the given dom container
     *
     */
    const prettyJSON = (raw, container) => {
        const beautify = require('js-beautify')
        container.innerText = beautify(raw, { wrap_line_length: 80 })
        setTimeout(() => hljs.highlightBlock(container), 0)
    }

    /**
     * Render the given field of the given entity in the given dom container
     *
     */
    const tryParseDate = s => {
        try {
            return new Date(s).getTime()
        } catch (e) {
            return s
        }
    }
    const renderField = (container, entity, field, noRetry) => {
        if (field === 'raw') {
            // special case for displaying the record, raw, in its entirety
            const value = Object.assign({}, entity)
            delete value.modes
            delete value.apiHost
            delete value.verb
            delete value.type
            const raw = JSON.stringify(value, undefined, 4)
            if (raw.length < 10 * 1024) {
                prettyJSON(raw, container)
            } else {
                // too big to beautify
                const raw = JSON.stringify(value, (key, value) => {
                    if (key == 'code') {
                        // maybe this is why we're too big??
                        return '\u2026'
                    } else {
                        return value
                    }
                }, 4)

                if (raw.length > 10 * 1024) {
                    container.innerText = raw.substring(0, 10 * 1024) + '\u2026'
                } else {
                    prettyJSON(raw, container)
                }
            }
            return
        }            

        let value = entity[field]
        if (!value || value.length === 0) {
            container.innerText = `This ${wsk.toOpenWhiskKind(entity.type)} has no ${field}`
        } else if (typeof value === 'string') {
            // render the value like a string
            if (field === 'source') {
                const beautify = require('js-beautify')
                container.innerText = beautify(value, { wrap_line_length: 80 })
                setTimeout(() => hljs.highlightBlock(container), 0)
            } else {
                container.innerText = value
            }
        } else if (field === 'logs' && util.isArray(value)) {
            if (value.length > 0 && value[0].match(logPatterns.activationId)) {
                // then we have a list of activation ids; value is an
                // array of activationIds
                return require('./content/js/views/list/activations').render({entity, activationIds: value, container})
            }

            const logTable = document.createElement('div')
            logTable.className = 'log-lines'
            removeAllDomChildren(container)
            container.appendChild(logTable)

            const tryJSON = state => {
                if (state.accum) {
                    try {
                        state.accum.match[3] = JSON.parse(state.accum.smashed)
                    } catch (e) {
                        // oh well
                        state.accum.match[3] = state.accum.smashed
                    }
                    state.lines.push(state.accum.match)
                    state.accum = undefined
                }
            }
            // try combining log lines into JSON structs
            const newLines = value.reduce((state, logLine) => {
                const match = logLine.match(logPatterns.logLine)
                if (!match) {
                    state.lines.push(logLine)
                } else if (!state.accum) {
                    state.accum = {
                        match: match,
                        date: tryParseDate(match[1]),
                        lines: [logLine],
                        smashed: match[3]
                    }
                } else {
                    const thisDate = tryParseDate(match[1])
                    if (match && match[2] === state.accum.match[2] && thisDate - state.accum.date < 1000) {
                        // both this and previous written to stderr, and no great time separation?
                        // then smash them together into one record
                        state.accum.lines.push(logLine)
                        state.accum.smashed += `\n${match[3]}`
                    } else {
                        tryJSON(state)
                    }

                }

                return state
            }, { accum: undefined, lines: [] })
            tryJSON(newLines)
            console.log(newLines)

            newLines.lines.forEach(logLine => {
                const lineDom = document.createElement('div')
                lineDom.className = 'log-line'
                logTable.appendChild(lineDom)

                const match = util.isArray(logLine) && logLine
                //console.log('LOGLINE!!!!!!!!!!!!!!', logLine, match)
                if (match) {
                    const date = document.createElement('div')
                    //const type = document.createElement('div')
                    const mesg = document.createElement('div')
                    lineDom.appendChild(date)
                    //lineDom.appendChild(type)
                    lineDom.appendChild(mesg)

                    lineDom.className = `${lineDom.className} logged-to-${match[2]}` // add stderr/stdout to the line's CSS class

                    date.className = 'log-field log-date'
                    //type.className = 'log-field log-type'
                    mesg.className = 'log-field log-message'

                    try {
                        date.innerText = new Date(match[1]).toLocaleString()
                    } catch (e) {
                        date.innerText = match[1]
                    }
                    //type.innerText = match[2]
                    mesg.innerText = match[3].replace(logPatterns.openwhiskNoise, '')
                } else if (typeof logLine === 'string') {
                    // unparseable log line, so splat out the raw text
                    lineDom.innerText = logLine
                } else {
                    // unparseable log line, so splat out the raw text
                    lineDom.appendChild(logLine)
                }
                
            })
        } else {
            // render the value like a JSON object
            // for now, we just render it as raw JSON, TODO: some sort of fancier key-value pair visualization?
            if (field === 'parameters' || field === 'annotations') {
                // special case here: the parameters field is really a map, but stored as an array of key-value pairs
                value = value.reduce((M, kv) => {
                    M[kv.key] = kv.value;
                    return M
                }, {})
            }
            const beautify = require('js-beautify').js_beautify
            container.innerText = beautify(JSON.stringify(value))

            // apply the syntax highlighter to the JSON
            setTimeout(() => hljs.highlightBlock(container), 0)
        }
    }

    /**
     * Show custom content in the sidecar
     *
     */
    self.showCustom = (custom, options) => {
        if (!custom.content) return
        console.log('ui::showCustom', custom)

        const sidecar = document.querySelector('#sidecar')

        // which viewer is currently active?
        sidecar.setAttribute('data-active-view', '.custom-content > div')

        // add mode buttons, if requested
        const modes = custom.modes
        if (!options || !options.leaveBottomStripeAlone) {
            bottomStripe.addModeButtons(modes, custom)
            sidecar.setAttribute('class', `${sidecar.getAttribute('data-base-class')} visible custom-content`)
        } else {
            sidecar.classList.add('custom-content')
        }

        if (custom.sidecarHeader === false) {
            // view doesn't want a sidecar header
            sidecar.classList.add('no-sidecar-header')
        }

        if (custom.displayOptions) {
            custom.displayOptions.forEach(option => {
                sidecar.classList.add(option)
            })
        }

        const replView = document.querySelector('#main-repl')
        replView.className = `sidecar-visible ${(replView.getAttribute('class') || '').replace(/sidecar-visible/g, '')}`

        const container = sidecar.querySelector('.custom-content')
        removeAllDomChildren(container)
        container.appendChild(custom.content)
    }

    /**
     * Given an entity name and an optional packageName, decorate the sidecar header
     *
     */
    self.addNameToSidecarHeader = (sidecar, name, packageName='', onclick) => {
        const nameDom = sidecar.querySelector('.sidecar-header-name-content')
        nameDom.className = nameDom.getAttribute('data-base-class')
        nameDom.querySelector('.package-prefix').innerText = packageName
        nameDom.querySelector('.entity-name').innerText = name

        if (onclick) {
            nameDom.querySelector('.entity-name').classList.add('clickable')
            nameDom.querySelector('.entity-name').onclick = onclick
        }

        return nameDom
    }

    /**
     * Pretty print a timestamp
     *
     */
    ui.prettyPrintTime = (timestamp, fmt='long', previousTimestamp) => {
        // compare now to then, to see if we need to show a year, etc.
        const now = new Date()
        const then = new Date(timestamp)

        if (now.getYear() === then.getYear()
            && now.getMonth() == then.getMonth()) {
            // same year and month as now

            // same day as now: just print the time
            const prev = previousTimestamp && new Date(previousTimestamp),
                  prevOnSameDay = prev && (prev.getYear() === then.getYear()
                                           && prev.getMonth() === then.getMonth()
                                           && prev.getDate() === then.getDate())
            const sameDay = () => {
                const res = document.createElement('span'),
                      prefix = document.createElement('span')
                prefix.classList.add('timestamp-same-day')
                prefix.innerText = 'Today at '
                res.appendChild(prefix)
                res.appendChild(document.createTextNode(then.toLocaleTimeString()))
                return res
            }

            if (now.getDate() == then.getDate()) {
                if (prevOnSameDay) {
                    if (fmt === 'delta') {
                        return `+${prettyPrintDuration(then - previousTimestamp)}`
                    } else {
                        return sameDay()
                    }
                } else {
                    return `Today at ${then.toLocaleTimeString()}`
                }
            } else {
                // same year and month, different day than now
                if (prevOnSameDay) {
                    return sameDay()
                } else {
                    return then.toLocaleString(navigator.language, {
                        weekday: fmt, month: fmt, day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric'
                    })
                }
            }
        } else {
            // different year or different month: print the long form
            return then.toLocaleString()
        }
    }

    /**
     * Given a web action, return the url that points to the deployed action
     *
     */
    const formatWebActionURL = action => {
        // note that we use json as the default content type
        const contentType = action.annotations && action.annotations.find(kv => kv.key === 'content-type-extension') || 'json'
        const https = action.apiHost.startsWith('https://') || action.apiHost.startsWith('http://') ? ''
              : action.apiHost === 'localhost' ? 'http://' : 'https://'
        const urlText = `${https}${action.apiHost}/api/v1/web/${action.namespace}/${!action.packageName ? 'default/' : ''}${action.name}.${contentType.value}`

        return urlText
    }

    /**
     * Load the given entity into the sidecar UI
     *
     */
    self.showEntity = (entity, options, block, nextBlock) => {
        console.log('ui::showEntity', entity, options)
        const sidecar = document.querySelector('#sidecar'),
              header = sidecar.querySelector('.sidecar-header')

        // which viewer is currently active?
        sidecar.setAttribute('data-active-view', '.sidecar-content')

        // in case we have previously displayed custom content, clear out the header
        const customHeaders = sidecar.querySelectorAll('.custom-header-content')
        for (let idx = 0; idx < customHeaders.length; idx++) {
            ui.removeAllDomChildren(customHeaders[idx])
        }

        // add mode buttons, if requested
        const modes = entity.modes || options && options.modes
        if (!options || !options.leaveBottomStripeAlone) {
            bottomStripe.addModeButtons(modes, entity, options)
        }

        // this return value will show up in the repl; true would be only "ok" appears
        let responseToRepl = true

        // remember the selection model
        if (!options || options.echo !== false) sidecar.entity = entity
        sidecar.setAttribute('class', `${sidecar.getAttribute('data-base-class')} visible entity-is-${entity.prettyType} entity-is-${entity.type}`)

        const replView = document.querySelector('#main-repl')
        replView.className = `sidecar-visible ${(replView.getAttribute('class') || '').replace(/sidecar-visible/g, '')}`

        const iconDom = sidecar.querySelector('.sidecar-header-icon')
        iconDom.removeAttribute('data-extra-decoration')
        iconDom.innerText = (entity.prettyType !== 'session' && entity.type === 'activations' ? entity.type : entity.prettyType || entity.type).replace(/s$/,'')

        // the name of the entity, for the header
        const nameDom = self.addNameToSidecarHeader(sidecar, entity.name, entity.packageName)

        const badges = header.querySelector('.badges')
        removeAllDomChildren(badges)
        const addBadge = badgeText => {
            const badge = document.createElement('badge')
            if (typeof badgeText === 'string') {
                badge.innerText = badgeText
            } else {
                badge.appendChild(badgeText)
            }
            badges.appendChild(badge)
            return badge
        }
        const addVersionBadge = action => action.version && addBadge(`v${action.version}`).classList.add('version')
        const maybeAddWebBadge = action => {
            const isWebExported = action.annotations && action.annotations.find(kv => kv.key === 'web-export' && kv.value)
            if (isWebExported) {
                const anchor = document.createElement('a'),
                      urlText = formatWebActionURL(action)

                const badge = addBadge(anchor)
                badge.classList.add('clickable')
                anchor.classList.add('entity-web-export-url')
                anchor.classList.add('has-url')
                anchor.innerText = 'web accessible'
                anchor.classList.add('plain-anchor')
                anchor.setAttribute('href', urlText)
                anchor.setAttribute('target', '_blank')

                if (!options || options.show === 'code' || options.show === 'default') {
                    responseToRepl = anchor.cloneNode(true)
                    responseToRepl.classList.remove('plain-anchor')
                    responseToRepl.innerText = urlText
                }
            }
        }
        
        const thirdPartyBodyContent = sidecar.querySelector('.sidecar-content .hook-for-third-party-content')
        thirdPartyBodyContent.className = 'hook-for-third-party-content no-content'
        //removeAllDomChildren(thirdPartyBodyContent)

        addVersionBadge(entity)

        // TODO move this piece into the redactor plugin, once we figure out how to support third party view mods
        const renderThirdParty = entity => {
            const combinatorArtifacts = entity.annotations && entity.annotations.find( ({key}) => key === 'wskng.combinators')
            if (combinatorArtifacts) {
                const annotations = util.isArray(combinatorArtifacts.value) ? combinatorArtifacts.value : [combinatorArtifacts.value]
                return annotations.reduce((renderingTakenCareOf, annotation) => {
                    if (annotation.role === 'replacement') {
                        //
                        // then this is a combinator over some original action
                        //
                        const addThirdPartyMessage = (text, where='innerText') => {
                            ui.removeAllDomChildren(thirdPartyBodyContent)
                            thirdPartyBodyContent.className = 'hook-for-third-party-content'
                            const message = document.createElement('span')
                            thirdPartyBodyContent.appendChild(message)
                            message[where] = text
                            return message
                        }

                        if (annotation.badge === 'zip') {
                            const code = Buffer.from(entity.exec.code, 'base64'),
                                  Zip = require('adm-zip'),
                                  zip = Zip(code),
		                  indexEntry = zip.getEntry('index.js')
                                  || zip.getEntry('index.py')
                                  || zip.getEntry('index.php')
                                  || zip.getEntry('index.swift')

                            if (indexEntry) {
                                const beautify = require('js-beautify').js_beautify,
                                      indexContent = zip.readAsText(indexEntry),
                                      src = sidecar.querySelector('.action-source')
                                src.innerText = beautify(indexContent.toString())
                                setTimeout(() => hljs.highlightBlock(src), 0)
                            } else {
                                addThirdPartyMessage('Unable to locate the index.js file in the zip file')
                            }
                        } else if (annotation.type === 'composition') {
                            // special decorations for compositions TODO move to plugin
                            const fsm = entity.annotations && entity.annotations.find(({key}) => key === 'fsm')
                            const {visualize} = plugins.require('wskflow')
                            const h = document.getElementById("sidecar").getBoundingClientRect().height
                            // visualize(fsm, containerSelector, width, height)
                            sidecar.classList.add('custom-content')
                            const container = document.querySelector('#sidecar > .custom-content')
                            removeAllDomChildren(container)
                            visualize(fsm.value, container, undefined, h)
                            sidecar.setAttribute('data-active-view', '.custom-content > div')

                        } else if (annotation.contentType === 'html') {
                            const frame = document.createElement('iframe'),
                                  container = sidecar.querySelector('#sidecar > .custom-content')
                            frame.style.width = '100%'
                            frame.style.border = 'none'
                            sidecar.setAttribute('data-active-view', '.custom-content > div')
                            sidecar.classList.add('custom-content')
                            removeAllDomChildren(container)
                            container.appendChild(frame)
                            frame.setAttribute('src', formatWebActionURL(entity))

                        } else {
                            addThirdPartyMessage('This is machine-generated code, wrapping around your original code.')
                        }

                        if (annotation.original) {
                            // offer a link to the original asset, if we have one
                            const linkToOriginal = document.createElement('a')
                            linkToOriginal.setAttribute('href', '#')
                            linkToOriginal.className = 'clickable'
                            linkToOriginal.innerText = 'View original action'
                            linkToOriginal.onclick = () => repl.pexec(`wsk action get "${annotation.original}"`)
                            thirdPartyBodyContent.appendChild(linkToOriginal)
                        }

                        if (annotation.badge && annotation.badge !== 'web') {
                            // render a badge, if we have one; we render web badges specially, with maybeAddWebBadge
                            addBadge(annotation.badge)
                        }

                        return true // yes, we took care of the rendering!
                    }

                    return renderingTakenCareOf
                }, false)
            }
        } // end of third party view mod
            
        const content = sidecar.querySelector('.sidecar-content')
        if (entity.exec) {
            const kind = sidecar.querySelector('.action-content .kind')
            if (entity.exec.kind) {
                const kindText = entity.exec.prettyKind || entity.exec.kind,
                      kindBits = kindText.split(/:/) // nodejs:6 => ['nodejs', '6']
                kind.innerText = kindBits[0]
                if (entity.exec.prettyKind === 'app') {
                    kind.innerText = `This entity represents a composition`
                } else if (entity.exec.kind === 'source') {
                    kind.innerText = `This is a preview of your app, it is not yet deployed`
                } else {
                    kind.innerText = `This is a ${kindText} action`
                }
            } else {
                kind.innerText = ''
            }

            /*const url = sidecar.querySelector('.entity-web-export-url')
            const isWebExported = entity.annotations && entity.annotations.find(kv => kv.key === 'web-export' && kv.value),
                  contentType = entity.annotations && entity.annotations.find(kv => kv.key === 'content-type-extension')
            if (isWebExported && contentType) {
                // then this action is web-exported
                const https = entity.apiHost.startsWith('https://') || entity.apiHost.startsWith('http://') ? ''
                      : entity.apiHost === 'localhost' ? 'http://' : 'https://',
                      urlText = `${https}${entity.apiHost}/api/v1/web/${entity.namespace}/${!entity.packageName ? 'default/' : ''}${entity.name}.${contentType.value}`
                url.className = 'entity-web-export-url has-url'
                url.setAttribute('href', urlText)
                if (!options || options.show === 'code' || options.show === 'default') {
                    responseToRepl = url.cloneNode(true)
                    responseToRepl.innerText = urlText
                }
            } else {
                url.className = 'entity-web-export-url'
                url.removeAttribute('href')
            }*/

            const sequence = sidecar.querySelector('.sequence-components')
            removeAllDomChildren(sequence)

            // remove any previous detail elements that might not be relevant to this entity
            sidecar.querySelector('.action-content .action-source').innerText = ''

            if (entity.exec.kind === 'sequence') {
                //
                // visualize the sequence
                //
                maybeAddWebBadge(entity)
                if (options && options.show !== 'code' && options.show !== 'default') {
                    //
                    // show some other attribute of the action
                    //
                    const container = sidecar.querySelector('.action-content .action-source')
                    renderField(container, entity, options.show)
                } else if (renderThirdParty(entity)) {
                    // then the third party rendering took care of it
                } else {
                    const extraCss = entity.exec.components.length < 5 ? 'small-node-count-canvas' : ''
                    sequence.className = `${sequence.getAttribute('data-base-class')} ${extraCss}`
                    setTimeout(() => entity.exec.components.map(renderActionBubble(sequence)), 0)
                }
            } else {
                //
                // visualize some sort of atomic/regular action
                //
                if (!entity.limits) {
                    sidecar.classList.add('no-limits-data')
                }

                if (!options || options.show === 'code' || options.show === 'default') {
                    maybeAddWebBadge(entity)
                    if (renderThirdParty(entity)) {
                        // then the third party rendering took care of it
                    } else {
                        if (entity.exec.code) {
                            //
                            // show the action's code
                            //
                        
                            if (!entity.exec.binary || !(entity.annotations && entity.annotations.find(({key}) => key === 'binary'))) {
                                //
                                // render the textual source code
                                //
                                const code = sidecar.querySelector('.action-content .action-source'),
                                      beautify = require('js-beautify').js_beautify

                                code.className = `action-source ${uiNameForKind(entity.exec.kind.substring(0, entity.exec.kind.indexOf(':')))}`
                                code.innerText = beautify(entity.exec.code)

                                // apply the syntax highlighter to the code; there is some but in higlightjs w.r.t. comments;
                                // we need to repeat in order to assure that the whole block isn't rendered as a giant comment
                                hljs.highlightBlock(code)
                                setTimeout(() => { code.innerText = beautify(entity.exec.code); hljs.highlightBlock(code) }, 100) // HACK HACK to work around highlightjs bug v0.9.12
                            } else {
                                // TODO what do we do with binary actions?
                            }
                        }
                    }
                } else if (options && options.show) {
                    //
                    // show some other attribute of the action
                    //
                    const container = sidecar.querySelector('.action-content .action-source')
                    renderField(container, entity, options.show)
                }
            }
        } else if (entity.type === 'rules') {
            // visualize the trigger and action parts of the rule
            const renderer = renderActionBubble(sidecar.querySelector('.rule-components'))
            renderer(entity.trigger, { css: 'trigger-node', type: 'trigger' })
            renderer(entity.action)

            // enabled indicator
            sidecar.classList.add(`rule-enabled-${entity.status === 'active'}`)

        } else if (entity.type === 'packages') {
            const actionCountDom = sidecar.querySelector('.package-action-count')
            const actionCount = entity.actions && entity.actions.length || 0
            actionCountDom.setAttribute('data-is-plural', actionCount !== 1)
            actionCountDom.querySelector('.package-content-count').innerText = actionCount

            const feedCountDom = sidecar.querySelector('.package-feed-count')
            const feedCount = entity.feeds && entity.feeds.length || 0
            feedCountDom.setAttribute('data-is-plural', feedCount !== 1)
            feedCountDom.querySelector('.package-content-count').innerText = feedCount

            const actions = sidecar.querySelector('.package-action-list')
            const feeds = sidecar.querySelector('.package-feed-list')
            const source = sidecar.querySelector('.package-content .package-source')
            removeAllDomChildren(actions)
            removeAllDomChildren(feeds)
            removeAllDomChildren(source)

            if (options && options.show !== 'content' && options.show !== 'default') {
                //
                // show some other attribute of the action
                //
                renderField(source, entity, options.show)
            } else {
                if (entity.actions) {
                    entity.actions.map(wsk.fillInActionDetails(entity))
                        .map(repl.formatOneListResult({ excludePackageName: true, alwaysShowType: true }))
                        .map(dom => actions.appendChild(dom))
                }
                if (entity.feeds) {
                    entity.feeds.map(wsk.fillInActionDetails(entity, 'feeds'))
                        .map(repl.formatOneListResult({ excludePackageName: true, alwaysShowType: true }))
                        .map(dom => actions.appendChild(dom))
                }
            }
        } else if (entity.type === 'activations') {
            sidecar.querySelector('.sidecar-content .activation-content').className = 'activation-content'

            // success indicator
            sidecar.classList.add(`activation-success-${entity.response.success}`)
            /*const statusDom = sidecar.querySelector('.activation-status')
            statusDom.setAttribute('data-extra-decoration', entity.response.status)
            statusDom.title = statusDom.getAttribute('data-title-base').replace(/{status}/, entity.response.status)*/

            // limits
            const entityLimitsAnnotation = entity.annotations.find(kv => kv.key === 'limits')
            if (!entityLimitsAnnotation) {
                sidecar.classList.add('no-limits-data')
            }

            // start time
            sidecar.querySelector('.activation-start').innerText = self.prettyPrintTime(entity.start)

            // duration
            if (entity.end) { // rule activations don't have an end time
                const duration = entity.end - entity.start
                sidecar.querySelector('.activation-duration').innerText = prettyPrintDuration(duration)

                if (entityLimitsAnnotation) {
                    // if we have BOTH a duration and limits data, then also show estimated cost
                    sidecar.querySelector('.activation-estimated-cost').innerText = ((entityLimitsAnnotation.value.memory/1024) * (Math.ceil(duration/100)/10) * 0.000017 * 1000000).toFixed(2)

                }
            }

            // the entity.namespace and entity.name of activation records don't include the package name :/
            const pathAnnotation = entity.annotations && entity.annotations.find(kv => kv.key === 'path'),
                  entityNameWithPackageAndNamespace = pathAnnotation && pathAnnotation.value || `${entity.namespace}/${entity.name}`,
                  pathComponents = pathAnnotation && entityNameWithPackageAndNamespace.split('/'),
                  entityPackageName = pathComponents ? pathComponents.length === 2 ? '' : pathComponents[1] : '' // either ns/package/action or ns/action

            // make the nameDom clickable, traversing to the action
            nameDom.querySelector('.package-prefix').innerText = entityPackageName
            const entityName = nameDom.querySelector('.entity-name')
            entityName.innerText = entity.name
            entityName.className = `${entityName.className} clickable`
            entityName.onclick = entity.onclick || (() => repl.pexec(`wsk action get "/${entityNameWithPackageAndNamespace}"`).then(ui.showEntity))

            // add the activation id to the header
            const activationDom = sidecar.querySelector('.sidecar-header-name .activation-id')
            activationDom.innerText = entity.activationId

            // view mode
            const show = (options && options.show)                           // cli-specified mode
                  || (entity.modes && entity.modes.find(_ => _.defaultMode)) // model-specified default mode
                  || 'result'                                                // fail-safe default mode

            if (show === 'result' || show.mode === 'result') {
                console.log('showing result')
                const activationResult = sidecar.querySelector('.activation-result')
                if (entity.response.result) {
                    const result = entity.response.result
                    if (result.error && result.error.stack) {
                        // special case for error stacks, we can do better than beautify, here
                        result.error.rawStack = result.error.stack
                        result.error.stack = result.error.rawStack
                            .split(/\n/)
                            .slice(1, -1) // slice off the first and last line; the first line is a repeat of result.error.message; the last is internal openwhisk
                            .map(line => line.substring(line.indexOf('at ') + 3)
                                 .replace(/eval at <anonymous> \(\/nodejsAction\/runner.js:\d+:\d+\), /, '')
                                 .replace(/<anonymous>/, entity.name))
                    }
                    const data = JSON.stringify(result, undefined, 4)
                    if (data.length < 10 * 1024) {
                        const beautify = require('js-beautify').js_beautify
                        activationResult.innerText = beautify(data)
                        // apply the syntax highlighter to the code
                        setTimeout(() => hljs.highlightBlock(activationResult), 0)
                    } else {
                        // too big! too slow for the fancy stuff
                        activationResult.innerText = data
                    }
                } else {
                    activationResult.innerText = 'Nothing to show' // FIXME
                }

            } else if (typeof show === 'string') {
                // render a given field of the entity
                const container = sidecar.querySelector('.activation-result')
                renderField(container, entity, show)

            } else {
                // render a custom mode
                console.error('rendering custom activation mode', show)
                if (show.customContent) {
                    sidecar.classList.add('custom-content')
                    //document.getElementsByClassName("hook-for-third-party-content")[0].classList.remove("no-content");
                }
                if (show.direct) {
                    const view = show.direct(entity)
                    if (view.then) {
                        view.then(ui.showCustom)
                    }
                } else {
                    repl.pexec(command(entity), { leaveBottomStripeAlone: true, echo: false, noHistory: true })
                }
            }

        } else if (entity.type === 'triggers') {
            const feed = entity.annotations && entity.annotations.find(kv => kv.key === 'feed')
            const feedDom = sidecar.querySelector('.trigger-content .feed-content')
            if (feed) {
                feedDom.innerText = `This is a feed based on ${feed.value}`
            } else {
                feedDom.innerText = ''
            }
            if (options && options.show !== 'content' && options.show !== 'default') {
                //
                // show some other attribute of the action
                //
                const source = sidecar.querySelector('.trigger-content .trigger-source')
                renderField(source, entity, options.show)
            }
        }

        repl.scrollIntoView()

        // 
        return Promise.resolve(responseToRepl)
    } /* showEntity */

    const disableDragAndDrop = () => {
        document.addEventListener('dragover', event => event.preventDefault() && false, false)
        document.addEventListener('drop', event => event.preventDefault() && false, false)
    }
        
    self.init = () => {
        // this will be cleaned up once ui becomes a module
        wsk = plugins.require('/ui/commands/openwhisk-core')
        history = plugins.require('/ui/commands/history')
        sidecarVisibility = plugins.require('/views/sidecar/visibility')
        isAnonymousLet = plugins.require('/openwhisk-extensions/actions/let-core').isAnonymousLet
        plugins.require('/ui/commands/tab-completion')
        setTimeout(() => plugins.require('wskng-usage-tracking'))

        /** listen for the escape key */
        /*if (!sidecarOnly)*/ {
            document.onkeyup = evt => {
                if (evt.keyCode === keys.ESCAPE) {
                    const closeButton = document.querySelector('#sidecar .sidecar-bottom-stripe-close')
                    if (sidecarVisibility.isVisible()) {
                        closeButton.classList.add('hover')
                        setTimeout(() => closeButton.classList.remove('hover'), 500)
                    }
                    self.toggleSidecar()
                    repl.scrollIntoView()
                }
            }
        }

        disableDragAndDrop()
        addContextClickMenu()

        window.onbeforeunload = () => {
            eventBus.emit('/window/reload')
        }

        //
        // see if we were passed an argv to execute on load
        //
        eventBus.on('/init/done', () => {
            const { remote } = require('electron'),
                  prefs = remote.getCurrentWindow().subwindow,
                  maybeExecuteThis = remote.getCurrentWindow().executeThisArgvPlease
            if (maybeExecuteThis) {
                const command = typeof maybeExecuteThis === 'string' ? maybeExecuteThis : maybeExecuteThis.join(' ')

                if (prefs && prefs.fullscreen !== false) {
                    document.body.classList.add('sidecar-full-screen')
                }

                if (prefs && prefs.partialExec) {
                    //document.body.classList.add('repl-lite')
                    repl.partial(command)
                } else {
                    const noEcho = prefs && prefs.noEcho // don't echo the command, just do it
                    repl.pexec(command, Object.assign(prefs||{}, { causedByHeadless: true, echo: !noEcho }))
                        .then(() => {
                            /*if (!noEcho && prefs && prefs.clearREPLOnLoad) {
                                setTimeout(() => repl.pexec('clear'), 1000)
                            }*/
                        })
                }
            }
        })
    }

    self.preinit = () => {
        let prefs = {}
        if (process.env.___IBM_FSH_FUZZ) {
            // for testing, we sometimes want to monkey patch out certain features
            prefs = require('./content/js/fuzz-testing')(process.env.___IBM_FSH_FUZZ)
        }

        /** add os-xxxx to the body's classname, to allow for os-specific styling, if needed */
        document.body.classList.add(`os-${process.platform}`)

        if (document.body.classList.contains('theme-dark')) {
            // dress the code differently in dark mode
            self.injectCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.12.0/styles/solarized-dark.min.css', true)
        }

        const { remote } = require('electron'),
              subwindow = remote.getCurrentWindow().subwindow
        if (subwindow && subwindow.fullscreen !== false) {
            sidecarOnly = subwindow.sidecarOnly === undefined ? true : subwindow.sidecarOnly
            document.title = typeof subwindow === 'string' ? subwindow : subwindow.title

            // set the current mode, if we have one, so that back
            // button can inform the user of what they're going back
            // to
            if (subwindow.viewName) {
                document.body.setAttribute('data-view-name', subwindow.viewName)
            }
            
            // body styling
            document.body.classList.add('subwindow')
            if (subwindow.theme) document.body.classList.add(`theme-${subwindow.theme}`)

            return subwindow
        }

        return prefs
    }

    /** export the picture-in-picture module */
    self.pictureInPicture = require('./content/js/picture-in-picture')

    /**
     * Generic method for injecting content into the DOM
     *
     */
    const inject = (contentType, rel, type, file) => {
        const id = `injected-${type}-${file}`
        if (!document.getElementById(id)) {
            var link = document.createElement('link')
            link.id = id
            link.href = file
            link.type = contentType
            link.rel = rel
            document.getElementsByTagName('head')[0].appendChild(link);
        }
    }
    self.inject = inject
    self.injectCSS = file => inject('text/css', 'stylesheet', 'css', file)

    /**
     * Inject HTML stored in the given local file
     *
     */
    self.loadHTML = file => new Promise((resolve, reject) => {
        require('fs').readFile(file, (err, data) => {
            if (err) {
                reject(err)
            } else {
                resolve(data.toString())
            }
        })
    })

    /**
     * Maybe the given filepath is asar-relative, as indicated by a
     * leading @ character?
     *
     */
    self.findFile = filepath => {
        if (filepath.charAt(0) === '@') {
            // ui.js is in the root /app directory already
            return require('path').join(__dirname, filepath.substring(1))
        } else {
            return filepath
        }
    }

    return self
})()

