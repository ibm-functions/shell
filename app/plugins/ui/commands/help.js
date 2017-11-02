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
 * This plugin introduces /help, a help system
 *
 */

/**
 * To reduce clutter, we exclude from the help menus any single-letter synonyms
 *
 */
const singleAlphaPattern = /^\w$/

/**
 * Render one help entry
 *
 * @param currentSelection the currently selected entity
 * @param command is a node in the command tree model
 *
 */
const makeOption = (currentSelection, method) => command => {
    if (command.options) {
        if (!currentSelection && command.options.requireSelection) {
            //
            // this command only makes sense if there is a
            // selection... and there isn't currently one, so filter this
            // out of the help list
            //
            return false

        } else if (currentSelection && command.options.requireSelection
                   && command.options.filter && !command.options.filter(currentSelection)) {
            //
            // there is a selection, but the command requires one of a specific (and differing) type
            //
            return false

        } else if (command.options.hide) {
            //
            // we were asked to make this command invisible (but still an active command)
            //
            return false
        }
    }

    const option = document.createElement('div')
    option.className = 'help-option'

    //
    // handle the main command name
    //
    const commandName = document.createElement('div')
    commandName.className = 'help-option-left-column'
    const commandNameInner = document.createElement('span')
    commandNameInner.innerText = command.key
    commandName.appendChild(commandNameInner)
    option.appendChild(commandName)

    {
        const interiorNodeSuffix = document.createElement('span')

        // onclick handler
        const onclick = command.children
              ? () => repl.pexec(`cd ${command.route}`)  // if this is a subtree, then onclick, change to that context
              : () => repl.partial(`${command.key} `)    // otherwise, add the partial command

        if (command.children) {
            // this is a directory/subtree node
            interiorNodeSuffix.innerText = '/'
        }
        interiorNodeSuffix.className = 'help-option-interior-node-designation'
        commandName.appendChild(interiorNodeSuffix)

        commandNameInner.className = `${commandNameInner.className} clickable`
        commandNameInner.setAttribute('data-help-clickable-command', command.key)
        commandNameInner.onclick =  onclick
    }

    //
    // handle synonyms
    //
    // console.log(command)
    const synonymsCell = document.createElement('div');
    synonymsCell.className = 'help-option-synonyms-column';
    option.appendChild(synonymsCell)

    if (command.synonyms) {
        const synonymsList = document.createElement('div');
        synonymsList.className = 'help-option-synonyms-list';
        synonymsCell.appendChild(synonymsList);
        for (let synonymRoute in command.synonyms) {
            const synonym = command.synonyms[synonymRoute]

            // don't show /wsk/a/ls when the user is asking about /wsk/action commands
            /*if (synonym.parent && synonym.parent.route === routePrefix)*/ {
                if (!synonym.key.match(singleAlphaPattern)) {
                    // for now, hide single-alphabetic-letter synonyms from the help list
                    const synonymDom = document.createElement('div')
                    synonymDom.className = 'help-option-synonym'
                    synonymDom.innerText = synonym.key
                    synonymsList.appendChild(synonymDom)
                }
            }
        }
    }

    //
    // add any docs we might have associated with the main command
    //
    const docsCell = document.createElement('div');
    docsCell.className = 'help-option-docs-column';
    option.appendChild(docsCell)
    if (command.options && command.options.docs) {
        docsCell.innerText = command.options.docs.summary || command.options.docs
    }


    return option
}

/**
 * Separate the given list of commands into three groups, based on
 * relevancy to the given currentSelection:
 *
 *    group 0: especially relevant
 *    group 1: relevant, independent of selection
 *    gruop 2: not applicable, given the current selection [not returned, i.e. these are filtered out)
 *
 */
const partitionByRelevancyTo = (currentSelection, commands) => commands.reduce((partitions, command, idx) => {
    if (command.options) {
        if (!currentSelection && command.options.requireSelection) {
            //
            // this command only makes sense if there is a
            // selection... and there isn't currently one, so filter
            // this out of the help list
            //
            return partitions

        } else if (currentSelection && command.options.requireSelection) {
            if (command.options.filter && !command.options.filter(currentSelection)) {
                //
                // there is a selection, but the command requires one of a specific (and differing) type
                //
                return partitions
            } else {
                //
                // otherwise, we've hit the jackpot, this is just the kind of entity the command targets
                //
                partitions[0].push(command)
                return partitions
            }

        } else if (command.options.hide) {
            //
            // we were asked to make this command invisible (but still an active command)
            //
            return partitions
        }
    }

    // otherwise, this command pertains, but is not especially relevant, to the currentSelection
    partitions[1].push(command)
    return partitions
}, [[], []]) // we return two arrays of commands; they are initially empty, and the commands.reduce populates them

/**
 * Show help, where model is the commandTree model, and method is either
 *   - commandsInCurrentContext
 *   - directoriesInCurrentContext
 *
 */
const show = (model, method) => {
    return () => {
        const containers = [ document.createElement('div'), document.createElement('div') ]

        // render the help menu into the container
        const commands = model[method]().sort((a,b) => a.key.localeCompare(b.key)) // sort the commands
        partitionByRelevancyTo(ui.currentSelection(), commands)
            .map((partition, idx) => partition.map(makeOption(ui.currentSelection(), method)) // make the UI for each of the options
                 .map(command => containers[idx].appendChild(command)))                       // add them to the dom container

        // wrap the partitions into an enclosing dom container
        const container = document.createElement('div')
        container.style.display = 'flex'
        container.style.flexWrap = 'wrap'
        const titles = ['These commands are especially relevant to your current selection:', 'The following commands are relevant to your current context:']
        containers.map((C, idx) => {
            if (C.children.length > 0) {
                const title = document.createElement('div')
                title.innerText = titles[idx]
                title.className = 'deemphasize'
                title.style.marginTop = '1em'
                title.style.flexBasis = '100%'
                container.appendChild(title)

                C.className = 'help-options'
                container.appendChild(C)
            }
        })
        return container
    }
}

/**
 * The module. Here, we register as a listener for commands.
 *
 */
module.exports = commandTree => {
    const model = commandTree.getModel(),
          help = show(model, 'everythingInCurrentContext')
          //help = show(model, 'commandsInCurrentContext'),
          //ls = show(model, 'directoriesInCurrentContext')

    const helpCmd = commandTree.listen('/help', help, { docs: 'Here you are!', needsUI: true })
    commandTree.synonym('/?', help, helpCmd)
    //commandTree.catchAll('ls', ls, helpCmd)

    const baseMessage = 'Enter help to see your options.'

    return {
        /**
         * Tell the user about the help feature.
         *    return false to make sure that upstream repl handling is terminated, we take over here
         */
        show: (block, nextBlock, msg) =>{
            return ui.oops(block, nextBlock)({
            // if the message says command not found, then add on the "enter help to see your options" as a suffix
            error: msg ? msg : baseMessage
            }) && false }
    }
}
