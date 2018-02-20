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

    /** node visitor */
    const visit = (node, idx=0, path='') => {
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
        node.id = `${path}task_${idx}_${node.type}`     // the node id is the path to this node from the root
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
