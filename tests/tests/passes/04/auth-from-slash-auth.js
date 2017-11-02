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
const common = require('../../../lib/common'),
      openwhisk = require('../../../lib/openwhisk'),
      ui = require('../../../lib/ui'),
      assert = require('assert'),
      keys = ui.keys,
      cli = ui.cli,
      sidecar = ui.sidecar

describe('auth tests executed from /auth', function() {
    before(common.before(this))
    after(common.after(this))

    /** helper method, used in the tests below: switch context */
    const doSwitch = (ctx, expected, nameOnly) => it(`should switch context via ${nameOnly ? '' : 'cd '}${ctx} to ${expected}`, () => cli.do(`${nameOnly ? '' : 'cd '}${ctx}`, this.app)
        .then(cli.expectOKWithCustom({ expect: `Switching context to ${expected}`, exact: true, passthrough: true }))
        .then(N => this.app.client.getHTML(`${ui.selectors.PROMPT_BLOCK_N(N + 1)} .repl-context`))
        .then(actualContext => assert.ok(actualContext.indexOf(expected) >= 0))
        .catch(common.oops(this)))

    const ns1 = ui.expectedNamespace(),
          ns2 = ui.expectedNamespace(process.env.TEST_SPACE2)

    it('should have an active repl', () => cli.waitForRepl(this.app))

    // create an action, using the implicit entity type
    it('should create an action foo', () => cli.do(`create foo ./data/foo.js`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing('foo')))

    // list should show only foo
    it(`should find the foo action with "ls"`, () => cli.do('ls', this.app).then(cli.expectOKWithOnly('foo')))

    sidecar.close(this)
    doSwitch('/auth', '/auth')

    it('should handle add with bogus auth key', () => cli.do('add xxx', this.app)
        .then(cli.expectError(401, 'The supplied authentication key was not recognized')))

    // install namespace key
    it('should install a namespace key', () => cli.do(`add ${process.env.AUTH2}`, this.app)
	.then(cli.expectOKWithCustom({selector: '', expect: `You are now using the OpenWhisk namespace ${ns2}` })))

    doSwitch('/wsk/actions', '/wsk/actions')

    // list should show no actions
    it(`should NOT find the foo action with "ls"`, () => cli.do('ls', this.app).then(cli.expectJustOK))

    // create the second action
    it('should create an action foo2', () => cli.do(`create foo2 ./data/foo.js`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing('foo2')))

    // list should show only foo2
    it(`should find the foo2 action with "ls"`, () => cli.do('ls', this.app).then(cli.expectOKWithOnly('foo2')))

    // switch back to first namespace
    it('should switch to the first namespace, using the CLI auth add command', () => cli.do(`auth add ${process.env.AUTH}`, this.app)
	.then(cli.expectOKWithCustom({selector: '', expect: `You are now using the OpenWhisk namespace ${ns1}` })))
})
