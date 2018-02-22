/*
 * Copyright 2018 IBM Corporation
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

const util = require('util')

/**
 * Add a unique `id` field to every node, and a Next field. This turns
 * a Composition into something more FSM-like.
 *
 */
module.exports = app => {
    app.States = {}

    /**
     * Node Visitor
     * 
     * !! Important Note on path encodings !!
     *
     * the fsm_ part must align with the path encoding
     * scheme used by the conductor, and manifested in the logs;
     * e.g. "Entering state x at path fsm[0].test[0]"
     *
     * Since our node ids must be CSS selector compliant, we can't use
     * brackets or dots; we represent [0] with _0, and the dot with __
     * e.g. fsm[0].test[0] as it appears in the logs will become
     * fsm_0__test_0 in our encoding scheme here.
     * 
     * This close alignment of the two facilitates mapping the trace
     * of activations to the FSM graphical representation.
     *
     */
    const visit = (node, idx=0, path='fsm_') => {
        if (util.isArray(node)) {
            // then node is a sequence
            return node.reduce((prev, node, idx, A) => {
                visit(node, idx, path)
                if (prev) {
                    // Next for sequences
                    prev.Next = node.id
                }

                return node
            }, undefined)
        }

        // otherwise node is a structure, e.g. if, try, etc.
        //node.id = `${path}fsm_${idx}_${node.type}`     // the node id is the path to this node from the root
        node.id = `${path}${idx}`     // the node id is the path to this node from the root
        app.States[node.id] = node

        for (let key in node) {
            const child = node[key]
            if (util.isArray(child) || (typeof child === 'object' && child.type)) {
                const childNode = visit(child, 0, `${node.id}__${key}_`)
            }
        }
    }

    // start the traversal at the root
    visit(app.composition)

    return app
}
