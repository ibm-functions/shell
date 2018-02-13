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


/**
 * This plugin helps with controlling and knowing the state of the sidecar
 *
 */

const debug = require('debug')('sidecar visibility')

const hide = clearSelectionToo => {
    debug('hide')

    const sidecar = document.querySelector('#sidecar')
    sidecar.classList.remove('visible')

    if (!clearSelectionToo) {
        // only minimize if we weren't asked to clear the selection
        sidecar.classList.add('minimized')
    }

    const replView = document.querySelector('#main-repl')
    replView.classList.remove('sidecar-visible')

    // we just hid the sidecar. make sure the current prompt is active for text input
    ui.getCurrentPrompt().focus()

    // were we asked also to clear the selection?
    if (clearSelectionToo && sidecar.entity) {
        delete sidecar.entity
    }

    return true
}

const show = (block, nextBlock) => {
    debug('show')

    const sidecar = document.querySelector('#sidecar')
    if (sidecar.entity || sidecar.className.indexOf('custom-content') >= 0) {
        sidecar.classList.remove('minimized')
        sidecar.classList.add('visible')

        repl.scrollIntoView()
        const replView = document.querySelector('#main-repl')
        replView.classList.add('sidecar-visible')

        return true
    } else {
        ui.oops(block, nextBlock)({ error: 'You have no entity to show' })
    }
}

const isVisible = () => {
    const sidecar = document.querySelector('#sidecar')
    return sidecar.className.indexOf('visible') >= 0 && sidecar
}

module.exports = commandTree => {
    //commandTree.listen('/hide', hide)
    //commandTree.listen('/show', show)

    return {
        isVisible: isVisible,
        hide: hide,
        show: show,
        toggleMaximization: () => {
            document.body.classList.toggle('sidecar-full-screen')
            eventBus.emit('/sidecar/maximize')
        },
        toggle: () => isVisible() ? hide() : show()
    }
}
