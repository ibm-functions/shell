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

describe('host tests', function() {
    before(common.before(this))
    after(common.after(this))

    /** helper method, used in the tests below: switch context */
    const doSwitch = (ctx, expected, nameOnly) => it(`should switch context via ${nameOnly ? '' : 'cd '}${ctx} to ${expected}`, () => cli.do(`${nameOnly ? '' : 'cd '}${ctx}`, this.app)
        .then(cli.expectOKWithCustom({ expect: `Switching context to ${expected}`, exact: true, passthrough: true }))
        .then(N => this.app.client.getHTML(`${ui.selectors.PROMPT_BLOCK_N(N + 1)} .repl-context`))
        .then(actualContext => assert.ok(actualContext.indexOf(expected) >= 0))
        .catch(common.oops(this)))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    it('should command not found on hosts set', () => cli.do('hosts set', this.app)
       .then(cli.expectError(0, 'Command not found'))
       .catch(common.oops(this)))

    it('bogus host from default context', () => cli.do(`host set xxx`, this.app)
	.then(cli.expectOKWithCustom({selector: '', expect: `Before you can proceed, please provide an OpenWhisk auth key, using auth add <AUTH_KEY>` })))

    doSwitch('/host', '/host')

    it('bogus host from /host context', () => cli.do(`set yyy`, this.app)
	.then(cli.expectOKWithCustom({selector: '', expect: `Before you can proceed, please provide an OpenWhisk auth key, using auth add <AUTH_KEY>` })))

    // clicking on the host in the upper right prefills some content;
    // if the user hits return, we want the operation to be cancelled
    // see shell issue #192
    it('should auto-cancel when using prefilled content', () => cli.do(`host set <your_api_host>`, this.app)
       .then(cli.expectError(0, 'Operation cancelled')))
})
