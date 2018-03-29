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
      triggerName = 'ttt'


describe('Change contexts via cd', function() {
    before(common.before(this))
    after(common.after(this))

    /** helper method, used to test error handling */
    const bogusSwitch = (bogusCtx, nameOnly) => it(`should not switch to bogus context ${bogusCtx}`, () => cli.do(`${nameOnly ? '' : 'cd '}${bogusCtx}`, this.app)
        .then(cli.expectError(0, nameOnly ? 'Command not found' : 'No such context'))
        .catch(common.oops(this)))

    /** helper method, used in the tests below: switch context */
    const doSwitch = (ctx, expectedContext, nameOnly, expectedSelection) => it(`should switch context via ${nameOnly ? '' : 'cd '}${ctx} to ${expectedContext}`, () => cli.do(`${nameOnly ? '' : 'cd '}${ctx}`, this.app)
        .then(cli.expectOKWithCustom({ expect: `Switching context to ${expectedContext}`, exact: true, passthrough: true }))
        .then(N => this.app.client.waitUntil(() => this.app.client.getHTML(`${ui.selectors.PROMPT_BLOCK_N(N + 1)} .repl-context`)
                                             .then(actualContext => {
                                                 if (expectedSelection) {
                                                     return this.app.client.getHTML(`${ui.selectors.PROMPT_BLOCK_N(N + 1)} .repl-selection`)
                                                         .then(actualSelection => actualSelection.indexOf(expectedSelection) >= 0
                                                               && actualContext.indexOf(expectedContext) >= 0)
                                                 } else {
                                                     return actualContext.indexOf(expectedContext) >= 0
                                                 }
                                             })))
        .catch(common.oops(this)))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    bogusSwitch('ffjdsjfioasdfjioasfjioads')
        
    doSwitch('.', '/wsk/actions')
    doSwitch('/wsk/actions', '/wsk/actions')
    doSwitch('..', '/wsk')
    doSwitch('./actions', '/wsk/actions')
    doSwitch('..', '/wsk')
    //doSwitch('..', '/')
    doSwitch('/wsk/triggers', '/wsk/triggers')

    bogusSwitch('/')                            // disallow switching to /
    bogusSwitch('/history')                     // disallow switching to /history, as it is a command handler not a subtree

    doSwitch('/wsk/action', '/wsk/actions')    // test that we switch to /wsk/actions, even when asking to change to /wsk/action
    bogusSwitch('actions')                     // type 'actions' while in /wsk/actions, and expect error
    doSwitch('/wsk/trigger', '/wsk/triggers')  // test that we switch to /wsk/triggers, even when asking to change to /wsk/trigger

    it('should create an trigger via a relative path', () => cli.do(`create ${triggerName}`, this.app)
       .then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(triggerName))
       .catch(common.oops(this)))

    it('should fire the trigger via a relative path', () => cli.do(`fire ${triggerName}`, this.app)
	.then(cli.expectJustOK)
       .catch(common.oops(this)))

    sidecar.close(this)
    doSwitch('../actions/../rules', '/wsk/rules', undefined, triggerName) // triggerName had better still be selected
    doSwitch('/wsk/packages/../actions/../rules/../actions', '/wsk/actions', undefined, triggerName) // triggerName had better still be selected

    it('should create an action via let with extension', () => cli.do(`let ${actionName}.js = x=>({y:x.y})`, this.app)
       .then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName))
       .catch(common.oops(this)))

    sidecar.close(this)
    bogusSwitch('../../')  // this would cd us to /, which is disallowed
    //doSwitch('../../', '/', undefined, actionName) // actionName had better still be selected
    // doSwitch('wsk/rules', '/wsk/rules', undefined, actionName) // actionName had better still be selected
    //doSwitch('../..', '/', undefined, actionName) // actionName had better still be selected

    bogusSwitch('ffjdsjfioas990890890890')

    doSwitch('/wsk/triggers', '/wsk/triggers', undefined, actionName) // actionName had better still be selected
    //doSwitch('../rules/../../project', '/project')

    // switch to "home directory"
    doSwitch('', '/wsk/actions', undefined, actionName) // actionName had better still be selected

    bogusSwitch('ffjdsjfioas99089089089fds8f90ads8f90ads0')

    // test for "name only" switches, i.e. typing "actions" rather than "cd actions"
    doSwitch('..', '/wsk', undefined, actionName) // actionName had better still be selected
    doSwitch('actions', '/wsk/actions', undefined, actionName) // actionName had better still be selected
    doSwitch('..', '/wsk', undefined, actionName) // actionName had better still be selected
    //doSwitch('..', '/', undefined, actionName) // actionName had better still be selected
    // doSwitch('wsk', '/wsk', undefined, actionName) // actionName had better still be selected
    bogusSwitch('ufdufdasufdsa', undefined, actionName) // actionName had better still be selected
})
