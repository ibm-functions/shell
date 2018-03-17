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

const debug = require('debug')('help')
debug('loading')

/**
 * Respond with a top-level usage document
 *
 */
const help = (usage, docs) => (_1, _2, _3, { ui, errors }) => {
    if (usage) {
        // this will be our return value
        const topLevelUsage = {
            title: 'Getting Started',
            header: 'A summary of the top-level command structure.',
            available: [],
            nRowsInViewport: 8 // show a few more rows for top-level help
        }

        // traverse the top-level usage documents, populating topLevelUsage.available
        for (let key in usage) {
            const { route, usage:model } = usage[key]
            if (model && (ui.headless || !model.headlessOnly)) {
                topLevelUsage.available.push({
                    label: route.substring(1),
                    available: model.available,
                    command: model.commandPrefix || model.command,   // either subtree or leaf command
                    docs: model.command ? model.header : model.title // for leaf commands, print full header
                })
            }
        }

        debug('generated top-level usage model', topLevelUsage)
        throw new errors.usage(topLevelUsage)

    } else {
        debug('no usage model')

        const error = new Error('No documentation found')
        error.code = 404
        throw error
    }
}

const override = (route, replacementCmd, commandTree) => {
    const leaf = commandTree.find(route),
          baseCmd = leaf && leaf.$,
          path = route.split('/').slice(1)

    commandTree.listen(route, function() {
        const argv = arguments[2],
              prefix = argv.slice(0, path.length)

        if (baseCmd && prefix.length === path.length && prefix.every((element, idx) => element === path[idx])) {
            return baseCmd.apply(undefined, arguments)
        } else {
            return replacementCmd.apply(undefined, arguments)
        }
    })
}

/**
 * The module. Here, we register as a listener for commands.
 *
 */
module.exports = (commandTree, prequire, { usage, docs }={}) => {
    const wsk = prequire('/ui/commands/openwhisk-core')
    
    const helpCmd = commandTree.listen('/help', help(usage, docs))
    commandTree.synonym('/?', help(usage, docs), helpCmd)

    wsk.synonyms('actions').forEach(syn => {
        override(`/wsk/${syn}/help`, help(usage, docs), commandTree)
    })

    const baseMessage = 'Enter help to see your options.'

    return {
        /**
         * Tell the user about the help feature.
         *    return false to make sure that upstream repl handling is terminated, we take over here
         */
        show: (block, nextBlock, msg) => {
            return ui.oops(block, nextBlock)(msg.isUsageError ? msg : {
                // if the message says command not found, then add on the "enter help to see your options" as a suffix
                error: msg ? msg : baseMessage
            }) && false }
    }
}
