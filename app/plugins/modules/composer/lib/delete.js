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

const { deleteBinding } = require('./composer')

/**
 * Here is the app delete entry point. Here we register command
 * handlers.
 *
 */
module.exports = (commandTree, prequire) => {
    const { rm } = prequire('/openwhisk-extensions/rm')

    /** delegate to the rm command */
    const doDelete = function(_1, _2, args) {
        // rewrite the args, to conform to rm
        const idx = args.indexOf('app')
        args[idx] = 'action'
        args[idx + 1] = 'rm'

        // we want back the raw list of deleted actions
        arguments[5] = { raw: true }

        // delete the action, then delete the binding
        return rm('action').apply(undefined, arguments)
            .then(actionsDeleted => Promise.all(actionsDeleted.map(deleteBinding))
                  .then(deleteResults => {
                      const success = deleteResults.filter(_ => _.ok).map(_ => _.ok),
                            failures = deleteResults.filter(_ => _.error).map(_ => _.error)
                      return `deleted ${success.join(', ')}${failures.length === 0 ? '' : '; failed to delete ' + failures.join(', ')}`
                  }))
    }

    commandTree.listen(`/wsk/app/delete`, doDelete, { docs: 'Delete a Composer application' })
}
