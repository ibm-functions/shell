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
      sidecar = ui.sidecar,
      actionName = 'foo',
      actionName2 = 'foo3'

// synonyms for append and prepend
const appends = ['append', 'then', '+=', '->' ],
      prepends = ['prepend', 'unshift' ]

/** Turn an list of strings into a map */
const toMap = L => L.reduce((M, elt) => { M[elt] = true; return M }, {})

describe('Append to a sequence', function() {
    before(common.before(this))
    after(common.after(this), () => cli.do(`wsk rule rm ${ruleName}`))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    it('should create an action', () => cli.do(`create ${actionName2} ./data/foo.js`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName2)))

    it('should create another action', () => cli.do(`create ${actionName} ./data/foo.js`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName)))

    const funcs = [ `_${actionName}` ] // what we expect to find in the sequence
    const push = (func, pushFn = 'push') => app => {
        funcs[pushFn](func)
        return app
    }
    const unshift = func => app => push(func, 'unshift')(app)
    
    appends.forEach((syn, idx) => {
        const func = `a${idx}=>a${idx}`

        it(`append via "${syn}" with implicit action and inline function`, () => cli.do(`${syn} ${func}`, this.app)
	    .then(cli.expectJustOK)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(actionName))
           .then(push(func))
           .then(sidecar.expectSequence(funcs))
           .catch(common.oops(this)))
    })

    prepends.forEach((syn, idx) => {
        const func = `p${idx}=>p${idx}`

        it(`prepend via "${syn}" with implicit action and inline function`, () => cli.do(`${syn} ${func}`, this.app)
            .then(cli.expectJustOK)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(actionName))
           .then(unshift(func))
           .then(sidecar.expectSequence(funcs))
           .catch(common.oops(this)))
    })

    {
        let func = actionName2
        it(`append via "append" with implicit action and named action`, () => cli.do(`append ${actionName2}`, this.app)
	    .then(cli.expectJustOK)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(actionName))
           .then(push(func))
           .then(sidecar.expectSequence(funcs))
           .catch(common.oops(this)))
    }

    {
        let func = 'foo2.js'
        it(`append via "append" with implicit action and file action`, () => cli.do(`append ./data/${func}`, this.app)
	    .then(cli.expectJustOK)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(actionName))
           .then(push(`${func}-anon`))
           .then(sidecar.expectSequence(funcs))
           .catch(common.oops(this)))
    }

    it(`switch to view ${actionName2}`, () => cli.do(`get ${actionName2}`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName2))
       .catch(common.oops(this)))
       
    {
        let func = 'y=>y'
        it(`append via "append" with explicit action and file action`, () => cli.do(`append ${func} to ${actionName}`, this.app)
	    .then(cli.expectJustOK)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(actionName))
           .then(push(func))
           .then(sidecar.expectSequence(funcs))
           .catch(common.oops(this)))
    }

    it('should async the sequence', () => cli.do(`async ${actionName} -p name openwhisk`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName))
       .catch(common.oops(this)))

    it('should await the result', () => cli.do(`$ await`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName))
       .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_ID))
       .then(ui.expectValidActivationId)
       .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
       .then(ui.expectStruct({"name":"Step2 Step1 Step1 openwhisk"}))
       .catch(common.oops(this)))
})
