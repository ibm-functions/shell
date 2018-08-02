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
      actionName = 'foo',
      actionName2 = 'foo2',
      actionName3 = 'foo3',
      packageName = 'ppp',
      triggerName = 'ttt',
      ruleName = `on_${triggerName}_do_${actionName}`

describe('Click on current selection part of repl prompt', function() {
    // test disabled
    return

    before(common.before(this))
    after(common.after(this))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    /** helper method, used in the tests below: switch context */
    const doSwitch = (ctx, expected, nameOnly) => sidecar.doClose(this.app)
          .then(() => cli.do(`${nameOnly ? '' : 'cd '}${ctx}`, this.app))
          .then(cli.expectOKWithCustom({ expect: `Switching context to ${expected}`, exact: true, passthrough: true }))
          .then(N => this.app.client.getText(`${ui.selectors.PROMPT_BLOCK_N(N + 1)} .repl-context`))
          .then(text => assert.equal(text, expected))

    const doCreateXSwitchCreateFooAndClickToSwitchBackToX = (createCmd, name, ctx) => {
        it(`create switch create click on ${name} and ${ctx}`, () => cli.do(createCmd, this.app)
	    .then(cli.expectOKWithCustom({passthrough: true}))
           .then(N => doSwitch(ctx, ctx)
                 .then(() => cli.do(`wsk action update ${name}-foo ./data/foo.js`, this.app))
                 .then(cli.expectJustOK)
                 .then(sidecar.expectOpen)
                 .then(sidecar.expectShowing(`${name}-foo`))
                 .then(() => this.app.client.click(`${ui.selectors.PROMPT_BLOCK_N(N + 1)} .repl-selection`)))
           .then(() => this.app)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(name))
           .catch(common.oops(this)))
    }

    doCreateXSwitchCreateFooAndClickToSwitchBackToX(`let ${actionName} = x=>x`, actionName, '/wsk/activations')
    doCreateXSwitchCreateFooAndClickToSwitchBackToX(`let ${actionName2} = x=>x`, actionName2, '/bluemix')
    //doCreateXSwitchCreateFooAndClickToSwitchBackToX(`let ${actionName3} = x=>x`, actionName3, '/updater')
    doCreateXSwitchCreateFooAndClickToSwitchBackToX(`wsk package update ${packageName}`, packageName, '/wsk')
    doCreateXSwitchCreateFooAndClickToSwitchBackToX(`on ${triggerName} do ${actionName}`, ruleName, '/wsk/triggers')
})
