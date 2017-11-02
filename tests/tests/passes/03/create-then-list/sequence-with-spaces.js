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

//
// tests that create an action and test that it shows up in the list UI
//    this test also covers toggling the sidecar
//
const common = require('../../../../lib/common'),
      openwhisk = require('../../../../lib/openwhisk'),
      ui = require('../../../../lib/ui'),
      keys = ui.keys,
      cli = ui.cli,
      sidecar = ui.sidecar,
      actionName1 = 'foo bar',
      actionName2 = 'bam',
      sequenceName1 = 'sss'

describe('Create a sequence with whitespacey names', function() {
    before(common.before(this))
    after(common.after(this))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    // create an action, using the implicit entity type
    it('should create an action', () => cli.do(`create "${actionName1}" ./data/foo.js`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName1)))

    // create the second action
    it('should create an action', () => cli.do(`create ${actionName2} ./data/foo2.js`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName2)))

    it(`should show ${actionName1} by clicking on the result of "ls"`, () => cli.do('ls', this.app)
        .then(cli.expectOKWithCustom({ passthrough: true }))
       .then(N => this.app.client.click(ui.selectors.LIST_RESULT_BY_N_AND_NAME(N, actionName1)))
       .then(() => this.app)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName1)))

    // create a sequence
    it('should create a sequence', () => cli.do(`create ${sequenceName1} --sequence "${actionName1},${actionName2}"`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(sequenceName1)))

    // click on a sequence component bubble
    it('should show action after clicking on bubble', () => this.app.client.click(ui.selectors.SIDECAR_SEQUENCE_CANVAS_NODE_N(0))
       .then(() => sidecar.expectOpen(this.app))
       .then(sidecar.expectShowing(actionName1)))
})
