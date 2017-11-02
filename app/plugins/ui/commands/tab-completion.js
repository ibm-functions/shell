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
      path = require('path')

/**
 * We've found a match. Add this match to the given partial match,
 * located in the given dirname'd directory, and update the given
 * prompt, which is an <input>.
*
*/
const complete = (match, partial, dirname, prompt) => {
    const completion = match.substring(partial.length)
    if (completion) {
        fs.lstat(path.join(dirname, match), (err, stats) => {
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
 * This plugin implements tab completion in the REPL.
 *
 */
module.exports = () => {
    if (typeof document === 'undefined') return

    document.onkeydown = evt => { // keydown is necessary for evt.preventDefault() to work; keyup would otherwise also work
        if (evt.keyCode === ui.keys.TAB) {
            evt.preventDefault() // for now at least, we want to keep the focus on the current <input>

            const prompt = ui.getCurrentPrompt()
            if (prompt) {
                const value = prompt.value
                if (value) {
                    // last will be the string after the last whitespace; e.g. ls foo => last="foo/bar"
                    const last = ui.findFile(value.substring(value.lastIndexOf(' ') + 1).replace(/["']/g, ''))

                    if (last) {
                        // dirname will "foo" in the above example
                        const dirname = path.dirname(last)

                        if (dirname) {
                            fs.access(dirname, err => {
                                if (!err) {
                                    // then dirname exists! now scan the directory so we can find matches
                                    fs.readdir(dirname, (err, files) => {
                                        if (!err) {
                                            const partial = path.basename(last),
                                                  matches = files.filter(f => f.indexOf(partial) === 0 && !f.endsWith('~'))
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
                                                const block = ui.getCurrentBlock()

                                                // make a temporary div to house the completion options,
                                                // and attach it to the block that encloses the current prompt
                                                let temporaryContainer = block.querySelector('.tab-completion-temporary')
                                                if (!temporaryContainer) {
                                                    temporaryContainer = document.createElement('div')
                                                    temporaryContainer.classList.add('tab-completion-temporary')
                                                    temporaryContainer.style.display = 'flex'
                                                    temporaryContainer.style.flexWrap = 'wrap'
                                                    block.appendChild(temporaryContainer)
                                                } else {
                                                    // we already have a temporaryContainer attached to the block
                                                    return
                                                }

                                                const onChange = () => {
                                                    block.removeChild(temporaryContainer)
                                                    //prompt.onchange = false
                                                    prompt.removeEventListener('input', onChange)
                                                }
                                                prompt.addEventListener('input', onChange)
                                                //prompt.onchange = onChange

                                                // add each match to that temporary div
                                                matches.forEach(match => {
                                                    const option = document.createElement('div')
                                                    option.classList.add('clickable')
                                                    option.style.marginRight = '1em'
                                                    temporaryContainer.appendChild(option)

                                                    // onclick, use this match as the completion
                                                    option.addEventListener('click', () => {
                                                        console.error('@@@@@@@')
                                                        onChange()
                                                        complete(match, partial, dirname, prompt)
                                                    })

                                                    // see if the match is a directory, so that we add a trailing slash
                                                    fs.lstat(path.join(dirname, match), (err, stats) => {
                                                        if (!err && stats.isDirectory()) {
                                                            option.innerText = match + '/'
                                                        } else {
                                                            option.innerText = match
                                                        }
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
    }
}
