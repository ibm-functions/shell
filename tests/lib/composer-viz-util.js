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

const path = require('path'),
      assert = require('assert'),
      ui = require('./ui'),
      cli = ui.cli,
      sidecar = ui.sidecar,
      badges = require(path.join(__dirname, '../../app/plugins/modules/composer/lib/badges.js'))

/**
 * Helper to find an input file
 *
 */
const input = (file, subdir='.') => ({
    file,
    path: path.join('data', subdir, file)
})
const composerInput = file => input(file, 'composer-source')

/**
 * Verify that a node with the given action name exists on the canvas
 *
 */
const verifyNodeExists = name => app => app.client.elements(`#wskflowSVG .node[data-name="${name}"]`)
      .then(nodes => assert.equal(nodes.value.length, 1))
      .then(() => app)
const verifyNodeExistsById = id => app => {
    return app.client.waitUntil(() => app.client.elements(`#wskflowSVG #${id}`)
                                .then(nodes => nodes.value.length === 1))
        .then(() => app)
}

/**
 * Verify that a edge between the given action names exists on the canvas
 *
 */
const verifyEdgeExists = (from, to) => app => app.client.elements(`#wskflowSVG path[data-from-name="${from}"][data-to-name="${to}"]`)
      .then(edges => assert.equal(edges.value.length, 1))
      .then(() => app)

/**
 * Verify that an outgoing edge, coming from the given from node
 *
 */
const verifyOutgoingEdgeExists = from => app => app.client.elements(`#wskflowSVG path[data-from-name="${from}"]`)
      .then(edges => assert.equal(edges.value.length, 1))
      .then(() => app)

/**
  * Look for any suspicious node labels
  *
  */
const verifyNodeLabelsAreSane = app => app.client.getText(`#wskflowSVG .node text`)
      .then(labels => typeof labels === 'string' ? [labels] : labels)
      .then(labels => labels.forEach(label => assert.ok(label.indexOf('[object Object]') < 0)))
      .then(() => app)

/**
 * Ensure that the basic attributes of the rendered graph are correct
 *
 */
const verifyTheBasicStuff = (file, badge) => _ => Promise.resolve(_)
      .then(cli.expectOK)
      .then(sidecar.expectOpen)
      .then(sidecar.expectShowing(file))
      .then(sidecar.expectBadge(badges[badge]))
      .then(verifyNodeExistsById('Entry'))
      .then(verifyNodeExistsById('Exit'))
      .then(verifyNodeLabelsAreSane)

module.exports = {
    input,
    composerInput,
    verifyNodeExists,
    verifyNodeExistsById,
    verifyEdgeExists,
    verifyOutgoingEdgeExists,
    verifyNodeLabelsAreSane,
    verifyTheBasicStuff
}
