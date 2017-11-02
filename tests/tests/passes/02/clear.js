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
// read-only tests against the cli's list APIs
//
const common = require('../../../lib/common'),
      openwhisk = require('../../../lib/openwhisk'),
      assert = require('assert'),
      ui = require('../../../lib/ui'),
      cli = ui.cli

const expectConsoleToBeClear = app => {
    return app.client.waitUntil(() => {
        return app.client.elements('#main-repl .repl-block')
            .then(elements => elements.value.length === 1)
    })
}

describe('Clear the console', () => {
    before(common.before(this))
    after(common.after(this))

    /** helper method, used in the tests below: switch context */
    const doSwitch = (ctx, expected, nameOnly) => it(`should switch context via ${nameOnly ? '' : 'cd '}${ctx} to ${expected}`, () => cli.do(`${nameOnly ? '' : 'cd '}${ctx}`, this.app)
        .then(cli.expectOKWithCustom({ expect: `Switching context to ${expected}`, exact: true, passthrough: true }))
        .then(N => this.app.client.getHTML(`${ui.selectors.PROMPT_BLOCK_N(N + 1)} .repl-context`))
        .then(actualContext => assert.ok(actualContext.indexOf(expected) >= 0))
        .catch(common.oops(this)))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    // get something on the screen
    it(`should list actions`, () => cli.do('action ls', this.app).then(cli.expectJustOK))
    
    doSwitch('/wsk/activations', '/wsk/activations')
    
    it('should clear the console', () => cli.do('clear', this.app)
        .then(() => expectConsoleToBeClear(this.app)))

    doSwitch('/wsk/actions', '/wsk/actions')

    /*it('should click to change back to /wsk/activations', () => this.app.client.getAttribute(ui.selectors.CURRENT_PROMPT_BLOCK, 'data-input-count')
       .then(N => parseInt(N))
       .then(N => this.app.client.click(`${ui.selectors.PROMPT_BLOCK_N(N - 1)} .repl-context`).then(() => N))
       .then(N => ({ app: this.app, count: N }))
       .then(cli.expectContext('/wsk/activations')))*/
})
