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

const debug = require('debug')('editor')

const path = require('path'),
      events = require('events'),
      beautify = require('js-beautify'),
      usage = require('../usage'),
      placeholders = require('./placeholders'),
      { lockIcon } = require('./readonly')

/** default settings */
const defaults = {
    kind: 'nodejs:default'
}

/** translations */
const strings = {
    save: 'Deploy',
    revert: 'Revert',
    tidy: 'Reformat source code',
    readonly: 'Done Editing',
    actionAlreadyExists: 'The given action name is already in use',
    isNew: 'You are in edit mode, viewing <strong>a new action</strong>',
    isUpToDate: 'You are in edit mode, viewing the <strong>currently deployed version</strong>',
    isModified: 'You are in edit mode, with <strong>unsaved edits</strong>',
    isModifiedIndicator: 'You have unsaved edits',

    // commands
    docs: {
        edit: 'Open the code for an action in a text editor',
        new: 'Open the code editor to create a new action',
        compose: 'Open the code editor to create a new composition'
    }
}

/** from https://github.com/Microsoft/monaco-editor-samples/blob/master/sample-electron/index.html */
function uriFromPath(_path) {
    var pathName = path.resolve(_path).replace(/\\/g, '/');
    if (pathName.length > 0 && pathName.charAt(0) !== '/') {
	pathName = '/' + pathName;
    }
    return encodeURI('file://' + pathName);
}

/**
 * Throw an error if we can't edit the given action
 *
 */
const checkForConformance = action => {
    if (action.exec.binary) {
        const err = new Error('Editing of binary actions not yet supported')
        err.code = 406    // 406: Not Acceptable http status code
        throw err
    } else if (action.fsm) {
        // compositions currently have a sequence wrapper, but we know how to edit them
        return persisters.apps.getCode(action)

    } else if (action.exec.kind === 'sequence') {
        const err = new Error('Editing of sequence actions not yet supported')
        err.code = 406    // 406: Not Acceptable http status code
        throw err
    }

    return action
}

/**
 * Logic for saving and reverting
 *
 */
const persisters = {
    // persisters for regular actions
    actions: {
        getCode: action => action,
        save: (wsk, action) => {
            const owOpts = wsk.owOpts({
                name: action.name,
                namespace: action.namespace,
                action
            })

            return wsk.ow.actions.update(owOpts)
        },
        revert: (wsk, action) => {
        }
    },

    // persisters for apps/compositions
    apps: {
        getCode: action => new Promise((resolve, reject) => {
            const codeAnno = action.annotations.find(({key})=> key === 'code')
            if (codeAnno) {
                action.exec.code = codeAnno.value
                action.persister = persisters.apps
                resolve(action)

            } else {
                // hmm, no code annotation; let's look for a 'file' annotation
                const localCodePath = action.annotations.find(({key})=> key === 'file')
                if (localCodePath) {
                    require('fs').readFile(localCodePath, (err, data) => {
                        if (err) {
                            reject(err)
                        } else {
                            action.exec.code = data.toString()
                            action.persister = persisters.apps
                            resolve(action)
                        }                            
                    })
                } else {
                    //action.exec.code = JSON.stringify(action.fsm, undefined, 4)
                    const err = new Error('Your composition does not have an assocated source file')
                    err.code = 406
                    reject(err)
                }
            }
        }),
        save: (wsk, app) => new Promise((resolve, reject) => {
            const fs = require('fs'),
                  tmp = require('tmp')

            tmp.file({ prefix: 'shell-', postfix: '.js' }, (err, path, fd, cleanup) => {
                if (err) {
                    reject(err)
                } else {
                    fs.write(fd, app.exec.code, err => {
                        if (err) {
                            reject(err)
                        } else {
                            // -r means try to deploy the actions, too
                            return repl.qexec(`app update "${app.name}" "${path}" -r`)
                                .then(app => {
                                    cleanup()
                                    console.error('#####', app)
                                    resolve(app)
                                })
                        }
                    })
                }
            })
        })
    }
}

/**
 * Save the given action
 *
 */
const save = ({wsk, getAction, editor, eventBus}) => ({
    mode: strings.save,
    actAsButton: true,
    //fontawesome: 'fas fa-cloud-upload-alt',
    direct: () => {
        const action = getAction(),
              persister = action.persister || persisters.actions,
              { save } = action.persister || persisters.actions

        // transfer the latest code from the editor into the entity
        action.exec.code = editor.getValue()

        // odd: if we don't delete this, the backend will not perform its default version tagging behavior
        // https://github.com/apache/incubator-openwhisk/issues/3237
        delete action.version

        return save(wsk, action)
            .then(action => {
                action.persister = persister
                eventBus.emit('/editor/save', action, { event: 'save' })
            })
    }
})

/**
  * Revert to the currently deployed version
  *
  */
const revert = ({wsk, getAction, editor, eventBus}) => ({
    mode: strings.revert,
    actAsButton: true,
    //fontawesome: 'fas fa-cloud-download-alt',
    //fontawesome: 'fas fa-sync-alt',
    direct: () => {
        const action = getAction(),
              persister = action.persister || persisters.actions,
              { getCode } = persister,
              owOpts = wsk.owOpts({
                  name: action.name,
                  namespace: action.namespace
              })

        return repl.qexec(`action get "/${action.namespace}/${action.name}"`)
            .then(getCode)
            .then(action => {
                action.persister = persister
                updateText(editor)(action)
                eventBus.emit('/editor/save', action, { event: 'revert' })
            })
            .then(() => true)
    }
})

/**
  * Tidy up the source
  *
  */
const tidy = ({wsk, getAction, editor, eventBus}) => ({
    mode: strings.tidy,
    actAsButton: true,
    fontawesome: 'fas fa-align-left',
    balloon: strings.tidy,
    balloonLength: 'medium',
    direct: () => {
        const action = getAction()

        if (language(action.exec.kind) === 'javascript') {
            const raw = editor.getValue(),
                  nicer = beautify(raw, { wrap_line_length: 80 })

            setText(editor)({ kind: action.exec.kind,
                              code: nicer
                            })
        }

        return true
    }
})


/**
 * What is the monaco "language" for the given kind?
 *    only nodejs and compositions diverge from monaco's notation
 */
const language = kind => {
    const base = kind.substring(0, kind.indexOf(':')) || kind

    return base === 'nodejs'
        || base === 'app'
        || base === 'composition'
        || base === 'sequence' ? 'javascript' : base
}

/**
 * Update the code in the editor to use the given text
 *
 */
const setText = editor => ({code, kind}) => {
    const oldModel = editor.getModel(),
	  newModel = monaco.editor.createModel(code, language(kind));

    editor.setModel(newModel)
    editor.setPosition(editor.getModel().getPositionAt(code.length))

    if (oldModel) {
	oldModel.dispose()
    }

    // see https://github.com/Microsoft/monaco-editor/issues/194
    setTimeout(() => editor.focus(), 500)

    return code
}
const updateText = editor => action => {
    // monaco let's us replace the full range of text, so we don't need
    // an explicit delete of the current text
    return setText(editor)(action.exec)
}

/**
 * Open the code editor
 *
 * @return a function that can be passed an action to display in the
 * editor, and which returns { action, editor, content }
 *     - action: the action that was displayed
 *     - editor: an instance of the monaco editor class
 *     - content: a dom that contains the instance; this must be attached somewhere!
 *
 */
let amdRequire   // the monaco editor uses the AMD module loader, and smashes the global.require; we need to finagle it a bit
let initDone     // this is part of the finagling, to make sure we finagle only once
const openEditor = wsk => {
    const sidecar = document.querySelector('#sidecar')

    /** returns the current action entity */
    const getAction = () => sidecar.entity

    // Monaco uses a custom amd loader that over-rides node's require.
    // Keep a reference to node's require so we can restore it after executing the amd loader file.
    const nodeRequire = global.require;
    ui.injectScript('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.11.1/min/vs/loader.js')
    ui.injectCSS(path.join(__dirname, 'mono-blue.css'))
    ui.injectCSS(path.join(__dirname, 'editor.css'))

    const content = document.createElement('div'),
          editorWrapper = document.createElement('div')

    editorWrapper.className = 'monaco-editor-wrapper'
    content.appendChild(editorWrapper)
    editorWrapper.focus() // we want the editor to have focus, so the user can start coding

    // override the repl's capturing of the focus
    content.onclick = evt => {
        evt.stopPropagation()
    }

    //
    // wait till monaco's loader is ready, then resolve with an editor
    // widget
    //
    let editor
    const ready = () => new Promise((resolve, reject) => {
        const iter = () => {
            if (typeof AMDLoader === 'undefined') {
                setTimeout(iter, 20)
            } else {
                if (!amdRequire) {
                    // Save Monaco's amd require and restore Node's require
	            amdRequire = global.require
	            global.require = nodeRequire

                    amdRequire.config({
		        baseUrl: uriFromPath(path.join(__dirname, '../node_modules/monaco-editor/min'))
	            })

                    // workaround monaco-css not understanding the environment
	            self.module = undefined;
	            // workaround monaco-typescript not understanding the environment
	            self.process.browser = true;
                }

                if (editor) {
                    return resolve(editor)
                }

                //
                // use monaco's AMD module loader to load the monaco editor module
                //
                amdRequire(['vs/editor/editor.main'], () => {
                    if (!initDone) {
                        // for now, try to disable the built-in Javascript-specific completion helper thingies
                        monaco.languages.typescript.javascriptDefaults.setCompilerOptions({ noLib: true, allowNonTsExtensions: true });

                        // install any custom languages we might have
                        const languages = require('./language-scan')
                        languages.forEach(({language, provider}) => {
                            monaco.languages.registerCompletionItemProvider(language, provider)
                        })

                        // e.g. js-beautify detects global.define and
                        // tries to use it, but in a way that is
                        // incompatible with whatever amd that monaco
                        // incorporates
                        global.define = undefined

                        initDone = true
                    }

                    /*monaco.editor.defineTheme('myCustomTheme', {
	              base: 'vs',    // can also be vs-dark or hc-black
	              inherit: true, // can also be false to completely replace the builtin rules
	              rules: [
		      { token: 'comment', foreground: 'ffa500', fontStyle: 'italic underline' },
		      { token: 'comment.js', foreground: '008800', fontStyle: 'bold' },
		      { token: 'comment.css', foreground: '0000ff' } // will inherit fontStyle from `comment` above
	              ]
                      });*/

                    // here we instantiate an editor widget
                    editor = monaco.editor.create(editorWrapper, {
                        automaticLayout: false, // respond to window layout changes
                        minimap: {
		            enabled: false
	                },
                        autoIndent: true,
                        codeLens: false,
                        quickSuggestions: false,
                        renderLineHighlight: 'none',
                        contextmenu: false,
                        scrollBeyondLastLine: false,
                        cursorStyle: 'block',
                        fontFamily: 'var(--font-monospace)',
                        fontSize: 14.4, // TODO this doesn't adjust with ctrl/cmd-+ font size changes :(
                        
                        // we will fill these two in later, in setText
	                value: '',
	                language: 'javascript'
                    })

                    resolve(editor)
                })
            }
        } /* end of iter() */

        iter()
    }) /* end of ready() */

    /**
     * Given an editor instance, return a function that can update
     * that instance to show a given action entity.
     *
     */
    const updater = editor => action => {
        const eventBus = new events.EventEmitter()

        const kind = sidecar.querySelector('.action-content .kind')
        kind.innerText = ''

        // update the editor text
        setText(editor)(action.exec)

        content.classList.add('code-highlighting')

        const iconDom = sidecar.querySelector('.sidecar-header-icon')
        iconDom.innerText = (action.prettyType || action.type).replace(/s$/,'')

        // stash this so that the implicit entity model works
        sidecar.entity = action

        // isModified display
        const subtext = sidecar.querySelector('.sidecar-header-secondary-content .custom-header-content'),
              status = document.createElement('div'),
              isNew = document.createElement('div'),
              upToDate = document.createElement('div'),
              modified = document.createElement('div')
        ui.removeAllDomChildren(subtext)
        subtext.appendChild(status)
        status.appendChild(isNew)
        status.appendChild(upToDate)
        status.appendChild(modified)
        isNew.innerHTML = strings.isNew
        upToDate.innerHTML = strings.isUpToDate
        modified.innerHTML = strings.isModified
        status.className = 'editor-status'
        if (action.isNew) {
            status.classList.add('is-new')
        } else {
            status.classList.add('is-up-to-date')
        }
        isNew.className = 'is-new'
        upToDate.className = 'is-up-to-date'
        modified.className = 'is-modified'

        // even handlers for saved and content-changed
        const editsInProgress = () => sidecar.classList.add('is-modified')  // edits in progress
        const editsCommitted = action => {                                  // edits committed
            const lockIcon = sidecar.querySelector('[data-mode="lock"]')

            sidecar.classList.remove('is-modified')
            status.classList.remove('is-new')
            if (lockIcon) lockIcon.classList.remove('is-new')
            sidecar.entity = action

            // update the version badge to reflect the update
            ui.addVersionBadge(action, { clear: true })
        }
        eventBus.on('/editor/save', editsCommitted)
        editor.getModel().onDidChangeContent(editsInProgress)

        // make a wrapper around the action name to house the "is
        // modified" indicator
        const nameDiv = document.createElement('div'),
              namePart = document.createElement('span'),
              isModifiedPart = document.createElement('span'),
              isModifiedIcon = document.createElement('i')
        nameDiv.appendChild(namePart)
        nameDiv.appendChild(isModifiedPart)
        isModifiedPart.appendChild(isModifiedIcon)
        namePart.innerText = action.name
        nameDiv.className = 'is-modified-wrapper'
        isModifiedPart.className = 'is-modified-indicator'
        isModifiedIcon.className = 'fas fa-asterisk'
        isModifiedPart.setAttribute('data-balloon', strings.isModifiedIndicator)
        isModifiedPart.setAttribute('data-balloon-pos', 'left')

        ui.addNameToSidecarHeader(sidecar, nameDiv, action.packageName)
        ui.addVersionBadge(action, { clear: true })

        return Promise.resolve({ getAction, editor, content, eventBus })
    } /* end of updater */

    // once the editor is ready, return a function that can populate it
    return ready().then(updater)

} /* end of openEditor */

/**
 * Prepare a response for the REPL. Consumes the output of

 * updateEditor
 *
 */
const respondToRepl = (wsk, extraModes=[]) => ({ getAction, editor, content, eventBus }) => ({
    type: 'custom',
    content,
    controlHeaders: ['.header-right-bits'],
    displayOptions: [`entity-is-${getAction().type}`, 'edit-mode'],
    modes: extraModes
        .map(_ => _({wsk, getAction, editor, eventBus}))
        .concat([ save({wsk, getAction, editor, eventBus}),
                  revert({wsk, getAction, editor, eventBus}),
                  //tidy({wsk, getAction, editor, eventBus})
                  //readonly({wsk, getAction, editor, eventBus})
                ])
})

/**
 * Simple convenience routine to fetch an action and ensure that it is
 * compatible with the editor
 *
 */
const fetchAction = name => repl.qexec(`wsk action get "${name}"`).then(checkForConformance)

/**
 * Fail with 409 if the given action name exists, otherwise succeed
 *
 */
const failWith409 = _ => {
    const error = new Error(strings.actionAlreadyExists)
    error.code = 409
    throw error
}
const failIfNot404 = err => {
    if (err.statusCode !== 404) {
        console.error(err)
        throw err
    }
}
const betterNotExist = name => fetchAction(name).then(failWith409).catch(failIfNot404)


/**
 * Simple convenience routine that takes the result of an action
 * fetch and an editor open call, and passes the former to the latter
 *
 */
const prepareEditorWithAction = ([action, updateFn]) => {
    debug('prepareEditorWithAction')
    return updateFn(action)
}

/**
 * Command handler for `edit actionName`
 *
 */
const edit = (wsk, prequire) => (_0, _1, fullArgv, { ui, errors }, _2, _3, args, options) => {
    debug('edit command execution started')

    const sidecar = document.querySelector('#sidecar'),
          name = args[args.indexOf('edit') + 1]
          || (sidecar.entity && `/${sidecar.entity.namespace}/${sidecar.entity.name}`)

    if (!name || options.help) {
        throw new errors.usage(usage.edit)
    }

    //
    // fetch the action and open the editor in parallel
    // then update the editor to show the action
    // then send a response back to the repl
    //
    debug('begin')
    return Promise.all([fetchAction(name), openEditor(wsk)])
        .then(addCompositionOptions)
        .then(prepareEditorWithAction)
        .then(addWskflow(prequire))
        .then(respondToRepl(wsk, [ lockIcon ]))

} /* end of edit command handler */

/**
 * If the user specified a kind of 'nodejs', then add ':default'
 *
 */
const addVariantSuffix = kind => {
    if (kind.indexOf(':') < 0) {
        return `${kind}:default`
    } else {
        return kind
    }
}

/**
 * Command handler to create a new action or app
 *
 */
const newAction = ({wsk, prequire, op='new', type='actions', _kind=defaults.kind, placeholder, persister=persisters.actions}) => (_0, _1, fullArgv, { ui, errors }, _2, _3, args, options) => {
    debug('newAction', op)

    const name = args[args.indexOf(op) + 1],
          kind = addVariantSuffix(options.kind || _kind)

    if (options.help || !name) {
        throw new errors.usage(usage[op])
    }

    // our placeholder action
    const action = { name, type,
                     exec: { kind, code: placeholder || placeholders[language(kind)] },
                     isNew: true,
                     persister
                   }

    //
    // open the editor
    // then update the editor to show the placeholder action
    // then send a response back to the repl
    //
    return Promise.all([action, openEditor(), betterNotExist(name)])
        .then(prepareEditorWithAction)
        .then(addWskflow(prequire))
        .then(respondToRepl(wsk))
}

/**
 * Add the wskflow visualization component to the given content
 *
 */
let globalEventBus = eventBus
const addWskflow = prequire => opts => {
    debug('addWskflow')

    const { getAction, editor, content, eventBus } = opts,
          wskflowContainer = document.createElement('div'),
          editorDom = content.querySelector('.monaco-editor-wrapper'),
          h = document.getElementById("sidecar").getBoundingClientRect().height

    content.appendChild(wskflowContainer)
    wskflowContainer.className = 'wskflow-container'

    /** call editor.layout */
    const relayout = () => {
        editor.updateOptions({ automaticLayout: false })
        setTimeout(() => {
            const { width, height } = editorDom.getBoundingClientRect()
            editor.layout({ width: width - 10, height: height - 7 })
        }, 300)
    }

    /** update the view to show the latest FSM */
    const updateView = (_, { event='init' }={}) => {
        const action = getAction(),
              { fsm } = action

        if (fsm) {
            const { visualize } = prequire('wskflow')

            wskflowContainer.classList.add('visible')
            editorDom.classList.add('half-height')

            if (event === 'revert') {
                content.removeChild(wskflowContainer)
                content.appendChild(wskflowContainer)
                
            } else {
                // don't bother redrawing on revert
                ui.removeAllDomChildren(wskflowContainer)

                visualize(fsm, wskflowContainer, undefined, h, undefined, { xdirection: 'RIGHT' })
            }

        }

        globalEventBus.on('/sidecar/maximize', relayout)
        window.addEventListener('resize', relayout)
        relayout()
    }

    eventBus.on('/editor/save', updateView)
    setTimeout(updateView, 300) // needs to be async'd in order for wskflow to work with `edit myApp`

    return opts
}

/**
 * Special options for compositions. Mostly, we need to specify the
 * initial "placeholder" code to display when creating a new file, and
 * the persister to use when deploying edits.
 *
 */
const compositionOptions = baseOptions => {
    return Object.assign({type: 'apps',
                          _kind: 'app',
                          placeholder: placeholders.composition,      // the placeholder impl
                          persister: persisters.apps,                 // the persister impl
                         }, baseOptions)
}
const addCompositionOptions = params => {
    const [action, updateFn] = params

    if (action.fsm) {
        action.persister = persisters.apps
    }

    return params
}

module.exports = (commandTree, prequire) => {
    const wsk = prequire('/ui/commands/openwhisk-core')

    // command registration: edit existing action
    commandTree.listen('/editor/edit', edit(wsk, prequire), { usage: usage.edit })

    // command registration: create new action
    commandTree.listen('/editor/new', newAction({wsk, prequire}), { usage: usage.new })

    // command registration: create new app/composition
    commandTree.listen('/editor/compose', newAction(compositionOptions({ wsk, prequire, op: 'compose'})),
                       { usage: usage.compose })
}
