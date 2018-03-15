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
 * A plugin that helps with modifying sequences: appending, prepending, etc.
 *
 */

const currentSelection = () => document.querySelector('#sidecar').entity

const matchers = [
    { pattern: /(\+=|append|prepend|then|unshift)\s+(.*)\s+to\s+([^\|]*)\s*$/, amendment: 2, amendee: match => match[3] },
    { pattern: /(\+=|append|prepend|then|unshift)\s+(.*)\s*$/, amendment: 2, amendee: currentSelection }
]

const intent = {
    append: 'append',
    then: 'append',
    '+=': 'append',

    prepend: 'prepend',
    unshift: 'prepend'
}

/** here is the module */
module.exports = (commandTree, require) => {
    const wsk = require('/ui/commands/openwhisk-core'),
          letPlugin = require('/openwhisk-extensions/actions/let')

    /**
     * This is shorthand for let + update
     *
     */
    const doAppend = (_1, _2, fullArgv, modules, fullCommand, execOptions) => {
        return Promise.all(matchers.map(matcher => ({ matcher: matcher, match: fullCommand.match(matcher.pattern) })))
            .then(matches => matches.filter(match => match.match))
            .then(matches => matches && matches[0])
            .then(match => {
                if (!match) throw new Error('Parse error')
                else return match
            }).then(match => {
                const amendment = match.match[match.matcher.amendment],  // this is what we want to add
                      amendee = match.matcher.amendee(match.match)       // and we'll be adding to this element

                // append or prepend?
                const op = match.match[1],
                      slotInAfter = intent[op] === 'append',
                      seq = (a,b) => slotInAfter ? `${a} -> ${b}` : `${b} -> ${a}`,
                      push = slotInAfter ? 'push' : 'unshift'

                if (!amendee) {
                    throw new Error(`Please select an action to amend, either via "${op} ... to action", or by opening it in the sidecar`)
                }

                // amendee.exec means that amendee is an already-resolved action; otherwise, we have to fetch it
                return (amendee.exec ? Promise.resolve(amendee) : repl.qexec(`wsk action get ${amendee}`))
                    .then(amendee => {
                        if (amendee.exec.kind !== 'sequence') {
                            //
                            // amendee is not (yet) a sequence, so we need to manufacture a let expr to re-create it as sequence
                            //
                            const name = `${amendee.packageName ? amendee.PackageName + '/' : ''}${amendee.name}`,
                                  copy =  `_${name}`
                            return repl.qexec(`wsk action update --copy ${copy} ${name} `)
                                .then(() => repl.qexec(`let ${name} = ${seq(copy, amendment)} -a wskng.combinators false`))
                                    // note how, since we're reusing the {name}, we'll have the annotations and params copied for free
                                    // however, we want to belay any management tags, as this is now a plain sequence

                        } else {
                            const idx = slotInAfter ? amendee.exec.components.length : 0
                            return letPlugin.resolve(amendment, amendee.name, idx)
                                .then(amendment => {
                                    amendee.exec.components[push](`/${amendment.namespace}/${amendment.name}`)

                                    // here, we have to manually remove the management tag
                                    amendee.annotations = amendee.annotations.filter(kv => kv.key !== 'wskng.combinators')
                                    
                                    return wsk.ow.actions.update(wsk.owOpts({ name: amendee.name, namespace: amendee.namespace,
									      action: amendee
									    }))
                                        .then(wsk.addPrettyType('actions', 'update'))
                                        .then(action => execOptions && execOptions.nested ? action : commandTree.changeContext(`/wsk/action`, action.name)(action))
                                })
                        }
                    })
            })
    }

    // these options help guide the help system; this command needs a selection, and it needs to be a sequence
    const commonOptions = {
        requireSelection: true,
        filter: selection => selection.type === 'actions'
    }
    const docs = docString => Object.assign({ docs: docString }, commonOptions)

    // Install the routes
    wsk.synonyms('actions').forEach(syn => {
        const prepend = commandTree.listen(`/wsk/${syn}/prepend`, doAppend, docs('Prepend to a sequence'))
        for (let verbSyn in intent) {
            if (intent[verbSyn] === 'prepend') {
                commandTree.synonym(`/wsk/${syn}/${verbSyn}`, doAppend, prepend)
            }
        }

        const append = commandTree.listen(`/wsk/${syn}/append`, doAppend, docs('Append to a sequence'))
        for (let verbSyn in intent) {
            if (intent[verbSyn] === 'append') {
                commandTree.synonym(`/wsk/${syn}/${verbSyn}`, doAppend, append)
            }
        }
    })
}
