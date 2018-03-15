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

const fs = require('fs'),
      path = require('path'),
      expandHomeDir = require('expand-home-dir')

/**
 * We've found a match. Add this match to the given partial match,
 * located in the given dirname'd directory, and update the given
 * prompt, which is an <input>.
*
*/
const complete = (match, partial, dirname, prompt) => {
    // in case match includes partial as a prefix
    const partialIdx = match.indexOf(partial),
          completion = partialIdx >= 0 ? match.substring(partialIdx + partial.length) : match

    if (completion) {
        fs.lstat(expandHomeDir(path.join(dirname, match)), (err, stats) => {
            if (!err) {
                if (stats.isDirectory()) {
                    // add a trailing slash if the dirname/match is a directory
                    prompt.value = prompt.value + completion + '/'
                } else {
                    // otherwise, dirname/match is not a directory
                    prompt.value = prompt.value + completion
                }
            } else {
                console.error(err)
            }
        })
    }
}

/**
 * Install keyboard event handlers into the given REPL prompt.
 *
 */
const installKeyHandlers = prompt => {
    if (prompt) {
        listenForUpDown(prompt)
        listenForEscape(prompt)
    }
}

/**
 * Install keyboard up-arrow and down-arrow handlers in the given REPL
 * prompt. This needs to be installed in the prompt, as ui.js installs
 * the equivalent handlers in the prompt as well.
 *
 */
const listenForUpDown = prompt => {
    const moveTo = (nextOp, evt) => {
        const block = ui.getCurrentBlock()
        let temporaryContainer = block && block.querySelector('.tab-completion-temporary')

        if (temporaryContainer) {
            const current = temporaryContainer.querySelector('.selected')
            if (current) {
                const next = current[nextOp]

                if (next) {
                    current.classList.remove('selected')
                    next.classList.add('selected')
                    evt.preventDefault() // prevent REPL processing
                }
            }
        }
    }

    prompt.onkeydown = evt => { // keydown is necessary for evt.preventDefault() to work; keyup would otherwise also work
        if (evt.keyCode === ui.keys.DOWN) {
            moveTo('nextSibling', evt)
        } else if (evt.keyCode === ui.keys.UP) {
            moveTo('previousSibling', evt)
        }
    }
}

/**
  * Listen for escape key, and remove tab completion popup, if it is
  * visible
  *
  */
const listenForEscape = prompt => {
    // listen for escape key
    const previousKeyup = document.onkeyup
    const listener = evt => {
        if (evt.keyCode === ui.keys.ESCAPE) {
            const block = ui.getCurrentBlock()
            let temporaryContainer = block && block.querySelector('.tab-completion-temporary')

            if (temporaryContainer) {
                evt.preventDefault()
                temporaryContainer.parentNode.removeChild(temporaryContainer)
                document.onkeyup = previousKeyup
            }
        }
    }
    document.onkeyup = listener

    return listener
}

/**
 * This plugin implements tab completion in the REPL.
 *
 */
module.exports = () => {
    if (typeof document === 'undefined') return

    ui.injectCSS(path.join(__dirname, 'tab-completion.css'))

    // keydown is necessary for evt.preventDefault() to work; keyup would otherwise also work
    document.addEventListener('keydown', evt => {
        const block = ui.getCurrentBlock()
        let temporaryContainer = block && block.querySelector('.tab-completion-temporary')

        if (evt.keyCode === ui.keys.ENTER) {
            if (temporaryContainer) {
                //
                // user hit enter, and we have a temporary container open; remove it
                //

                // first see if we have a selection; if so, add it to the input
                const current = temporaryContainer.querySelector('.selected')
                if (current) {
                    const match = current.getAttribute('data-match'),
                          partial = temporaryContainer.getAttribute('partial'),
                          dirname = temporaryContainer.getAttribute('dirname'),
                          prompt = ui.getCurrentPrompt()

                    complete(match, partial, dirname, prompt)
                }

                // now remove the container from the DOM
                temporaryContainer.parentNode.removeChild(temporaryContainer)

                // prevent the REPL from evaluating the expr
                evt.preventDefault()
            }

        } else if (evt.keyCode === ui.keys.TAB) {
            evt.preventDefault() // for now at least, we want to keep the focus on the current <input>

            const prompt = ui.getCurrentPrompt()
            if (prompt) {
                const value = prompt.value
                if (value) {
                    // last will be the string after the last whitespace; e.g. ls foo => last="foo/bar"
                    const last = ui.findFile(value.substring(value.lastIndexOf(' ') + 1).replace(/["']/g, ''))

                    if (last) {
                        // dirname will "foo" in the above example; it
                        // could also be that last is itself the name
                        // of a directory
                        const lastIsDir = last.charAt(last.length - 1) === '/'
                              dirname = lastIsDir ? last : path.dirname(last)

                        if (dirname) {
                            fs.access(dirname, err => {
                                if (!err) {
                                    // then dirname exists! now scan the directory so we can find matches
                                    fs.readdir(dirname, (err, files) => {
                                        if (!err) {
                                            const partial = path.basename(last),
                                                  matches = files.filter(f => (lastIsDir || f.indexOf(partial) === 0)
                                                                         && !f.endsWith('~') && !f.startsWith('.'))

                                            if (matches.length === 1) {
                                                //
                                                // then there is one unique match, so autofill it now;
                                                // completion will be the bit we have to append to the current prompt.value
                                                //
                                                complete(matches[0], partial, dirname, prompt)

                                            } else if (matches.length > 1) {
                                                //
                                                // then there are multiple matches, present the choices
                                                //

                                                // make a temporary div to house the completion options,
                                                // and attach it to the block that encloses the current prompt
                                                if (!temporaryContainer) {
                                                    const input = block.querySelector('input'),
                                                          { left } = input.getBoundingClientRect()

                                                    // determine pixel width of current input value
                                                    const tmp = document.createElement('div')
                                                    tmp.style.display = 'inline-block'
                                                    tmp.style.opacity = 0
                                                    tmp.innerText = input.value
                                                    document.body.appendChild(tmp)
                                                    const inputWidth = tmp.clientWidth
                                                    document.body.removeChild(tmp)

                                                    temporaryContainer = document.createElement('div')
                                                    temporaryContainer.className = 'tab-completion-temporary scrollable fade-in'
                                                    temporaryContainer.style.marginLeft = `${left + inputWidth - 5}px`

                                                    // for later completion
                                                    temporaryContainer.setAttribute('partial', partial)
                                                    temporaryContainer.setAttribute('dirname', dirname)

                                                    block.appendChild(temporaryContainer)
                                                    installKeyHandlers(prompt)

                                                } else {
                                                    // we already have a temporaryContainer attached to the block
                                                    const current = temporaryContainer.querySelector('.selected'),
                                                          next = current.nextSibling || temporaryContainer.querySelector(':first-child')
                                                    if (next) {
                                                        current.classList.remove('selected')
                                                        next.classList.add('selected')
                                                    }
                                                    return
                                                }

                                                const onChange = () => {
                                                    try {
                                                        block.removeChild(temporaryContainer)
                                                    } catch (err) {
                                                        // already removed
                                                    }
                                                    //prompt.onchange = false
                                                    prompt.removeEventListener('input', onChange)
                                                }
                                                prompt.addEventListener('input', onChange)
                                                //prompt.onchange = onChange

                                                // add each match to that temporary div
                                                matches.forEach((match, idx) => {
                                                    const option = document.createElement('div'),
                                                          optionInner = document.createElement('a')

                                                    temporaryContainer.appendChild(option)
                                                    option.appendChild(optionInner)

                                                    option.className = 'tab-completion-option'
                                                    optionInner.className = 'clickable plain-anchor'
                                                    if (idx === 0) {
                                                        // first item is selected by default
                                                        option.classList.add('selected')
                                                    }

                                                    // onclick, use this match as the completion
                                                    option.addEventListener('click', () => {
                                                        onChange()
                                                        complete(match, partial, dirname, prompt)
                                                    })

                                                    // see if the match is a directory, so that we add a trailing slash
                                                    fs.lstat(expandHomeDir(path.join(dirname, match)), (err, stats) => {
                                                        if (!err && stats.isDirectory()) {
                                                            optionInner.innerText = match + '/'
                                                        } else {
                                                            optionInner.innerText = match
                                                        }
                                                        option.setAttribute('data-match', match)
                                                        option.setAttribute('data-value', option.innerText)
                                                    })
                                                })
                                            }
                                        }
                                    })
                                }
                            })
                        }
                    }
                }
            }
        }
    })
}
