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
// similar to action.js in this directory, except testing contextualized invocation
//
const common = require('../../../../lib/common'),
      openwhisk = require('../../../../lib/openwhisk'),
      ui = require('../../../../lib/ui'),
      assert = require('assert'),
      keys = ui.keys,
      cli = ui.cli,
      sidecar = ui.sidecar

describe('Create an actions, switch to parameters view, then add parameters with fancy context', () => {
    before(common.before(this))
    after(common.after(this))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    // create an action, using the implicit entity type
    it('should create an action', () => cli.do(`create foo ./data/foo.js`, this.app)
        .then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing('foo')))

    it('should switch to parameters mode', () => cli.do('parameters', this.app)
        .then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing('foo'))
       .then(app => app.client.getText(`${ui.selectors.SIDECAR_CONTENT} .action-source`))
       .then(text => assert.equal(text, 'This action has no parameters')))

    /** add a parameter via cmd, and expect the given parameters at the end */
    const doAdd = (cmd, expect) => {
        return it(`should add a parameter with ${cmd}`, () => cli.do(cmd, this.app)
            .then(cli.expectJustOK)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing('foo'))
           .then(app => app.client.getText(`${ui.selectors.SIDECAR_CONTENT} .action-source`))
           .then(text => assert.equal(text.replace(/\s+/g,''), expect)))
    }

    /** switch context */
    const doSwitch = (ctx, expected) => it(`should switch context via cd ${ctx} to ${expected}`, () => cli.do(`cd ${ctx}`, this.app)
        .then(cli.expectOKWithCustom({ expect: `Switching context to ${expected}`, exact: true, passthrough: true }))
        .then(N => this.app.client.getHTML(`${ui.selectors.PROMPT_BLOCK_N(N)} .repl-context`))
        .catch(common.oops(this)))

    // set
    doAdd('set x=1', '{"x":1}')
    doAdd('wsk action set x=2', '{"x":2}')
    doAdd('wsk action set y={"z":3}', '{"x":2,"y":{"z":3}}')
    doAdd('wsk action set y.yy=4', '{"x":2,"y":{"z":3,"yy":4}}')

    // unset
    doAdd('unset y.yy', '{"x":2,"y":{"z":3}}')
    doAdd('wsk action unset y', '{"x":2}')

    doSwitch('..', '/wsk')
    doAdd('action set x=6', '{"x":6}')
    doAdd('wsk action set x=7', '{"x":7}')

    doSwitch('..', '/')
    doAdd('wsk action set x=8', '{"x":8}')
})
