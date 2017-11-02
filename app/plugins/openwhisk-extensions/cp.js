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
 * This plugin copies an entity.
 *
 */

/** here is the module */
module.exports = (commandTree, require) => {
    const wsk = require('/ui/commands/openwhisk-core'),
          OP = 'cp',              // name for the operation
          OP_SYNS = ['copy']      // synonyms for the operation

    /**
     * Print usage/docs information
     *
     */
    const usage = () => {
        return 'Usage: cp name new_name'
    }

    /**
     * This is the core logic
     *
     */
    const doLogic = type => (retryOK, _2, _3, _4, _5, _6, argv, options) => {
        const idx = argv.indexOf(OP) + 1,
              oldName = argv[idx],
              newName = argv[idx + 1]

        if (!oldName || !newName || options.help) {
            return usage()
        } else {
            /**
             * If the copy failed, maybe this is because the destination package does not exist?
             *
             */
            const packageAutoCreate = name => err => {
                if (err.statusCode === 404 && retryOK) {
                    // create failure with 404, maybe package not found?
                    const path = name.split('/'),
                          packageName = path.length === 2 ? path[0] : path.length === 3 ? path[1] : undefined
                    if (packageName) {
                        return repl.qexec(`wsk package update "${packageName}"`)
                            .then(() => doLogic(type)(false, _2, _3, _4, _5, _6, argv, options)) // false: don't retry again
                    }
                }

                // otherwise, it wasn't a package existence issue
                throw err
            }

            return repl.qfexec(`wsk ${type} update --copy ${newName} ${oldName}`)
                .catch(packageAutoCreate(newName))
        }
    }

    // Install the routes. for now, no copying of packages or triggers or rules
    ['actions'].forEach(type => {
        const handler = doLogic(type)
        wsk.synonyms(type).forEach(syn => {
            const cmd = commandTree.listen(`/wsk/${syn}/${OP}`, handler, { docs: `Copy OpenWhisk ${type}` })

            OP_SYNS.forEach(op_syn => {
                commandTree.synonym(`/wsk/${syn}/${op_syn}`, handler, cmd)
            })
        })
    })

}
