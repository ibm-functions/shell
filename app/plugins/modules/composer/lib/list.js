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
      { app:appBadge } = require('./badges')

/**
 * Usage message
 *
 */
const usage = cmd => ({
    title: 'List Openwhisk Compososer apps',
    header: 'Print a list of deployed compositions',
    example: `app ${cmd}`,
    optional: [{ name: '--limit', docs: 'show at most N compositions' },
               { name: '--skip', docs: 'skip over the most first N compositions' }],
    related: ['app create', 'app get', 'app invoke']
})

/**
 * Here is the app list entry point. Here we register command
 * handlers.
 *
 */
module.exports = (commandTree, prequire) => {
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
        const cmd = commandTree.listen(`/${tree}/app/list`, doList('list'), { docs: 'List your Composer applications' })
        commandTree.synonym(`/${tree}/app/ls`, doList('ls'), cmd)
    })

    // override wsk action list
    wsk.synonyms('actions').forEach(syn => {
        wsk.synonyms('list', 'verbs').forEach(verb => {
            const rawList = commandTree.find(`/wsk/${syn}/${verb}`).$
            commandTree.listen(`/wsk/${syn}/${verb}`, function() {
                if (!rawList) {
                    return Promise.reject()
                }
                return rawList.apply(undefined, arguments)
                    .then(response => response.map(action => {
                        if (action && action.annotations && action.annotations.find(({key}) => key === 'fsm')) {
                            decorateAsApp(action)
                            action.prettyKind = 'composition'
                        }

                        return action
                    }))
            })
        })
    })
}
