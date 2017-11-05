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
// read-only tests against the cli's help APIs
//
const common = require('../../../lib/common'),
      openwhisk = require('../../../lib/openwhisk'),
      assert = require('assert'),
      ui = require('../../../lib/ui'),
      cli = ui.cli,
      sidecar = ui.sidecar

const expectConsoleToBeClear = app => {
    return app.client.elements('#main-repl .repl-block')
        .then(elements => assert.equal(elements.value.length, 1))
}

describe('Help', function() {
    return
    before(common.before(this))
    after(common.after(this))

    /** helper method, used in the tests below: ask for help */
    const doCmd = cmd => (expect, expectErr) => {
        return it(`should show ${cmd} for ${expect} in current context`, () => cli.do(cmd, this.app)
            .then(cli.expectOKWithCustom({
                selector: '.help-options .help-option .help-option-left-column',
                expect: expect
            })).catch(err => {
                if (expectErr) return // the caller told us this was ok!
                else throw err
            }))
    }
    const doHelp = doCmd('help -a')
    const doLs = doCmd('help -f')

    /** helper method, used in the tests below: switch context */
    const doSwitch = (ctx, expected) => it(`should switch context via cd ${ctx} to ${expected}`, () => cli.do(`cd ${ctx}`, this.app)
        .then(cli.expectOKWithCustom({ expect: `Switching context to ${expected}`, exact: true, passthrough: true }))
        .then(N => this.app.client.getHTML(`${ui.selectors.PROMPT_BLOCK_N(N)} .repl-context`))
        .catch(common.oops(this)))
    
    //
    // and now here come the tests...
    //
    it('should have an active repl', () => cli.waitForRepl(this.app))

    // help in default context
    doHelp('get')
    doHelp('let')
    doHelp('list')

    doSwitch('..', '/wsk')
    doHelp('every')
    doHelp('on')
    doLs('actions/')
    doLs('triggers/')

    doSwitch('packages', '/wsk/packages')
    doHelp('bind')

    doSwitch('..', '/wsk')
    doSwitch('..', '/')
    doHelp('quit')
    doHelp('history/')
    doLs('wsk/')
    //doLs('welcome/')

    // now try clicking on a help result; we should be in the root context now, so try
    // clicking on `wsk`, which should `cd /wsk`
    it('should have cd-clickable help in current context', () => cli.do('help --all', this.app)
        .then(cli.expectOKWithCustom({ passthrough: true })) // pass through the index
       .then(N => this.app.client.click(`${ui.selectors.OUTPUT_N(N)} .clickable[data-help-clickable-command="wsk"]`).then(() => N))
       .then(N => ({ app: this.app, count: N + 1 })) // finally, we'll look at output the click (N+1, because N is the output of ls)
       .then(cli.expectOKWithCustom({ expect: 'Switching context to /wsk', exact: true, passthrough: true }))

       // now try clicking on some other directory from the *first* ls result
       .then(Nplus1 => Nplus1 - 1) // Nplus1 is the output of the click, we want the output of the ls
       .then(N => this.app.client.click(`${ui.selectors.OUTPUT_N(N)} .clickable[data-help-clickable-command="auth"]`).then(() => N))
       .then(N => ({ app: this.app, count: N + 2 })) // finally, we'll look at output the click (N+2, because N+1 is the output of the first click)
       .then(cli.expectOKWithCustom({ expect: 'Switching context to /auth', exact: true }))
       .catch(common.oops(this)))


    // now try clicking on a help result; we should be in the root context now, so try
    // clicking on `run` which should paste a partial command
    doSwitch('..', '/')
    it('should have partial clickable help in current context', () => cli.do('help --full', this.app)
        .then(cli.expectOKWithCustom({ passthrough: true })) // pass through the index
       .then(N => this.app.client.click(`${ui.selectors.OUTPUT_N(N)} .clickable[data-help-clickable-command="run"]`).then(() => N))
       .then(N => this.app.client.getValue(ui.selectors.PROMPT_N(N+1)))
       .then(text => assert.equal(text, 'run '))
       .then(() => this.app.client.setValue(ui.selectors.CURRENT_PROMPT, '')) // clear the current prompt
       .catch(common.oops(this)))

    
    //
    // now test help commands that require a selection
    //

    doSwitch('/wsk/actions', '/wsk/actions')
    it('should create an action via let without extension', () => cli.do(`let foo = x=>x`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing('foo')))
    doHelp('annotations')
    doHelp('code')
    doHelp('parameters')
    doHelp('append')

    it('should create a sequence', () => cli.do(`let seq = x=>x -> x=>x`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing('seq')))
    doHelp('annotations')
    doHelp('append')
    doHelp('code', true) // true means exceptError: we expect NOT to find this in the help list, since we've selected a sequence, not an action
})
