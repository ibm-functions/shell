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
 * This plugin renames an entity.
 *
 */

/** here is the module */
module.exports = (commandTree, require) => {
    const wsk = require('/ui/commands/openwhisk-core')

    /**
     * Print usage/docs information
     *
     */
    const usage = () => {
        return 'Usage: mv name new_name'
    }

    /**
     * This is the core logic
     *
     */
    const mv = type => (_1, _2, _3, _4, _5, _6, argv, options) => {
        const idx = argv.indexOf('mv') + 1,
              oldName = argv[idx],
              newName = argv[idx + 1]

        if (!oldName || !newName || options.help) {
            return usage()
        } else {
            return repl.qfexec(`wsk ${type} cp ${oldName} ${newName}`)
                .then(resp => repl.qexec(`wsk ${type} rm ${oldName}`).then(() => resp))
        }
    }

    // Install the routes. for now, no renaming of packages or triggers or rules
    ['actions'].forEach(type => {
        const handler = mv(type)
        wsk.synonyms(type).forEach(syn => {
            const cmd = commandTree.listen(`/wsk/${syn}/mv`, handler, { docs: `Rename OpenWhisk ${type}` })
        })
    })

}
