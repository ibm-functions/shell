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

const { isAnApp, decorateAsApp } = require('./composer'),
      { app_list:usage } = require('./usage'),
      { app:appBadge } = require('./badges')

/**
 * Here is the app list entry point. Here we register command
 * handlers.
 *
 */
module.exports = (commandTree, prequire) => {
    const {visualize} = prequire('wskflow')
    const wsk = prequire('/ui/commands/openwhisk-core')

    /** command handler */
    const doList = cmd => function(_1, _2, _a, modules, fullCommand, execOptions, args, options) {
        if (options.help) {
            throw new modules.errors.usage(usage(cmd))
        }

        return repl.qexec(`wsk action ${cmd}`)
            .then(actions => actions.filter(isAnApp))
            .then(apps => {
                apps.forEach(app => {
                    app.prettyType = appBadge
                    app.onclick = () => repl.pexec(`app get ${app.name}`)
                    return app
                })
                return apps
            })
    }

    const synonyms = ['wsk', 'composer']
    synonyms.forEach(tree => {
        const cmd = commandTree.listen(`/${tree}/app/list`, doList('list'), { usage: usage('list') })
        commandTree.synonym(`/${tree}/app/ls`, doList('ls'), cmd, { usage: usage('ls') })
    })

    // override wsk action list
    wsk.synonyms('actions').forEach(syn => {
        wsk.synonyms('list', 'verbs').forEach(verb => {
            const rawList = commandTree.find(`/wsk/${syn}/${verb}`),
                  rawListImpl = rawList.$,
                  rawListOptions = rawList.options.usage ? rawList.options : rawList.options && rawList.options.synonymFor && rawList.options.synonymFor.options

            commandTree.listen(`/wsk/${syn}/${verb}`, function() {
                if (!rawList) {
                    return Promise.reject()
                }

                return rawListImpl.apply(undefined, arguments)
                    .then(response => response.map(action => {
                        if (action && action.annotations && action.annotations.find(({key}) => key === 'fsm')) {
                            decorateAsApp({action, visualize})
                            action.prettyKind = 'composition'
                        }

                        return action
                    }))
            }, rawListOptions)
        })
    })
}
