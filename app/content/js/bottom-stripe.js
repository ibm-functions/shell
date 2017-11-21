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

const css = {
    buttons: '#sidecar .sidecar-bottom-stripe .sidecar-bottom-stripe-left-bits',
    backContainer: '#sidecar .sidecar-bottom-stripe .sidecar-bottom-stripe-left-bits .sidecar-bottom-stripe-back-bits',   // houses the back button text and <<
    backLabel: '#sidecar .sidecar-bottom-stripe .sidecar-bottom-stripe-left-bits .sidecar-bottom-stripe-back-inner-bits', // houses the back button text
    modeContainer: '#sidecar .sidecar-bottom-stripe .sidecar-bottom-stripe-left-bits .sidecar-bottom-stripe-mode-bits',
    button: 'sidecar-bottom-stripe-button',
    buttonActingAsButton: 'sidecar-bottom-stripe-button-as-button',
    active: 'sidecar-bottom-stripe-button-active'
}
exports.css = css

const addModeButton = (bottomStripe, {mode, label, command, direct, defaultMode, actAsButton, echo=false, noHistory=true}, entity, show) => {
    // create the button dom, and attach it
    const button = document.createElement('div')

    button.classList.add(css.button)
    if (actAsButton) {
        // some plugins want to add buttons, not mode-switchers to the bottom bar
        // let's make them behave a bit more like buttons
        button.classList.add(css.buttonActingAsButton)
    }

    
    if ( ( ((!show||show==='default') && defaultMode) || show === mode) && !actAsButton ) {
        button.classList.add(css.active)
    }
    button.innerText = label || mode
    button.setAttribute('data-mode', mode)
    bottomStripe.appendChild(button)

    // back button does not modify sidecar entity, causing the mode buttons to have the wrong behavior (using the previous entity)
    // set sidecar entity to the current entity every time when mode buttons are regenerated
    if (entity.type !== 'custom') {
        document.querySelector('#sidecar').entity = entity;
    }
        
    // insert the command handler
    if (command || direct) {
        button.onclick = () => {
            // change the active button
            if (!actAsButton) {
                const currentActive = bottomStripe.querySelector(`.${css.active}`)
                if (currentActive) {
                    currentActive.classList.remove(css.active)
                }
                button.classList.add(css.active)
            }

            // execute the command
            if (command) {
                repl.pexec(command(entity), { leaveBottomStripeAlone: true, echo, noHistory })
            } else {
                const view = direct(entity)
                if (view.then) {
                    view.then(custom => ui.showCustom(custom, { leaveBottomStripeAlone: true }))
                }
            }
        }
    }
}

exports.addModeButton = (mode, entity) => {
    const bottomStripe = document.querySelector(css.modeContainer)
    addModeButton(bottomStripe, mode, entity)
}

exports.addModeButtons = (modes, entity, options) => {
    const bottomStripe = document.querySelector(css.modeContainer)

    // for going back
    bottomStripe.addModeButtons = (modes, entity, show) => {
        const bottomStripe = document.querySelector(css.modeContainer)
        ui.removeAllDomChildren(bottomStripe)

        if (modes) {
            modes.forEach(mode => {
                addModeButton(bottomStripe, mode, entity, show)
            })
        }

        bottomStripe.capture = () => {
            // capture the current selection
            const currentSelection = bottomStripe.querySelector(`.${css.active}`),
                  currentShow = currentSelection && currentSelection.getAttribute('data-mode'),
                  show = currentShow || (options && options.show)

            // to avoid stale buttons from showing up while the new view renders
            ui.removeAllDomChildren(bottomStripe)

            return () => bottomStripe.addModeButtons(modes, entity, show)
        }
    }

    bottomStripe.addModeButtons(modes, entity, options && options.show)
}
