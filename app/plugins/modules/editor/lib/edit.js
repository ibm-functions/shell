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

const path = require('path'),
      events = require('events'),
      beautify = require('js-beautify'),
      placeholders = require('./placeholders')

/** optional command line arguments, by command */
const optionalArguments = {
    new: '[--kind <nodejs:default*|python:default|php:default|swift:default>]'
}

/** default settings */
const defaults = {
    kind: 'nodejs:default'
}

/** translations */
const strings = {
    save: 'Deploy',
    revert: 'Revert',
    tidy: 'Tidy Source',
    readonly: 'Done Editing',
    actionAlreadyExists: 'The given action name is already in use',
    isNew: 'You are in edit mode, viewing <strong>a new action</strong>',
    isUpToDate: 'You are in edit mode, viewing the <strong>currently deployed version</strong>',
    isModified: 'You are in edit mode, with <strong>unsaved edits</strong>',

    // commands
    editdoc: 'Open the code for an action in a text editor',
    newDoc: 'Open the code editor to create a new action',
    composeDoc: 'Open the code editor to create a new composition'
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
                            return repl.qexec(`app update "${app.name}" "${path}"`)
                                .then(app => {
                                    cleanup()
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
              { save } = action.persister || persisters.actions

        // transfer the latest code from the editor into the entity
        action.exec.code = editor.getValue()

        // odd: if we don't delete this, the backend will not perform its default version tagging behavior
        // https://github.com/apache/incubator-openwhisk/issues/3237
        delete action.version

        return save(wsk, action)
            .then(action => eventBus.emit('/editor/save', action))
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

        console.error('@@@@@', persister)
        return wsk.ow.actions.get(owOpts)
            .then(getCode)
            .then(action => {
                action.persister = persister
                updateText(editor)(action)
                eventBus.emit('/editor/save', action)
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
    //fontawesome: 'fas fa-indent',
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
  * Switch to read-only mode
  *
  */
const readonly = ({ wsk, getAction }) => ({
    mode: strings.readonly,
    actAsButton: true,
    direct: () => Promise.resolve(getAction())
        .then(action => repl.qexec(`wsk action get "/${action.namespace}/${action.name}"`))
        .then(entity => wsk.addPrettyType(entity.type, 'update', entity.name)(entity))
        .then(ui.showEntity)
})

/**
 * What is the monaco "language" for the given kind?
 *    only nodejs and compositions diverge from monaco's notation
 */
const language = kind => {
    const base = kind.substring(0, kind.indexOf(':'))

    return base === 'nodejs'
        || base === 'app'
        || base === 'composition' ? 'javascript' : base
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
  * Render a lock/unlock icon in the given container
  *
  */
const renderLockIcon = (wsk, getAction, content) => {
    const lockIcon = document.createElement('div'),
          lockIconInner = document.createElement('div'),
          lockIconInnerInner = document.createElement('div'),
          lockIconGraphics = document.createElement('i')

    // tooltip
    lockIconInnerInner.setAttribute('data-balloon', 'You are in edit mode.\u000aClick to return to view mode.')
    lockIconInnerInner.setAttribute('data-balloon-break', 'true')
    lockIconInnerInner.setAttribute('data-balloon-pos', 'left')

    // styling
    lockIcon.className = 'graphical-button lock-button'
    lockIconGraphics.className = 'fas fa-unlock-alt'

    // pack them in the container
    lockIcon.appendChild(lockIconInner)
    lockIconInner.appendChild(lockIconInnerInner)
    lockIconInnerInner.appendChild(lockIconGraphics)
    content.appendChild(lockIcon)

    // onclick handler
    lockIcon.onclick = readonly({wsk, getAction}).direct

    return lockIcon
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
let amdRequire, initDone
const openEditor = wsk => {
    const sidecar = document.querySelector('#sidecar'),
          leftHeader = sidecar.querySelector('.header-left-bits .sidecar-header-secondary-content .custom-header-content'),
          rightHeader = sidecar.querySelector('.header-right-bits .custom-header-content')

    /** returns the current action entity */
    const getAction = () => sidecar.entity

    ui.removeAllDomChildren(leftHeader)
    ui.removeAllDomChildren(rightHeader)

    // Monaco uses a custom amd loader that over-rides node's require.
    // Keep a reference to node's require so we can restore it after executing the amd loader file.
    const nodeRequire = global.require;
    ui.injectScript('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.10.1/min/vs/loader.js')
    ui.injectCSS(path.join(__dirname, 'mono-blue.css'))
    ui.injectCSS(path.join(__dirname, 'editor.css'))

    const content = document.createElement('div')
    content.focus() // we want the editor to have focus, so the user can start coding

    const lockIcon = renderLockIcon(wsk, getAction, content)

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

                amdRequire(['vs/editor/editor.main'], () => {
                    if (!initDone) {
                        // for now, try to disable the completion helper thingies
                        monaco.languages.typescript.javascriptDefaults.setCompilerOptions({ noLib: true, allowNonTsExtensions: true });

                        // install custom languages
                        const languages = require('./language-scan')
                        languages.forEach(({language, provider}) => {
                            monaco.languages.registerCompletionItemProvider(language, provider)
                        })

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
                
                    editor = monaco.editor.create(content, {
                        automaticLayout: true, // respond to window layout changes
                        minimap: {
		            enabled: false
	                },
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
        } /* end of iter */

        iter()
    })

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
        const subtext = sidecar.querySelector('.custom-header-content'),
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
            lockIcon.classList.add('is-new')
        } else {
            status.classList.add('is-up-to-date')
        }
        isNew.className = 'is-new'
        upToDate.className = 'is-up-to-date'
        modified.className = 'is-modified'
        const editsInProgress = () => sidecar.classList.add('is-modified')  // edits in progress
        const editsCommitted = action => {                                  // edits committed
            sidecar.classList.remove('is-modified')
            status.classList.remove('is-new')
            lockIcon.classList.remove('is-new')
            sidecar.entity = action

            // update the version badge to reflect the update
            ui.addVersionBadge(action, { clear: true })
        }
        eventBus.on('/editor/save', editsCommitted)
        editor.getModel().onDidChangeContent(editsInProgress)

        ui.addNameToSidecarHeader(sidecar, action.name, action.packageName)
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
const respondToRepl = (wsk) => ({ getAction, editor, content, eventBus }) => ({
    type: 'custom',
    content,
    displayOptions: [`entity-is-${getAction().type}`, 'edit-mode'],
    modes: [ save({wsk, getAction, editor, eventBus}),
             revert({wsk, getAction, editor, eventBus}),
             //tidy({wsk, getAction, editor, eventBus})
             //readonly({wsk, getAction, editor, eventBus})
           ]
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
const updateEditor = ([action, updateEditor]) => updateEditor(action)

/**
 * Command handler for `edit actionName`
 *
 */
const edit = wsk => (_0, _1, fullArgv, { ui, errors }, _2, _3, args, options) => {
    const sidecar = document.querySelector('#sidecar'),
          name = args[args.indexOf('edit') + 1]
          || (sidecar.entity && `/${sidecar.entity.namespace}/${sidecar.entity.name}`)

    if (!name || options.help) {
        throw new errors.usage('edit <actionName>')
        return
    }

    //
    // fetch the action and open the editor in parallel
    // then update the editor to show the action
    // then send a response back to the repl
    //
    return Promise.all([fetchAction(name), openEditor(wsk)])
        .then(updateEditor)
        .then(respondToRepl(wsk))

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
const newAction = ({wsk, op='new', type='actions', _kind=defaults.kind, placeholder, persister=persisters.actions}) => (_0, _1, fullArgv, { ui, errors }, _2, _3, args, options) => {
    const name = args[args.indexOf(op) + 1],
          kind = addVariantSuffix(options.kind || _kind)

    if (options.help || !name) {
        throw new errors.usage(`${op} <actionName> ${optionalArguments[op] || ''}`)
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
        .then(updateEditor)
        .then(respondToRepl(wsk))
}

/**
 * Special options for compositions
 *
 */
const compositionOptions = baseOptions => Object.assign({type: 'apps',
                                                         _kind: 'app',
                                                         placeholder: placeholders.composition,
                                                         persister: persisters.apps }, baseOptions)

module.exports = (commandTree, prequire) => {
    const wsk = prequire('/ui/commands/openwhisk-core')

    commandTree.listen('/edit', edit(wsk), { docs: strings.editDoc })
    commandTree.listen('/new', newAction({wsk}), { docs: strings.newDoc })
    commandTree.listen('/compose', newAction(compositionOptions({ wsk, op: 'compose'})),
                       { docs: strings.composeDoc })
}
