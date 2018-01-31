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
      beautify = require('js-beautify')

const strings = {
    save: 'Deploy',
    revert: 'Revert',
    tidy: 'Tidy Up',
    readonly: 'Done Editing',
    isUpToDate: 'You are in edit mode, viewing the <strong>currently deployed version</strong>',
    isModified: 'You are in edit mode, with <strong>unsaved edits</strong>'
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
    }

    return action
}

/**
 * Save the given action
 *
 */
const save = ({wsk, action, editor, eventBus}) => ({
    mode: strings.save,
    actAsButton: true,
    direct: () => {
        action.exec.code = editor.getValue()

        // odd: if we don't delete this, the backend will 
        delete action.version

        const owOpts = wsk.owOpts({
            name: action.name,
            namespace: action.namespace,
            action
        })

        return wsk.ow.actions.update(owOpts)
            .then(action => eventBus.emit('/editor/save', action))
    }
})

/**
  * Revert to the currently deployed version
  *
  */
const revert = ({wsk, action, editor, eventBus}) => ({
    mode: strings.revert,
    actAsButton: true,
    direct: () => {
        const owOpts = wsk.owOpts({
            name: action.name,
            namespace: action.namespace
        })

        return wsk.ow.actions.get(owOpts)
            .then(action => {
                updateText(editor)(action.exec)
                eventBus.emit('/editor/save', action)
            })
            .then(() => true)
    }
})

/**
  * Tidy up the source
  *
  */
const tidy = ({wsk, action, editor, eventBus}) => ({
    mode: strings.tidy,
    actAsButton: true,
    direct: () => {
        const raw = editor.getValue(),
              nicer = beautify(raw, { wrap_line_length: 80 })

        setText(editor)({ kind: action.exec.kind,
                          code: nicer
                        })

        return true
    }
})

/**
  * Switch to read-only mode
  *
  */
const readonly = ({wsk, action, editor, eventBus}) => ({
    mode: strings.readonly,
    actAsButton: true,
    direct: () => repl.qexec(`wsk action get /${action.namespace}/${action.name}`)
        .then(entity => wsk.addPrettyType(entity.type, 'update', entity.name)(entity))
        .then(ui.showEntity)
})

/**
 * What is the monaco "language" for the given kind?
*
*/
const language = kind => {
    if (kind.indexOf('nodejs') >= 0) {
        return 'javascript'
    } else if (kind.indexOf('python') >= 0) {
        return 'python'
    } else if (kind.indexOf('swift') >= 0) {
        return 'swift'
    } else if (kind.indexOf('java') >= 0) {
        return 'java'
    } else if (kind.indexOf('php') >= 0) {
        return 'php'
    } else {
        //???
        return 'javascript'
    }
}

/**
 * Update the code in the editor to use the given text
 *
 */
const setText = editor => ({code, kind}, otherEdits=[]) => {
    const lang = language(kind)
    monaco.editor.setModelLanguage(editor.getModel(), lang)

    //editor.saveViewState()
    //monaco.editor.setModelMarkers(editor.getModel(), [])
    editor.getModel().applyEdits(otherEdits.concat([{
        range: editor.getModel().getFullModelRange(),
        forceMoveMarkers: true,
        text: code
    }]))
    //const x = editor.getModel().modifyPosition(editor.getModel().getPositionAt(0), 0)
    //console.error(x)
    //editor.restoreViewState()

    return code
}
const updateText = editor => exec => {
    // monaco let's us replace the full range of text, so we don't need
    // an explicit delete of the current text
    return setText(editor)(exec)
}

/**
 * Command handler for `edit actionName`
 *
 */
let amdRequire
const edit = wsk => (_0, _1, fullArgv, { ui, errors, eventBus }, _2, _3, args, options) => {
    const sidecar = document.querySelector('#sidecar'),
          leftHeader = sidecar.querySelector('.header-left-bits .sidecar-header-secondary-content .custom-header-content'),
          rightHeader = sidecar.querySelector('.header-right-bits .custom-header-content')

    ui.removeAllDomChildren(leftHeader)
    ui.removeAllDomChildren(rightHeader)

    const name = args[args.indexOf('edit') + 1]
          || (sidecar.entity && `/${sidecar.entity.namespace}/${sidecar.entity.name}`)

    if (!name || options.help) {
        throw new errors.usage('edit <actionName>')
        return
    }

    // Monaco uses a custom amd loader that over-rides node's require.
    // Keep a reference to node's require so we can restore it after executing the amd loader file.
    const nodeRequire = global.require;
    ui.injectScript('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.10.1/min/vs/loader.js')
    ui.injectCSS(path.join(__dirname, 'mono-blue.css'))
    ui.injectCSS(path.join(__dirname, 'editor.css'))

    const content = document.createElement('div')

    // override the repl's capturing of the focus
    content.onclick = evt => {
        evt.stopPropagation()
    }

    //
    // wait till monaco's loader is ready, then resolve with an editor
    // widget
    //
    const ready = () => new Promise((resolve, reject) => {
        if (typeof AMDLoader === 'undefined') {
            setTimeout(ready, 20)
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

            amdRequire(['vs/editor/editor.main'], () => {
                // for now, try to disable the completion helper thingies
                monaco.languages.typescript.javascriptDefaults.setCompilerOptions({ noLib: true, allowNonTsExtensions: true });

                /*monaco.editor.defineTheme('myCustomTheme', {
	            base: 'vs',    // can also be vs-dark or hc-black
	            inherit: true, // can also be false to completely replace the builtin rules
	            rules: [
		        { token: 'comment', foreground: 'ffa500', fontStyle: 'italic underline' },
		        { token: 'comment.js', foreground: '008800', fontStyle: 'bold' },
		        { token: 'comment.css', foreground: '0000ff' } // will inherit fontStyle from `comment` above
	            ]
                });*/
                
                const editor = monaco.editor.create(content, {
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
                    fontSize: 14, // TODO this doesn't adjust with ctrl/cmd-+ font size changes :(

                    // we will fill these two in later, in setText
	            value: '',
	            language: 'javascript'
                })

                resolve(editor)
            })
        }
    })

    const updateEditor = action => ready().then(editor => {
        const kind = sidecar.querySelector('.action-content .kind')
        kind.innerText = ''

        setText(editor)(action.exec)

        content.classList.add('code-highlighting')

        const iconDom = sidecar.querySelector('.sidecar-header-icon')
        iconDom.innerText = (action.prettyType || action.type).replace(/s$/,'')

        // stash this so that the implicit entity model works
        sidecar.entity = action

        // isModified display
        const subtext = sidecar.querySelector('.custom-header-content'),
              status = document.createElement('div'),
              upToDate = document.createElement('div'),
              modified = document.createElement('div')
        ui.removeAllDomChildren(subtext)
        subtext.appendChild(status)
        status.appendChild(upToDate)
        status.appendChild(modified)
        upToDate.innerHTML = strings.isUpToDate
        modified.innerHTML = strings.isModified
        status.className = 'editor-status is-up-to-date'
        upToDate.className = 'is-up-to-date'
        modified.className = 'is-modified'
        const editsInProgress = () => sidecar.classList.add('is-modified')  // edits in progress
        const editsCommitted = action => {                               // edits committed
            sidecar.classList.remove('is-modified')

            // update the version badge to reflect the update
            ui.addVersionBadge(action, { clear: true })
        }
        eventBus.on('/editor/save', editsCommitted)
        editor.getModel().onDidChangeContent(editsInProgress)

        ui.addNameToSidecarHeader(sidecar, action.name, action.packageName)
        ui.addVersionBadge(action, { clear: true })

        return { action, editor }
    })

    return repl.qexec(`wsk action get ${name}`)
        .then(checkForConformance)
        .then(updateEditor)
        .then(({ action, editor}) => ({
            type: 'custom',
            content,
            displayOptions: [`entity-is-${action.type}`, 'edit-mode'],
            modes: [ save({wsk, action, editor, eventBus}),
                     revert({wsk, action, editor, eventBus}),
                     tidy({wsk, action, editor, eventBus}),
                     readonly({wsk, action, editor, eventBus})
                   ]
        }))
        .catch(err => {
            //
            // make sure we finish up with ready before with throw the
            // error; monaco editor currently smashes global.require!!
            //
            // the edit test covers this; try `edit nope` for some
            // non-existant action name "nope", and then try creating
            // an action. without this cleanup logic, the legitimate
            // action create, after edit fail, will also fail
            //
            const done = () => {
                throw err
            }
            return ready().then(done, done)
        })

}

module.exports = (commandTree, prequire) => {
    const wsk = prequire('/ui/commands/openwhisk-core')

    commandTree.listen('/edit', edit(wsk), { docs: 'Open the code for an action in a text editor' })
}
