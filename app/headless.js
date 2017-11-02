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

// electron pops up a window by default, for uncaught exceptions
process.on('uncaughtException', err => {
    console.error(err.red)
    process.exit(1)
})

let argStart = 1
if (process.argv[1] === '.') {
    // then we're running in dev mode, where the app is started with "electron ."
    argStart = 2
}

const events = require('events'),
      colors = require('colors'),
      verbose = process.argv.find(_ => _ === '-v'),
      argv = process.argv.slice(argStart).filter(arg => arg !== '--fsh-headless' && arg !== '-v'),
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
            attrs: {},
            style: {},
            children: []
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
        oops: () => failure,
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
        createElement: type => { const element = dom0(); element.nodeType = type; return element },
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
                        failure(err); reject(err)
                    }
                })
        } catch (err) {
            failure(err); reject(err)
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
}

/** try to pretty print one of our fake doms */
const prettyDom = (dom, logger=log, stream=process.stdout, color='reset') => {
    if (dom.innerText) {
        stream.write(dom.innerText[color])
        if (dom.nodeType === 'div') {
            // not perfect, but treat divs as line breakers
            logger()
        }
    }

    dom.children.forEach(child => prettyDom(child, logger, stream, color))
}

/**
 * Pretty print an object as JSON
 *
 */
const prettyJSON = msg => require('jsome')(msg)

/**
 * Turn an entity into a row, because this entity came as part of an
 * array of entities
 *
 */
const pn = _ => _.blue                                         // pretty name
const pp = _ => (_ ? 'public' : 'private').dim                 // pretty publish
const pk = _ => _.find(({key}) => key === 'exec').value.green  // pretty kind
const rowify = {
    app: ({name}) => ({name:pn(name)}),
    session: ({sessionId, name, status, start}) => ({sessionId, app:pn(name), start:new Date(start).toLocaleString().dim, status:status.green}),
    activations: ({activationId, name}) => ({activationId, name:pn(name)}),
    actions: ({name, publish, annotations}) => ({name:pn(name), 'published?':pp(publish), kind:pk(annotations)}),
    triggers: ({name, publish}) => ({name:pn(name), 'published?':pp(publish)}),
    packages: ({name, publish, binding}) => ({name:pn(name), 'published?':pp(publish), binding}),
}

rowify.sequence = rowify.actions  // same formatter...
rowify.composer = rowify.sequence // same formatter...
rowify.binding = rowify.packages  // same formatter...
rowify.live = rowify.session // same formatter...

/**
 * Pretty print routine that dispatches to the underlying smarter
 * pretty printers (such as prettyDom and prettyjson)
 *
 */
const print = (msg, logger=log, stream=process.stdout, color='reset', ok='ok') => {
    if (verbose) {
        // user asked for verbose output
        return prettyJSON(msg)
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
                    prettyDom(msg, logger, stream, color)
                    logger()

                } else if (msg.message && msg.message._isFakeDom) {
                    // msg.message is a DOM facade
                    prettyDom(msg.message, logger, stream, color)
                    logger()

                } else if (require('util').isArray(msg)) {
                    // msg is an array of stuff
                    if (msg.length > 0) {
                        try {
                            logger(require('columnify')(msg.map(rowify[msg[0].prettyType || msg[0].type]),
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
                    prettyJSON(msg)

                } else {
                    // otherwise, print it as generic JSON
                    require('jsome')(msg)
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
        process.exit(0)
    } else {
	//log('The graphical shell should now be open. This process will stay alive till you close the window.'.red)
        //log('You may background this process, but do not kill it, unless you also want to kill the graphical shell.'.red)
    }
}
const failure = err => {
    debug('failure', err)
    if (!noAuth) {
        // we're not in a corner case of having no openwhisk auth, so
        // print the error
        const msg = ui.oopsMessage(err),
              isUsageError = err instanceof require('./content/js/usage-error')

        if (typeof msg === 'string') {
            if (isUsageError) {
                error(msg.replace(/(Required parameters:)/, '$1'.blue)
                      .replace(/(Options:)/, '$1'.blue)
                      .replace(/(\(Hint:[^\n]+)/, '$1'.dim)
                      .replace(/(\[EXPERIMENTAL\])/, '$1'.red)
                      .replace(/\t([^\n]+)/, '\t' + '$1'.green))
            } else {
                error(msg.red)
            }
        } else {
            print(msg, error, process.stderr, 'red', 'error')
        }
    } else {
        error(`No wskprops file was found. Consider trying again with "fsh help" command.`)
    }

    if (!graphicalShellIsOpen) {
        // if the graphical shell isn't open, then we're done here
        process.exit(1)
    }

    return false
}

/**
  * Does argv only have optional arguments?
  *
  */
const onlyOpts = argv => !argv.find(_ => _.charAt(0) !== '-')

/**
 * Print usage information, if the command line arguments are insufficient
 *
 */
const usage = () => {
    //
    // Check for required arguments
    //
    if (argv.length === 0 || onlyOpts(argv) || argv.find(_ => _ === '--help' || _ === '-h')) {
        console.error(`Welcome to the IBM Cloud Functions Shell`.green)
        console.error()

        console.error(`Usage information:`)

        const c1 = txt => txt.reset
        const c2 = txt => txt.dim
        const c3 = txt => c1(`${cmd} `) + txt.blue
        const c4 = txt => txt.green

        console.error(c3('about') + c4('                                    ') + c2('[ Display version information ]'))
        console.error(c3('help') + c4('                                     ') + c2('[ Show more detailed help, with tutorials ]'))
        console.error(c3('shell') + c4('                                    ') + c2('[ Open graphical shell ]'))
        console.error(c3('run') + c4(' <script.fsh>                         ') + c2('[ Execute commands from a file ]'))
        console.error()
        console.error(c3('app init') + c4('                                 ') + c2('[ Initialize state management ]'))
        console.error(c3('app preview') + c4(' <file.js|file.json>          ') + c2('[ Prototype a composition, with visualization help ]'))
        console.error(c3('app list') + c4('                                 ') + c2('[ List deployed compositions ]'))
        console.error(c3('app create') + c4(' <name> <file.js|file.json>    ') + c2('[ Deploy a composition ]'))
        console.error(c3('app update') + c4(' <name> <file.js|file.json>    ') + c2('[ Update or deploy composition ]'))
        console.error(c3('app delete') + c4(' <name>                        ') + c2('[ Undeploy a composition ]'))
        console.error(c3('app invoke') + c4(' <name>                        ') + c2('[ Invoke a composition and wait for its response ]'))
        console.error(c3('app async') + c4(' <name>                         ') + c2('[ Asynchronously invoke a composition ]'))
        console.error()
        console.error(c3('session list') + c4('                             ') + c2('[ List recent app invocations ]'))
        console.error(c3('session get') + c4(' <sessionId>                  ') + c2('[ Graphically display the result and flow of a session ]'))
        console.error(c3('session result') + c4(' <sessionId>               ') + c2('[ Print the return value of a session ]'))
        console.error(c3('session kill ') + c4('<sessionId>                 ') + c2('[ Kill a live session ]'))
        console.error(c3('session purge ') + c4('<sessionId>                ') + c2('[ Purge the state of a completed session ]'))

        /*console.error(`Usage information:`)

        console.error(`${cmd} <script.wsk>                                                 [ Execute commands from a file ]`)
        console.error(`${cmd} let foo = 'x=>x'                                             [ Create action from javascript code ]`)
        console.error(`${cmd} let foo = /path/to/action/src.js                             [ Create action from source file ]`)
        console.error(`${cmd} let foo.zip = /path/to/action/src/dir                        [ Create zip action ]`)
        console.error(`${cmd} let foo.{html|png|svg|jpg|webjs} = /path/to/action/src.html  [ Create web page ]`)*/

        return true // early exit
    }
}

/**
 * Initialize headless mode
 *
 */
const main = (app, mainFunctions) => {
    debug('main')

    const { quit } = app

    if (usage()) {
        return quit()
    }

    /**
     * Evaluate the given command
     *
     */
    const eval = cmd => repl.qexec(cmd)
          .then(success(quit))

    // set up the fake dom
    mimicDom(app, mainFunctions)

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
    debug('main::bootstrap')
    plugins.init().then(() => {
        debug('plugins initialized')

        //
        // execute a single command from the CLI
        //
        const cmd = argv.join(' ').trim()
        if (cmd && cmd.length > 0) {
            debug('about to execute command')
            try {
                return eval(cmd)
                    .catch(err => {
                        if (!namespace.current() || err.message === 'namespace uninitialized') {
                            debug('delayed namespace loading')
                            return namespace.init()
                                .then(() => eval(cmd))
                                .catch(failure)
                        } else {
                            return failure(err)
                        }
                    })
            } catch(err) {
                return failure(err)
            }

        } else {
            debug('exiting, no command')
            process.exit(0)
        }
    }).catch(failure)
}

exports.main = main
