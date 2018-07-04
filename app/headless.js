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

const debug = require('debug')('headless')
debug('starting')

// by default, we'll exit with an exit code of 0 when success is
// called; this bit is necessary, as process.exit doesn't seem to
// really exit the first time
let exitCode = 0

// electron pops up a window by default, for uncaught exceptions
process.on('uncaughtException', err => {
    console.error(err.red)
    process.exit(1)
})

let argStart = 1
if (process.env.DEVMODE) {
    // then we're running in dev mode, where the app is started with
    // an extra argument, e.g. "electron ."
    argStart = 2
}

const events = require('events'),
      colors = require('colors'),
      verbose = process.argv.find(_ => _ === '-v'),
      rawOutput = process.argv.find(_ => _ === '--raw-output'), // don't try to pretty-print the JSON; c.f. jq's --raw-output
      argv = process.argv.slice(argStart).filter(arg => arg !== '--fsh-headless' && arg !== '-v' && arg !== '--raw-output' && arg !== '--no-color'),
      grequire = module => require(`./content/js/${module}`),
      Store = require('./store'),
      log = console.log,
      error = console.error,
      cmd = 'fsh'

debug('modules loaded')

/**
 * Certain commands may open the graphical shell; remember this, so
 * we know not to process.exit
 *
 */
let graphicalShellIsOpen = false

/**
 * Are we in the middle of a hasty retreat?
 *
 */
let noAuth = false

/**
 * Create structures to mimic having a head
 *
 */
function mimicDom(app, { createWindow }, localStorage) {
    debug('mimicDom')

    const { quit } = app

    try {
        global.localStorage = Store(app)
    } catch (err) {
        const localStorage = {}
        global.localStorage = {
            setItem: (k, v) => localStorage[k] = v,
            getItem: k => localStorage[k] || null
        }
    }

    const dom0 = () => {
        const obj = {
            _isFakeDom: true,
            value:  '',
            innerText: '',
            innerHTML: '',
            className: '',
            _classList: [],
            classList: {
                add: _ => obj._classList.push(_),
                remove: _ => {
                    const idx = obj._classList.findIndex(_)
                    if (idx >= 0) {
                        obj._classList.splice(idx, 1)
                    }
                }
            },
            attrs: {},
            style: {},
            children: []
        }
        obj.recursiveInnerTextLength = () => obj.innerText.length + obj.children.reduce((sum, child) => sum + child.recursiveInnerTextLength(), 0)
        obj.hasStyle = (style, desiredValue) => {
            const actualValue = obj.style && obj.style[style]
            if (desiredValue) return desiredValue == actualValue // intentional double equals, so that 500=='500'
            else return actualValue
        }
        obj.focus = () => {}
        obj.appendChild = c => obj.children.push(c)
        obj.getAttribute = k => obj.attrs[k]
        obj.setAttribute = (k,v) => obj.attrs[k] = v
        obj.cloneNode = () => Object.assign({}, obj)
        obj.querySelector = sel => {
            return obj[sel] || dom0()
        }
        return obj
    }
    const dom = () => Object.assign(dom0(), {
        input: dom0()
    })
    global.ui = {
        headless: true,
        userDataDir: () => {
            const remote = require('electron')
            const { app } = remote
            return app.getPath('userData')
        },
        createWindow: function() {
            // opens the full UI
            try {
                graphicalShellIsOpen = true
                createWindow.apply(undefined, arguments)
            } catch (err) {
                error(err)
            }
        },
        getInitialBlock: () => dom(),
        getCurrentBlock: () => dom(),
        getCurrentProcessingBlock: () => dom(),
        getPrompt: block => block && block.input,
        getInitialPrompt: () => ui.getPrompt(ui.getInitialBlock()),
        getCurrentPrompt: () => ui.getPrompt(ui.getCurrentBlock()),
        currentSelection: () => undefined,
        clearSelection: () => true,
        findFile: filepath => {
            if (filepath.charAt(0) === '@') {
                // ui.js is in the root /app directory already
                return require('path').join(__dirname, filepath.substring(1))
            } else {
                return filepath
            }
        },
        listen: () => {},
        unlisten: () => {},
        installBlock: () => () => true,
        setStatus: () => true,
        showEntity: entity => print(entity),
        maybeHideEntity: () => false,
        ok: () => dom0(),
        oops: () => failure(quit),
        oopsMessage: err => {
            return (err && err.error && err.error.response && err.error.response.result && err.error.response.result.error && err.error.response.result.error.error) // feed creation error. nice
                || (err && err.error && err.error.response && err.error.response.result && err.error.response.result.error)
                || (err && err.error && err.error.error)
                || err && err.message
                || err && err.error
                || err
                || 'Internal Error'
        }
    }
    let ns
    global.namespace = {
        init: () => {
            const wsk = plugins.require('/ui/commands/openwhisk-core')
            try {
                return wsk.namespace.get()
                    .then(_ => ns = _)
                    .catch(err => {
                        repl.setNoAuth()
                    });
            } catch (err) {
                repl.setNoAuth()
                return Promise.resolve()
            }
        },
        get: () => Promise.resolve(undefined),
        list: () => Promise.resolve(ns ? [ns] : []),
        store: (newNamespace, auth) => ns = newNamespace,
        current: () => ns
    }
    global.document = {
        body: dom0(),
        createElement: type => {
            const element = dom0();
            element.nodeType = type;
            if (type === 'table') {
                element.rows = []
                element.insertRow = idx => {
                    const row = document.createElement('tr')
                    row.cells = []
                    row.insertCell = idx => {
                        const cell = document.createElement('td')
                        if (idx === -1) row.cells.push(cell)
                        else row.cells.splice(idx, 0, cell)
                        return cell
                    }
                    if (idx === -1) element.rows.push(row)
                    else element.rows.splice(idx, 0, row)
                    return row
                }
            }
            return element
        },
        createTextNode: text => { const element = dom0(); element.innerText = text; return element },
        querySelector: () => dom0()
    }
    global.eventBus = new events.EventEmitter()
    global.plugins = grequire('plugins')
    global.repl = grequire('repl')

    global.repl.prompt = (msg, block, nextBlock, options, completion) => new Promise((resolve, reject) => {
        const { prompt } = require('inquirer')
        const schema = []
        schema.push({
            name: msg,
            message: msg,
            type: options.type
        })
        try {
            prompt(schema)
                .then(answers => {
                    try {
                        log('ok'.green)
                        return completion(Object.assign({}, options, { field: answers[msg] }))
                            .then(resolve)
                            .catch(reject);
                    } catch (err) {
                        failure(quit)(err); reject(err)
                    }
                })
        } catch (err) {
            failure(quit)(err); reject(err)
        }
    })

    // quit immediately after discovering we don't have a wskprops
    global.repl.setNoAuth = () => {
        if (!graphicalShellIsOpen) {
            noAuth = true
        }
    }

    const isVowel = c => c === 'a' || c === 'e' || c === 'i' || c === 'o' || c === 'u'
    const startsWithVowel = s => isVowel(s.charAt(0))
    global.ui.startsWithVowel = startsWithVowel

    global.settings = require(require('path').join(__dirname, './build/config.json'))
}

const colorMap = {
    'var(--color-brand-01)': 'blue',
    'var(--color-brand-02)': 'blue',
    'var(--color-support-02)': 'blue'
}

/**
 * Try to pretty print one of our fake doms
 *
 */
let firstPrettyDom = true // so we can avoid initial newlines for headers
const prettyDom = (dom, logger=log, stream=process.stdout, _color, { columnWidths, extraColor:_extraColor }={}) => {
    const isHeader = dom.nodeType === 'h1' || dom.nodeType === 'h2',
          capitalize = dom.className.indexOf('bx--no-link') >= 0,
          hasMargin = dom.className.indexOf('bx--breadcrumb-item--slash') >= 0
          || dom.className.indexOf('left-pad') >= 0

    //log('!!!', dom.nodeType, dom.innerText, dom._classList, capitalize)
    if (hasMargin) {
        stream.write(' ')
    }

    const extraColor = isHeader || dom.hasStyle('fontWeight', 'bold') ? 'bold' : dom.hasStyle('fontWeight', 500) ? 'green' : dom.hasStyle('fontSize', '0.875em') ? 'gray' : _extraColor || 'reset',
          colorCode = dom.hasStyle('color') || _color,
          color = colorMap[colorCode] || colorCode
    // debug('child', dom.nodeType)

    if (isHeader) {
        // an extra newline before headers
        if (firstPrettyDom) {
            // don't emit a header margin for the very first thing
            // we print
            firstPrettyDom = false
        } else {
            logger()
        }
    }

    if (dom.innerText) {
        const text = capitalize ? dom.innerText.charAt(0).toUpperCase() + dom.innerText.slice(1)
              : dom.innerText
        stream.write(text[extraColor][color])
    }

    const newline = () => {
        if (dom.nodeType === 'div' || isHeader) {
            // not perfect, but treat divs as line breakers
            logger()
        }
    }

    if (hasMargin) {
        stream.write(' ')
    }

    if (dom.innerText) {
        newline()
    }

    // recurse to the children of this fake DOM
    dom.children.forEach(child => prettyDom(child, logger, stream, _color, { extraColor }))

    // handle table rows and cells:
    if (dom.rows) {
        // scan the table for max column widths
        const columnWidths = []
        dom.rows.forEach(row => {
            if (row.cells) {
                row.cells.forEach((cell, idx) => {
                    const length = cell.recursiveInnerTextLength()
                    if (!columnWidths[idx]) columnWidths[idx] = length
                    else columnWidths[idx] = Math.max(columnWidths[idx], length)
                })
            }
        })

        dom.rows.forEach(row => {
            prettyDom(row, logger, stream, _color, { columnWidths })
            logger() // insert a newline after every row
        })
    }
    if (dom.cells) {
        dom.cells.forEach((cell, idx) => {
            prettyDom(cell, logger, stream, _color)

            if (columnWidths) {
                // pad out this column to the column width
                const slop = columnWidths[idx] - cell.recursiveInnerTextLength()
                for (let jj = 0; jj < slop; jj++) {
                    stream.write(' ')
                }

                // and then a few more to separate the columns
                stream.write('  ') 
            }
        })
    }

    // trailing carriage return?
    if (isHeader && !dom.innerText) {
        logger()
    }
}

/**
 * Pretty print an object as JSON. If the user asked for --raw-output,
 * only use the more primitive JSON.stringify. Otherwise, use the
 * `jsome` npm to do some fancier rendering. Once jsome issue #12 is
 * resolved, we can consider relying on its raw-output support. The
 * main issue here is that jsome does not quote the keys.
 * @see https://github.com/Javascipt/Jsome/issues/12
 *
 */
const prettyJSON = (msg, logger=log) => rawOutput ? logger(JSON.stringify(msg, undefined, 4)) : require('jsome')(msg)

/**
  * Render a name with an optional package name
  *
  */
const pn = (actionName, packageName) => `${packageName ? packageName + '/' : ''}`.dim + actionName.blue

/**
 * Turn an entity into a row, because this entity came as part of an
 * array of entities
 *
 */
const pp = _ => (_ ? 'public' : 'private').dim                 // pretty publish
const pk = _ => _.find(({key}) => key === 'exec').value.green  // pretty kind
const rowify = {
    app: ({name, packageName, version, fsm}) => ({name:pn(name, packageName), version:version.dim}),
    session: ({sessionId, name, status, start}) => ({sessionId, app:pn(name), start:new Date(start).toLocaleString().dim, status:status.green}),
    activations: ({activationId, name}) => ({activationId, name:pn(name)}),
    actions: ({name, packageName, publish, annotations, version}) => ({name:pn(name, packageName), 'published?':pp(publish), kind:pk(annotations), version:version.dim}),
    triggers: ({name, publish}) => ({name:pn(name), 'published?':pp(publish)}),
    packages: ({name, publish, binding}) => ({name:pn(name), 'published?':pp(publish), binding}),
    plugins: ({name, attributes}) => {
        return {name:pn(name), version:attributes.find(({key})=>key==='version').value.dim}
    }
}

rowify.sequence = rowify.actions  // same formatter...
rowify.composer = rowify.sequence // same formatter...
rowify.binding = rowify.packages  // same formatter...
rowify.live = rowify.session // same formatter...
rowify._default = ({name}) => ({name:pn(name)})

/**
 * Pretty print routine that dispatches to the underlying smarter
 * pretty printers (such as prettyDom and prettyjson)
 *
 */
const print = (msg, logger=log, stream=process.stdout, color='reset', ok='ok') => {
    if (verbose && typeof msg === 'string') {
        // user asked for verbose output
        return prettyJSON(msg, logger)
    }

    if (msg && !graphicalShellIsOpen) {
        try {
            if (msg === true) {
                // true is the graphical shell's way of telling the repl to print 'ok'
                logger(ok.green)

            } else if (msg.context) {
                // a changeDirectory response; print the underlying message
                print(msg.message, logger, stream, color)

            } else if (typeof msg === 'object') {
                // some sort of javascript object

                if (msg._isFakeDom) {
                    // msg is a DOM facade

                    if (msg.className.indexOf('usage-error-wrapper') >= 0) {
                        // print usage errors to stdout
                        stream = process.stdout
                    }

                    prettyDom(msg, logger, stream, color)
                    logger()

                } else if (msg.then) {
                    // msg is a promise; resolve it and try again
                    return msg.then(msg => {
                        return print(msg, logger, stream, color, ok)
                    })

                } else if (msg.message && msg.message._isFakeDom) {
                    // msg.message is a DOM facade
                    prettyDom(msg.message, logger, stream, color)
                    logger()

                } else if (require('util').isArray(msg)) {
                    // msg is an array of stuff
                    if (msg.length > 0) {
                        try {
                            const print = rowify[msg[0].prettyType || msg[0].type] || rowify._default
                            logger(require('columnify')(msg.map(print),
                                                        { headingTransform: _ => _.dim,
                                                          /*config: { name: { minWidth: 20 }}*/}))
                        } catch (err) {
                            error(err)
                        }
                    }
                } else if (msg.verb && msg.name && (msg.verb === 'create' || msg.verb === 'update')) {
                    // msg is an openwhisk entity, that has just been created or updated
                    const isWebExported = msg.annotations && msg.annotations.find(({key}) => key === 'web-export')
                    if (isWebExported) {
                        const contentType = msg.annotations && msg.annotations.find(({key}) => key === 'content-type-extension') || {value:'json'}
                        const https = msg.apiHost.startsWith('https://') || msg.apiHost.startsWith('http://') ? ''
                              : msg.apiHost === 'localhost' ? 'http://' : 'https://'
                        const urlText = `${https}${msg.apiHost}/api/v1/web/${msg.namespace}/${!msg.packageName ? 'default/' : ''}${msg.name}.${contentType.value}`
                        logger(urlText.blue)
                    }
                    logger(`${ok}:`.green + ` updated ${msg.type.replace(/s$/,'')} ${msg.name}`)

                } else if (msg.verb === 'invoke' && msg.activationId /*&& msg.response*/) {
                    logger(`${ok}:`.green + ` invoked ${msg.name} with id ${msg.activationId}`)

                } else if (msg.verb === 'delete') {
                    logger(`${ok}:`.green + ` deleted ${msg.type.replace(/s$/,'')} ${msg.name}`)

                } else if (msg.verb === 'get' && msg.activationId /*&& msg.response*/) {
                    // msg is an openwhisk entity representing an invocation
                    logger(`${ok}:`.green + ` got activation ${msg.activationId}`)
                    delete msg.prettyType
                    delete msg.verb
                    delete msg.publish
                    delete msg.type
                    delete msg.apiHost
                    delete msg.modes
                    delete msg.version
                    delete msg.entity
                    if (msg.activatonId && msg.sessionid) delete msg.activationId // don't display both
                    prettyJSON(msg, logger)

                } else {
                    // otherwise, print it as generic JSON
                    prettyJSON(msg, logger)
                }

            } else if (typeof msg === 'string') {
                //logger(`${ok}: `.green + msg)
                logger(msg)

            } else {
                logger(msg[color])
            }
        } catch (e) {
            logger(msg.red)
        }
    }
}

/** completion handlers for success and failure */
const success = quit => out => {
    debug('success')
    print(out, log, process.stdout)

    if (!graphicalShellIsOpen) {
        quit()
        process.exit(exitCode)
    } else {
	//log('The graphical shell should now be open. This process will stay alive till you close the window.'.red)
        //log('You may background this process, but do not kill it, unless you also want to kill the graphical shell.'.red)
    }
}
const failure = quit => err => {
    debug('failure', err)

    let completion = Promise.resolve()

    if (!noAuth) {
        // we're not in a corner case of having no openwhisk auth, so
        // print the error
        const msg = ui.oopsMessage(err)

        if (typeof msg === 'string') {
            error(msg.red)
        } else {
            completion = print(msg, error, process.stderr, 'red', 'error') || Promise.resolve()
        }
    } else {
        error(`No wskprops file was found. Consider trying again with "fsh help" command.`)
    }

    return completion.then(() => {
        if (!graphicalShellIsOpen) {
            // if the graphical shell isn't open, then we're done here
            exitCode = 1
            process.exit(1)
            if (quit) quit()
        }

        return false
    })
}

/**
  * Does argv only have optional arguments?
  *
  */
const onlyOpts = argv => !argv.find(_ => _.charAt(0) !== '-')

/**
 * Insufficient arguments provided?
 *
 */
const insufficientArgs = () => argv.length === 0

/**
 * Initialize headless mode
 *
 */
const main = (app, mainFunctions) => {
    debug('main')

    const { quit } = app

    // set up the fake dom
    mimicDom(app, mainFunctions)

    /**
     * Evaluate the given command
     *
     */
    const eval = cmd => Promise.resolve(repl.qexec(cmd))
          .then(success(quit))

    console.log = function() {
        if (arguments[0] !== undefined && (!arguments[0].indexOf || (arguments[0].indexOf('::') < 0 && arguments[0].indexOf('Resolving') < 0
                                                                     && arguments[0].indexOf('using implicit context') < 0
                                                                     && arguments[0].indexOf('Using timeout') < 0
                                                                     && arguments[0].indexOf('Updates') < 0
                                                                     && arguments[0].indexOf("Couldn't set selectedTextBackgroundColor") < 0
                                                                     && arguments[0].indexOf('Unresolved') < 0 && arguments[0].indexOf('Processing catch-alls') < 0))) {
            log.apply(undefined, arguments)
        }
    }
    const trace = console.trace
    console.trace = () => {
        const tmp = console.error
        console.error = error
        trace()
        console.error = tmp
    }
    console.error = () => {
        if (!noAuth && typeof arguments[0] === 'string') {
            arguments = arguments.map(_ => typeof _ === 'string' ? _.red : _)
            error(...arguments)
        }
    }

    /** main work starts here */
    debug('bootstrap')
    plugins.init({app}).then(() => {
        debug('plugins initialized')

        if (insufficientArgs()) {
            debug('insufficient args, invoking help command')
            return eval('help')
        }

        const maybeRetry = err => {
            if (/*!namespace.current() ||*/ err.message === 'namespace uninitialized') {
                debug('delayed namespace loading')
                return namespace.init()
                    .then(() => eval(cmd))
                    .catch(failure(quit))
            } else {
                return failure(quit)(err)
            }
        }

        //
        // execute a single command from the CLI
        //
        const cmd = argv.map(_ => _.match(/\s+/) ? `"${_}"` : _).join(' ').trim()
        if (cmd && cmd.length > 0) {
            debug('about to execute command')
            return Promise.resolve().then(() => eval(cmd)).catch(maybeRetry)

        } else {
            debug('exiting, no command')
            process.exit(0)
        }
    }).then(success(quit)).catch(failure(quit))
}

exports.main = main
