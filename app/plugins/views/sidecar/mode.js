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
 * This plugin helps with controlling and knowing what the sidecar should display
 *
 */

const util = require('util')

/**
 * These options help guide the help system; this command needs a
 * selection, and it (possibly, if the requiredType parameter is
 * given) needs to be of a certain type.
 *
 * If requiredType===true, then accept any
 *
 */
const docs = (docString, requiredType, noSequencesPlease) => Object.assign({ docs: docString }, {
    requireSelection: true,
    filter: requiredType && (selection => {
        return (requiredType === true || selection.type === requiredType)     // requiredType matches
            && (!noSequencesPlease || selection.prettyType !== 'sequence')    // isSequence matches
    })
})

module.exports = (commandTree, require) => {
    const wsk = require('/ui/commands/openwhisk-core'),
          sidecarVisibility = require('/views/sidecar/visibility')

    const switchSidecarMode = (entityType, mode) => (block, nextBlock) => {
        const sidecar = document.querySelector('#sidecar')
        if (sidecar && sidecar.entity && (!entityType
                                          || sidecar.entity.type === entityType
                                          || util.isArray(entityType) && entityType.find(t => t === sidecar.entity.type))) {
            sidecarVisibility.show()
            return ui.showEntity(sidecar.entity, { show: mode }, block, nextBlock)
        } else {
            throw new Error(!entityType ? 'You have not selected an entity'
                            : `You have not yet selected ${ui.startsWithVowel(entityType) ? 'an' : 'a'} ${entityType.replace(/s$/, '')}`)
        }
    }

    //
    // toggle activation mode
    //
    wsk.synonyms('activations').forEach(syn => {
        commandTree.listen(`/wsk/${syn}/result`, switchSidecarMode('activations', 'result'), docs('Show the result of an activation', 'activations'))
        commandTree.listen(`/wsk/${syn}/logs`, switchSidecarMode('activations', 'logs'), docs('Show the logs of an activation', 'activations'))
    })

    //
    // toggle action mode
    wsk.synonyms('actions').forEach(syn => {
        commandTree.listen(`/wsk/${syn}/code`, switchSidecarMode('actions', 'code'), docs('Show the code of an action', 'actions', true))
        commandTree.listen(`/wsk/${syn}/limits`, switchSidecarMode('actions', 'limits'), docs('Show the limits of an action', 'actions'))
    })

    wsk.crudable.forEach(type => {
        //   undefined means it makes sense for any entity
        const anEntity = `${ui.startsWithVowel(type) ? 'an' : 'a'} ${wsk.toOpenWhiskKind(type)}`

        wsk.synonyms(type).forEach(syn => {
            const paramsCmd = commandTree.listen(`/wsk/${syn}/parameters`, switchSidecarMode(undefined, 'parameters'), docs(`Show the parameters of ${anEntity}`, true, true))
            commandTree.synonym(`/wsk/${syn}/params`, switchSidecarMode(undefined, 'parameters'), paramsCmd)

            commandTree.listen(`/wsk/${syn}/annotations`, switchSidecarMode(undefined, 'annotations'), docs(`Show the annotations of ${anEntity}`))
            commandTree.listen(`/wsk/${syn}/content`, switchSidecarMode(undefined, 'default'), docs(`Show the main content of ${anEntity}`))
            commandTree.listen(`/wsk/${syn}/raw`, switchSidecarMode(undefined, 'raw'), docs('Show the raw JSON record on ${anEntity}'))
            // commandTree.listen('/default', switchSidecarMode(undefined, 'default'))
        })
    })

    return {
        switch: switchSidecarMode
    }
}
