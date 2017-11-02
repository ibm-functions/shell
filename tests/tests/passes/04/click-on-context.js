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
      cli = ui.cli

describe('Test fancier command resolutions', () => {
    // test disabled
    return

    before(common.before(this))
    after(common.after(this))

    /** helper method, used in the tests below: switch context */
    const doSwitchAndClickBack = (ctx, expected) => it(`should switch context via cd ${ctx} to ${expected}`, () => this.app.client.getText(ui.selectors.CURRENT_PROMPT_BLOCK)
        .then(currentContextString => currentContextString.replace(/^\[/,'').replace(/\]/,'').replace(/\n/g,''))
        .then(currentContext => cli.do(`cd ${ctx}`, this.app)
            .then(cli.expectOKWithCustom({ expect: `Switching context to ${expected}`, exact: true, passthrough: true }))
              .then(N => this.app.client.click(`${ui.selectors.PROMPT_BLOCK_N(N)} .repl-context`)
                    .then(() => cli.expectOKWithCustom({ expect: `Switching context to ${currentContext}`, exact: true, passthrough: true })({app: this.app, count: N + 1})))
              .then(N => this.app.client.getText(`${ui.selectors.PROMPT_BLOCK_N(N + 1)} .repl-context`))
              .then(text => assert.equal(text, currentContext)))
        .catch(common.oops(this)))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    // we'll start in /wsk/actions
    doSwitchAndClickBack('/wsk/activations', '/wsk/activations') // we should be back in /wsk/actions
    doSwitchAndClickBack('..', '/wsk')                           // we should be back in /wsk/actions
    doSwitchAndClickBack('/bluemix', '/bluemix')                 // we should be back in /wsk/actions
    doSwitchAndClickBack('../..', '/')                           // we should be back in /wsk/actions
})
