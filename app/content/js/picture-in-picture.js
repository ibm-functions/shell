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

const util = require('util'),
      bottomStripe = require('./bottom-stripe')

const _highlight = op => highlightThis => {
    if (highlightThis) {
        if (util.isArray(highlightThis)) {
            highlightThis.forEach(_ => _.classList[op]('picture-in-picture-highlight'))
        } else {
            highlightThis.classList[op]('picture-in-picture-highlight')
        }
    }
}
const dehighlight = _highlight('remove')
const highlight = _highlight('add')

/**
 * Make an DOM event handler that will restore the given pippedContainer
 *
 */
const restore = (pippedContainer, sidecarClass, capturedHeaders, highlightThis, escapeHandler, options) => () => {
    const sidecar = document.getElementById('sidecar'),
          parent = options && options.parent || sidecar.querySelector('.custom-content')

    if (pippedContainer !== true) {
        ui.removeAllDomChildren(parent)
    }

    // restore escape handler
    if (escapeHandler) {
        document.onkeyup = escapeHandler
    }

    // restore sidecar header state
    sidecar.className = sidecarClass
    capturedHeaders.forEach( ({selector, node, redraw, nextSibling}) => {
        const curHeader = document.querySelector(selector),
              curHeaderParent = curHeader.parentNode
        curHeaderParent.removeChild(curHeader)
        //curHeaderParent.appendChild(node)
        curHeaderParent.insertBefore(node, nextSibling)

        if (redraw) {
            redraw()
        }
    })

    //pippedContainer.classList.remove('picture-in-picture')
    //pippedContainer.classList.add('picture-in-picture-stage1')
    //setTimeout(() => {
        //sidecar.classList.add('custom-content')
    //pippedContainer.classList.remove('picture-in-picture-stage1')
    if (pippedContainer !== true) {
        if (pippedContainer.parentNode) pippedContainer.parentNode.removeChild(pippedContainer)
        parent.appendChild(pippedContainer)
    }
        //pippedContainer.onclick = null
//}, 300)

    dehighlight(highlightThis)
}

/**
 *
 *
 */ 
const pip = (container, capturedHeaders, highlightThis, returnTo, options) => {
    try {
        if (container !== true) {
            container.parentNode.removeChild(container)
        }
    } catch (e) {}
    //document.body.appendChild(container)

    const sidecar = document.getElementById('sidecar'),
          sidecarClass = sidecar.className,
          escapeHandler = undefined, // we don't want to override the escape key behavior
          backContainer = document.querySelector(bottomStripe.css.backContainer),
          backLabel = document.querySelector(bottomStripe.css.backLabel),
          restoreFn = restore(container, sidecarClass, capturedHeaders, highlightThis, escapeHandler, options)

    if (returnTo) {
        ui.removeAllDomChildren(backLabel)
        const backButton = document.createElement('div')
        backButton.className = 'sidecar-bottom-stripe-button sidecar-bottom-stripe-back-button'
        backButton.innerText = `Back to ${returnTo}`
        backLabel.appendChild(backButton)
        backContainer.classList.add('has-back-button')

        backButton.onclick = () => {
            restoreFn()
            backContainer.classList.remove('has-back-button')
        }
    }
}

/**
 *
 *
 */ 
const pipViaShrink = (container, capturedHeaders, highlightThis) => {
    const sidecar = document.getElementById('sidecar'),
          sidecarClass = sidecar.className

    container.classList.add('picture-in-picture-stage1')
    setTimeout(() => {
        container.classList.remove('picture-in-picture-stage1')
        container.classList.add('picture-in-picture')
    }, 0)

    try {
        container.parentNode.removeChild(container)
    } catch (e) {}
    document.body.appendChild(container)

    escapeHandler = document.onkeyup
    const restoreFn = restore(container, sidecarClass, capturedHeaders, highlightThis, escapeHandler)

    document.onkeyup = evt => {
        if (evt.keyCode === 27) { // escape key maps to keycode `27`
            restoreFn()
        }
    }

    container.onclick = restoreFn
}

/**
 * Capture and clone the given selector
 *
 */
const capture = (selector, redraw) => {
    const node = document.querySelector(selector)
    return {
        selector,                         // remember how to find the replacement
        node: node.cloneNode(true),       // capture the current dom via deep clone
        redraw,                           // any redraw helper that might've been registered
        nextSibling: node.nextSibling     // remember this, so we can reattach in the right place (using insertBefore)
    }
}

/**
 * Drill down to a more detailed view, using the given command to
 * populate the new view.
 *
 */
module.exports = (command, highlightThis, container, returnTo, options) => event => {
    if (event) event.stopPropagation()

    if (typeof container === 'string') {
        // then container is a query selector
        container = document.querySelector(container)
    }

    // capture the current header and other DOM state, before the `command` overwrites it
    const alreadyPipped = document.querySelector('body > .picture-in-picture'),
          capturedHeader = capture('#sidecar .sidecar-header-text'),
          capturedHeader2 = capture('#sidecar .header-right-bits .custom-header-content'),
          capturedHeader3 = capture('#sidecar .header-right-bits .action-content'),
          capturedHeader4 = capture('#sidecar .sidecar-header-icon')

    // for the footer, we need to capture the modeButton renderer, so we can reattach the click events
    const modeButtons = document.querySelector(bottomStripe.css.modeContainer).capture
    const capturedFooter = capture(bottomStripe.css.buttons, modeButtons && modeButtons())

    // now we can safely begin executing the command
    setTimeout(() => {
        if (typeof command === 'string') {
            repl.pexec(command)
        } else {
            command()
        }
    }, 0)

    if (container && !alreadyPipped) {
        // make the transition
        pip(container, [capturedHeader, capturedHeader2, capturedHeader3, capturedHeader4, capturedFooter], highlightThis, returnTo, options)

    } else if (alreadyPipped) {
        // for real pip... if the transition has already been made
        const currentHighlightThis = alreadyPipped.querySelectorAll('.picture-in-picture-highlight')
        if (currentHighlightThis) {
            for (let idx = 0; idx < currentHighlightThis.length; idx++) {
                dehighlight(currentHighlightThis[idx])
            }
        }
    }

    highlight(highlightThis)
}
