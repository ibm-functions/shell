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
 * This plugin introduces /wsk/activations/last, which finds and displays the last activation.
 *
 */
module.exports = (commandTree, require) => {
    const wsk = require('/ui/commands/openwhisk-core')

    wsk.synonyms('activations').forEach(syn => commandTree.listen(`/wsk/${syn}/last`, (_1, _2, fullArgv, modules, _3, execOptions) => {
        const argv = fullArgv.slice(fullArgv.indexOf('last'))
        console.log('repl::show last activation', argv)

        const limit = argv.length === 1 ? 1 : 200 // if no options, then we're showing just the last activation
        return modules.repl.qexec(`activation list --limit ${limit} ${argv.slice(1).join(' ')}`)
            .then(response => {
                if (response.length === 0) {
                    throw new Error(argv.length === 1 ? 'You have no activations' : 'No matching activations')
                } else {
                    return modules.repl.qexec(`activation get ${response[0].activationId}`)
                        .then(activation => commandTree.changeContext(`/wsk/activation`, activation.activationId)(activation))
                }
            })
    }, { docs: 'Show the last activation. Hint: try passing --name xxx to filter results' }))
}
                      
