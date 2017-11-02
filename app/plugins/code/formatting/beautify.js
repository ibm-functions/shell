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

const beautify = require('js-beautify').js_beautify

/**
 * A just for fun plugin: beautify the source code of the selected action
 *
 */
module.exports = (commandTree, require) => {
    const wsk = require('/ui/commands/openwhisk-core')

    wsk.synonyms('actions').forEach(syn => commandTree.listen(`/wsk/${syn}/beautify`, (block, nextBlock, _, modules) => {
        const sidecar = document.querySelector('#sidecar')
        if (!sidecar.entity) {
            modules.ui.oops(block, nextBlock)({ error: 'You have not yet selected an entity' })
            return false
        } else if (! (sidecar.entity && sidecar.entity.exec && sidecar.entity.exec.code)) {
            modules.ui.oops(block, nextBlock)('no action code selected')
            return false
        } else {
            // beautify
            sidecar.entity.exec.code = beautify(sidecar.entity.exec.code)
            const code = sidecar.querySelector('.action-content .action-source')
            code.innerText = sidecar.entity.exec.code

            // re-highlight
            setTimeout(() => hljs.highlightBlock(code), 0)

            // save
            return wsk.update(sidecar.entity)
        }
    }, { docs: 'Reformat the source code of an action',
         requireSelection: true,
         filter: selection => selection.type === 'actions'
       }))
}
