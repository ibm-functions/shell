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

const debug = require('debug')('app get')
debug('loading')

const { app_get:usage } = require('./usage'),
      { isAnApp, decorateAsApp } = require('./composer')

const viewName = 'app'

/**
 * Here is the app get entry point. Here we register command
 * handlers.
 *
 */
module.exports = (commandTree, prequire) => {
    const wsk = prequire('/ui/commands/openwhisk-core'),
          rawGet = commandTree.find('/wsk/action/get').$

    /** command handler */
    const doGet = cmd => (_1, _2, _a, { errors }, fullCommand, execOptions, args, options) => {
        const idx = args.indexOf(cmd),
              appName = args[idx + 1]

        return repl.qexec(`wsk action get "${appName}"`, undefined, undefined, { override: true })
    }

    const cmd = commandTree.listen(`/wsk/app/get`, doGet('get'), { usage: usage('get'),
                                                                   needsUI: true,
                                                                   fullscreen: true, width: 800, height: 600,
                                                                   clearREPLOnLoad: true,
                                                                   placeholder: 'Loading app details ...'})

    // override wsk action get
    wsk.synonyms('actions').forEach(syn => {
        commandTree.listen(`/wsk/${syn}/get`, function() {
            if (!rawGet) {
                return Promise.reject()
            }

            debug('rendering')
            return rawGet.apply(undefined, arguments)
                .then(response => {
                    debug('response', response)

                    const action = response.message || response,
                          execOptions = arguments[5]

                    if (action && action.annotations && action.annotations.find(({key}) => key === 'fsm')) {
                        const doVisualize = execOptions.override || !execOptions.nested,
                              content = decorateAsApp({ action, doVisualize }),
                              input = `/${response.namespace}/${response.name}`

                        if (doVisualize) {
                            return Object.assign(action, {
                                type: 'custom',
                                viewName: action.type,
                                content,
                                input,
                                isEntity: true
                            })
                        } else {
                            return response
                        }
                    } else {
                        return response
                    }
                })
        })
    })
}
