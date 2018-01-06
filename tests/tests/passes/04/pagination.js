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

const common = require('../../../lib/common'),
      openwhisk = require('../../../lib/openwhisk'),
      ui = require('../../../lib/ui'),
      assert = require('assert'),
      keys = ui.keys,
      cli = ui.cli,
      sidecar = ui.sidecar,
      actionName = 'paginator-test'

describe('Activation list paginator', function() {
    before(common.before(this))
    after(common.after(this), () => cli.do(`wsk rule rm ${ruleName}`))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    // create an action, using the implicit entity type
    it('should create an action', () => cli.do(`create ${actionName} ./data/foo.js`, this.app)
       .then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName)))

    // create an action, using the implicit entity type
    for (let idx = 0; idx < 10; idx++) {
        it('should invoke it', () => cli.do(`invoke`, this.app)
	   .then(cli.expectJustOK)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(actionName)))
    }

    // wait until activation list shows our activations
    it(`should find the new action with "$ ls"`, () => this.app.client.waitUntil(() => {
        return cli.do(`$ ls`, this.app).then(cli.expectOKWith(actionName))
    }))

    // now try paging
    const limit = 5
    it('list activations', () => cli.do(`$ ls --limit ${limit}`, this.app)
       .then(cli.expectJustOK)
       .then(() => this.app.client.elements(`repl .repl-block:nth-last-child(2) .log-line`))
       .then(rows => assert.equal(rows.value.length, limit))
       .then(() => this.app.client.getText(`repl .repl-block:nth-last-child(2) .list-paginator-description`))
       .then(paginatorText => assert.equal(paginatorText, `Showing 1\u2013${limit}`))

       // click next button
       .then(() => this.app.client.click(`repl .repl-block:nth-last-child(2) .list-paginator-button-next`))
       .then(() => this.app.client.waitUntil(() => {
           return this.app.client.getText(`repl .repl-block:nth-last-child(2) .list-paginator-description`)
               .then(paginatorText => paginatorText === `Showing ${limit + 1}\u2013${limit + limit}`)
       }))
                     
       // click prev button
       .then(() => this.app.client.click(`repl .repl-block:nth-last-child(2) .list-paginator-button-prev`))
       .then(() => this.app.client.waitUntil(() => {
           return this.app.client.getText(`repl .repl-block:nth-last-child(2) .list-paginator-description`)
               .then(paginatorText => paginatorText === `Showing 1\u2013${limit}`)
       }))

       .catch(common.oops(this)))
})
