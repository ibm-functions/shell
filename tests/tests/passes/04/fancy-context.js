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
      triggerName = 'ttt'

describe('Test fancier command resolutions', function() {
    before(common.before(this))
    after(common.after(this))

    /** helper method, used in the tests below: switch context */
    const doSwitch = (ctx, expected, nameOnly) => it(`should switch context via ${nameOnly ? '' : 'cd '}${ctx} to ${expected}`, () => cli.do(`${nameOnly ? '' : 'cd '}${ctx}`, this.app)
        .then(cli.expectOKWithCustom({ expect: `Switching context to ${expected}`, exact: true, passthrough: true }))
        .then(N => this.app.client.getHTML(`${ui.selectors.PROMPT_BLOCK_N(N + 1)} .repl-context`))
        .then(actualContext => assert.ok(actualContext.indexOf(expected) >= 0))
        .catch(common.oops(this)))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    it('should create an action', () => cli.do(`let ${actionName} = x=>x`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName)))

    it('should create a trigger', () => cli.do(`trigger update ${triggerName}`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(triggerName)))

    // make sure we can invoke the action with just "async"
    it('should async the action, even from the trigger context', () => cli.do(`async foo -p y 3`, this.app)
	.then(cli.expectJustOK))
    // call await
    it('should await successful completion of the activation', () => cli.do(`$ await`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName))
       .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
       .then(ui.expectStruct({"y":3})))

    // make sure we can invoke the action, again, from the activation context
    it('should async the action again (with implicit entity), even from the activation context', () => cli.do(`async -p xxx 999`, this.app) // <-- implicit entity
	.then(cli.expectJustOK))
    // call await
    it('should await successful completion of the activation', () => cli.do(`$ await`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName))
       .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
       .then(ui.expectStruct({"xxx":999})))

    it('should create another action', () => cli.do(`let ${actionName2} = x=>x`, this.app)
       .then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName2)))

    it('should fire the trigger, even from the action context', () => cli.do(`fire ${triggerName}`, this.app)
       .then(cli.expectOK)
       .catch(common.oops(this)))

    // packaged action
    it('should create a packaged action', () => cli.do(`let ${packageName}/${actionName3} = x=>x`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName3)))
    it('should async the action (with implicit entity)', () => cli.do(`async -p zzz 888`, this.app) // <-- implicit entity
	.then(cli.expectJustOK))
    // call await
    it('should await successful completion of the activation', () => cli.do(`$ await`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName3))
       .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
       .then(ui.expectStruct({'zzz':888})))
    // make sure we can do an implicit-entity re-invoke with an activation selection
    it('should async the action (with implicit entity, from activations selection)', () => cli.do(`async -p mmm 777`, this.app) // <-- implicit entity
	.then(cli.expectJustOK))
    // call await
    it('should await successful completion of the activation', () => cli.do(`$ await`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName3))
       .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
       .then(ui.expectStruct({'mmm':777})))


    sidecar.close(this)
    // test other commands in a variety of contexts
    const commands = ['$ ls','$$']
    commands.forEach(cmd => {
        ['/wsk/actions', '/wsk/app'].forEach(ctx => {
            doSwitch(ctx, ctx)

            it(`should call ${cmd} from the ${ctx} context`, () => cli.do(cmd, this.app)
	        .then(cli.expectJustOK))
        })
    })
})
