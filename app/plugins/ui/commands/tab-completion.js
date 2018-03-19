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

const debug = require('debug')('tab completion')

const fs = require('fs'),
      path = require('path'),
      expandHomeDir = require('expand-home-dir')

/**
 * We've found a match. Add this match to the given partial match,
 * located in the given dirname'd directory, and update the given
 * prompt, which is an <input>.
*
*/
const complete = (match, prompt, { temporaryContainer, partial=temporaryContainer.partial, dirname=temporaryContainer.dirname, addSpace=false }) => {
    debug('completion', match, partial, dirname)

    // in case match includes partial as a prefix
    const partialIdx = match.indexOf(partial),
          completion = (partialIdx >= 0 ? match.substring(partialIdx + partial.length) : match) + (addSpace ? ' ' : '')

    if (temporaryContainer) {
        temporaryContainer.cleanup()
    }

    if (completion) {
        if (dirname) {
            // see if we need to add a trailing slash
            fs.lstat(expandHomeDir(path.join(dirname, match)), (err, stats) => {
                if (!err) {
                    if (stats.isDirectory()) {
                        // add a trailing slash if the dirname/match is a directory
                        debug('complete as directory')
                        prompt.value = prompt.value + completion + '/'
                    } else {
                        // otherwise, dirname/match is not a directory
                        debug('complete as scalar')
                        prompt.value = prompt.value + completion
                    }
                } else {
                    console.error(err)
                }
            })

        } else {
            // otherwise, just add the completion to the prompt
            debug('complete as scalar (alt)')
            prompt.value = prompt.value + completion
        }
    } else {
        debug('no completion string')
    }
}

/**
 * Install keyboard event handlers into the given REPL prompt.
 *
 */
const installKeyHandlers = prompt => {
    if (prompt) {
        return [ listenForUpDown(prompt),
                 listenForEscape(prompt)
               ]
    } else {
        return []
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

    const previousKeyDown = prompt.onkeydown
    prompt.onkeydown = evt => { // keydown is necessary for evt.preventDefault() to work; keyup would otherwise also work
        if (evt.keyCode === ui.keys.DOWN) {
            moveTo('nextSibling', evt)
        } else if (evt.keyCode === ui.keys.UP) {
            moveTo('previousSibling', evt)
        }
    }

    // cleanup routine
    return () => prompt.onkeydown = previousKeyDown
}

/**
  * Listen for escape key, and remove tab completion popup, if it is
  * visible
  *
  */
const listenForEscape = prompt => {
    // listen for escape key
    const previousKeyup = document.onkeyup,
          cleanup = () => document.onkeyup = previousKeyup

    document.onkeyup = evt => {
        if (evt.keyCode === ui.keys.ESCAPE) {
            const block = ui.getCurrentBlock()
            let temporaryContainer = block && block.querySelector('.tab-completion-temporary')

            if (temporaryContainer) {
                evt.preventDefault()
                temporaryContainer.cleanup()
            }
        }
    }

    return cleanup
}

/** safeguard: only one tab completion temporary at a time, please */
const cleaner = () => {
    const safeguard = document.querySelectorAll('.tab-completion-temporary')
    for (let idx = 0; idx < safeguard.length; idx++) {
        try {
            console.error('removing glitch')
            const old = safeguard[idx]
            if (old.parentNode) {
                old.parentNode.removeChid(safeguard)
            }
        } catch (err) {
            console.error('error removing glitch', err)
        }
    }
}

/**
  * Make a container UI for tab completions
  *
  */
const makeCompletionContainer = (block, prompt, partial, dirname, lastIdx) => {
    const input = block.querySelector('input')

    const temporaryContainer = document.createElement('div')
    temporaryContainer.className = 'tab-completion-temporary scrollable fade-in'

    // determine pixel width of current input value
    const tmp = document.createElement('div')
    tmp.style.display = 'inline-block'
    tmp.style.opacity = 0
    tmp.innerText = input.value
    document.body.appendChild(tmp)
    const inputWidth = tmp.clientWidth
    document.body.removeChild(tmp)

    const { left, width:containerWidth } = input.getBoundingClientRect(),
          desiredLeft = left + inputWidth - 5

    if (desiredLeft + inputWidth < containerWidth) {
        // the popup likely won't overflow to the right
        temporaryContainer.style.marginLeft = `${desiredLeft}px`
    } else {
        // oops, it will
        temporaryContainer.style.marginLeft = `calc(${containerWidth}px - 15em)`
    }

    // for later completion
    temporaryContainer.partial = partial
    temporaryContainer.dirname = dirname
    temporaryContainer.lastIdx = lastIdx
    temporaryContainer.matches = []

    block.appendChild(temporaryContainer)
    const handlers = installKeyHandlers(prompt)

    /** respond to change of prompt value */
    const onChange = () => {
        if (!prompt.value.endsWith(partial)) {
            // oof! then the prompt changed substantially; get out of
            // here quickly
            return temporaryContainer.cleanup()
        }

        const args = repl.split(prompt.value),
              currentText = args[temporaryContainer.lastIdx],
              prevMatches = temporaryContainer.matches
              newMatches = prevMatches.filter(({match, option}) => match.indexOf(currentText) === 0),
              removedMatches = prevMatches.filter(({match, option}) => match.indexOf(currentText) !== 0)

        temporaryContainer.matches = newMatches
        removedMatches.forEach(({option}) => temporaryContainer.removeChild(option))

        temporaryContainer.partial = currentText

        if (temporaryContainer.matches.length === 0) {
            // no more matches, so remove the temporary container
            temporaryContainer.cleanup()
        }
    }
    prompt.addEventListener('input', onChange)

    temporaryContainer.cleanup = () => {
        try {
            block.removeChild(temporaryContainer)
        } catch (err) {
            // already removed
        }
        try {
            handlers.forEach(cleanup => cleanup())
        } catch (err) {
            // just in case
        }
        prompt.removeEventListener('input', onChange)
    }

    // in case the container scrolls off the bottom TODO we should
    // probably have it positioned above, so as not to introduce
    // scrolling?
    setTimeout(repl.scrollIntoView, 0)

    return temporaryContainer
}

/**
 * Add a suggestion to the suggestion container
 *
 */
const addSuggestion = (temporaryContainer, partial, dirname, prompt) => (match, idx) => {
    const matchLabel = match.label || match,
          matchCompletion = match.completion || matchLabel

    const option = document.createElement('div'),
          optionInnerFill = document.createElement('span'),
          optionInner = document.createElement('a')

    temporaryContainer.appendChild(option)
    option.appendChild(optionInnerFill)
    optionInnerFill.appendChild(optionInner)

    // we want the clickable part to fill horizontal space
    optionInnerFill.className = 'tab-completion-temporary-fill'

    optionInner.appendChild(document.createTextNode(matchLabel))

    // maybe we have a doc string for the match?
    if (match.docs) {
        const optionDocs = document.createElement('span')
        optionDocs.className = 'deemphasize left-pad'
        option.appendChild(optionDocs)
        optionDocs.innerText = `(${match.docs})`
    }

    option.className = 'tab-completion-option'
    optionInner.className = 'clickable plain-anchor'
    if (idx === 0) {
        // first item is selected by default
        option.classList.add('selected')
    }
    
    // onclick, use this match as the completion
    option.addEventListener('click', () => {
        complete(matchCompletion, prompt, { temporaryContainer, partial, dirname, addSpace: match.addSpace })
    })

    option.setAttribute('data-match', matchLabel)
    option.setAttribute('data-completion', matchCompletion)
    if (match.addSpace) option.setAttribute('data-add-space', match.addSpace)
    option.setAttribute('data-value', optionInner.innerText)

    // for incremental completion; see onChange handler above
    temporaryContainer.matches.push({ match: matchLabel, completion: matchCompletion, option })

    return { option, optionInner }
}

/**
 * Suggest completions for a local file
 *
 */
const suggestLocalFile = (last, block, prompt, temporaryContainer, lastIdx) => {
    // dirname will "foo" in the above example; it
    // could also be that last is itself the name
    // of a directory
    const lastIsDir = last.charAt(last.length - 1) === '/',
          dirname = lastIsDir ? last : path.dirname(last)

    debug('suggest local file', dirname, last)
    
    if (dirname) {
        // then dirname exists! now scan the directory so we can find matches
        fs.readdir(dirname, (err, files) => {
            if (err) {
                debug('fs.readdir error', err)

            } else {
                debug('fs.readdir success')

                const partial = path.basename(last),
                      matches = files.filter(f => (lastIsDir || f.indexOf(partial) === 0)
                                             && !f.endsWith('~') && !f.startsWith('.'))

                if (matches.length === 1) {
                    //
                    // then there is one unique match, so autofill it now;
                    // completion will be the bit we have to append to the current prompt.value
                    //
                    debug('singleton file completion', matches[0])
                    complete(matches[0], prompt, { temporaryContainer, partial, dirname })

                } else if (matches.length > 1) {
                    //
                    // then there are multiple matches, present the choices
                    //
                    debug('multi file completion')

                    // make a temporary div to house the completion options,
                    // and attach it to the block that encloses the current prompt
                    if (!temporaryContainer) {
                        temporaryContainer = makeCompletionContainer(block, prompt, partial, dirname, lastIdx)
                    }

                    // add each match to that temporary div
                    matches.forEach((match, idx) => {
                        const { option, optionInner } = addSuggestion(temporaryContainer, partial, dirname, prompt)(match, idx)

                        // see if the match is a directory, so that we add a trailing slash
                        fs.lstat(expandHomeDir(path.join(dirname, match)), (err, stats) => {
                            if (!err && stats.isDirectory()) {
                                optionInner.innerText = match + '/'
                            } else {
                                optionInner.innerText = match
                            }
                            option.setAttribute('data-value', optionInner.innerText)
                        })
                    })
                }
            }
        })
    }
}

/**
 * Given a list of entities, filter them and present options
 *
 */
const filterAndPresentEntitySuggestions = (last, block, prompt, temporaryContainer, lastIdx) => entities => {
    debug('entities', entities)

    // find matches, given the current prompt contents
    const filteredList = entities.map(({name, packageName, namespace}) => {
        const packageNamePart = packageName ? `${packageName}/` : '',
              actionWithPackage = `${packageNamePart}${name}`,
              fqn = `/${namespace}/${actionWithPackage}`

        return name.indexOf(last) === 0 && actionWithPackage
            || actionWithPackage.indexOf(last) === 0 && actionWithPackage
            || fqn.indexOf(last) === 0 && fqn

    }).filter(x => x)

    debug('filtered list', filteredList)

    if (filteredList.length === 1) {
        // then we found just one match; we can complete it now,
        // without bothering with a completion popup
        debug('singleton entity match', filteredList[0])
        complete(filteredList[0], prompt, { partial: last, dirname: false })

    } else if (filteredList.length > 0) {
        // then we found multiple matches; we need to render them as
        // a tab completion popup
        const partial = last,
              dirname = undefined

        if (!temporaryContainer) {
            temporaryContainer = makeCompletionContainer(block, prompt, partial, dirname, lastIdx)
        }

        filteredList.forEach(addSuggestion(temporaryContainer, partial, dirname, prompt))
    }
}

/**
 * Command not found, but we have command completions to offer the user
 *
 */
const suggestCommandCompletions = (matches, partial, block, prompt, temporaryContainer) => {
    // don't suggest anything without a usage model, and then align to
    // the addSuggestion model
    matches = matches.filter(({ usage, docs }) => usage || docs)
        .map(({ command, docs, usage={command, docs} }) => ({
            label: usage.command || usage.commandPrefix,
            completion: command,
            addSpace: true,
            docs: usage.title || usage.header || usage.docs // favoring shortest first
        }))

    if (matches.length === 1) {
        debug('singleton command completion', matches[0])
        complete(matches[0].completion, prompt, { partial, dirname: false })

    } else if (matches.length > 0) {
        debug('suggesting command completions', matches, partial)

        if (!temporaryContainer) {
            temporaryContainer = makeCompletionContainer(block, prompt, partial)
        }

        // add suggestions to the container
        matches.forEach(addSuggestion(temporaryContainer, partial, undefined, prompt))
    }
}

/**
 * Suggest options
 *
 */
const suggest = (param, last, block, prompt, temporaryContainer, lastIdx) => {
    if (param.file) {
        // then the expected parameter is a file; we can auto-complete
        // based on the contents of the local filesystem
        return suggestLocalFile(last, block, prompt, temporaryContainer, lastIdx)

    } else if (param.entity) {
        // then the expected parameter is an existing entity; so we
        // can enumerate the entities of the specified type
        return repl.qexec(`${param.entity} list --limit 200`)
            .then(filterAndPresentEntitySuggestions(last, block, prompt, temporaryContainer, lastIdx))
    }
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
                          completion = current.getAttribute('data-completion'),
                          addSpace = current.getAttribute('data-add-space'),
                          partial = temporaryContainer.partial,
                          dirname = temporaryContainer.dirname,
                          prompt = ui.getCurrentPrompt()

                    complete(completion, prompt, { temporaryContainer, addSpace })
                }

                // prevent the REPL from evaluating the expr
                evt.preventDefault()

                // now remove the container from the DOM
                try {
                    temporaryContainer.cleanup()
                } catch (err) {
                    // it may have already been removed elsewhere
                }
            }

        } else if (evt.keyCode === ui.keys.TAB) {
            const prompt = ui.getCurrentPrompt()

            if (prompt) {
                const value = prompt.value
                if (value) {
                    evt.preventDefault() // for now at least, we want to keep the focus on the current <input>

                    if (temporaryContainer) {
                        // we already have a temporaryContainer
                        // attached to the block, so tab means cycle
                        // through the options
                        const current = temporaryContainer.querySelector('.selected'),
                              next = current.nextSibling || temporaryContainer.querySelector(':first-child')
                        if (next) {
                            current.classList.remove('selected')
                            next.classList.add('selected')
                        }
                        return
                    }

                    const yo = usageError => {
                        const usage = usageError.raw ? usageError.raw.usage || usageError.raw : usageError.usage || usageError
                        debug('usage', usage, usageError)

                        if (usage.fn) {
                            // resolve the generator and retry
                            debug('resolving generator')
                            yo(usage.fn(usage.command))

                        } else if (usageError.partialMatches || usageError.available) {
                            // command not found, with partial matches that we can offer the user
                            suggestCommandCompletions(usageError.partialMatches || usageError.available,
                                                      prompt.value,
                                                      block, prompt,
                                                      temporaryContainer)

                        } else if (usage && usage.command) {
                            // so we have a usage model; let's
                            // determine what parameters we might be
                            // able to help with
                            const required = usage.required || [],
                                  optionalPositionals = (usage.optional || []).filter(({positional}) => positional),
                                  oneofs = usage.oneof ? [usage.oneof[0]] : [],
                                  positionals = required.concat(oneofs).concat(optionalPositionals)

                            debug('positionals', positionals)
                            if (positionals.length > 0) {
                                const args = repl.split(prompt.value), // this is the "argv", for the current prompt value
                                      commandIdx = args.indexOf(usage.command) + 1, // the terminal command of the prompt
                                      nActuals = args.length - commandIdx,
                                      lastIdx = Math.max(0, nActuals - 1), // if no actuals, use first param
                                      param = positionals[lastIdx]

                                debug('maybe', args.length, commandIdx, param, args[commandIdx + lastIdx])

                                if (commandIdx === args.length && !prompt.value.match(/\s+$/)) {
                                    // then the prompt has e.g. "wsk package" with no terminal whitespace; nothing to do yet
                                    return

                                } else if (param) {
                                    // great, there is a positional we can help with
                                    try {
                                        // we found a required positional parameter, now suggest values for this parameter
                                        suggest(param, ui.findFile(args[commandIdx + lastIdx], true),
                                                block, prompt, temporaryContainer, commandIdx + lastIdx)
                                    } catch (err) {
                                        console.error(err)
                                    }
                                }
                            }
                        }
                    }
                    try {
                        debug('fetching usage', value)
                        const what = repl.qexec(`${value} --help`, undefined, undefined, { failWithUsage: true })
                        if (what.then) {
                            what.then(yo, yo)
                        } else {
                            yo(what)
                        }
                    } catch (err) {
                        console.error(err)
                    }
                }
            }
        }
    })
}
