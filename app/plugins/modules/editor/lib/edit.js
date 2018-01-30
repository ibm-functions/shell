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

const path = require('path')

const strings = {
    save: 'Save',
    revert: 'Revert',
    isUpToDate: 'You are viewing the currently deployed version',
    isModified: 'You have unsaved edits'
}

/**
 * Save the given action
 *
 */
const save = ({wsk, action, quill, eventBus}) => ({
    mode: strings.save,
    actAsButton: true,
    direct: () => {
        action.exec.code = quill.getText()

        const owOpts = wsk.owOpts({
            name: action.name,
            namespace: action.namespace,
            action
        })

        return wsk.ow.actions.update(owOpts)
            .then(() => {
                eventBus.emit('/editor/save', { text: action.exec.code })
            })
    }
})

/**
  * Revert to the currently deployed version
  *
  */
const revert = ({wsk, action, quill, eventBus}) => ({
    mode: strings.revert,
    actAsButton: true,
    direct: () => {
        const owOpts = wsk.owOpts({
            name: action.name,
            namespace: action.namespace
        })

        return wsk.ow.actions.get(owOpts)
            .then(action => action.exec.code)
            .then(updateText(quill))
            .then(text => eventBus.emit('/editor/save', { text: action.exec.code }))
    }
})

/**
 * Update the code in the editor to use the given text
 *
 */
const setText = quill => text => {
    quill.format('code-block', true)
    quill.insertText(0, text, 'code-block', true)
    //quill.setText(action.exec.code, 'silent')
    //quill.formatText(0, action.exec.code.length, { 'code-block': true }, 'silent')
    //hljs.highlightBlock(content.querySelector('code'))
    return text
}
const updateText = quill => text => {
    quill.deleteText(0, quill.getText().length)
    setText(quill)(text)
}

/**
 * Command handler for `edit actionName`
 *
 */
const edit = wsk => (_0, _1, fullArgv, { ui, errors, eventBus }, _2, _3, args, options) => {
    const sidecar = document.querySelector('#sidecar')

    const name = args[args.indexOf('edit') + 1]
          || (sidecar.entity && `/${sidecar.entity.namespace}/${sidecar.entity.name}`)

    if (!name || options.help) {
        throw new errors.usage('edit <actionName>')
    }

    ui.injectScript('https://cdn.quilljs.com/1.3.5/quill.min.js')
    ui.injectCSS(path.join(__dirname, 'editor.css'))
    //ui.injectCSS('https://cdn.quilljs.com/1.3.5/quill.snow.css')
    //ui.injectCSS('https://cdn.quilljs.com/1.3.5/quill.bubble.css')

    const content = document.createElement('div')
    content.onmouseup = evt => {
        evt.stopPropagation()
    }
    
    const ready = () => new Promise((resolve, reject) => {
        if (typeof Quill === 'undefined') {
            setTimeout(iter, 20)
        } else {
            resolve(new Quill(content, { modules: { syntax: true, toolbar: false } }))
        }
    })

    const updateEditor = action => ready().then(quill => {
        const kind = sidecar.querySelector('.action-content .kind')
        kind.innerText = ''

        //quill.format('code-block', true, 'silent')
        setTimeout(() => setText(quill)(action.exec.code), 0)

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
        upToDate.innerText = strings.isUpToDate
        modified.innerText = strings.isModified
        status.className = 'editor-status is-up-to-date'
        upToDate.className = 'is-up-to-date'
        modified.className = 'is-modified'
        const mod = () => status.classList.add('is-modified')
        const unmod = () => status.classList.remove('is-modified')
        eventBus.on('/editor/save', unmod)
        setTimeout(() => quill.on('text-change', mod), 0)

        ui.addNameToSidecarHeader(sidecar, action.name, action.packageName)
        ui.addVersionBadge(action, { clear: true })

        return { action, quill }
    })

    return repl.qexec(`wsk action get ${name}`)
        .then(updateEditor)
        .then(({ action, quill}) => ({
            type: 'custom',
            content,
            displayOptions: [`entity-is-${action.type}`],
            modes: [ save({wsk, action, quill, eventBus}),
                     revert({wsk, action, quill, eventBus})]
        }))
}

module.exports = (commandTree, prequire) => {
    const wsk = prequire('/ui/commands/openwhisk-core')

    commandTree.listen('/edit', edit(wsk), { docs: 'Open the code for an action in a text editor' })
}
