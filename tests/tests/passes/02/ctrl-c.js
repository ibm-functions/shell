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
      delay = 3000,
      actionName = 'foo',
      actionName2 = 'foo2',
      packageName = 'ppp',
      seqName = 'sss'

describe('Cancel via Ctrl+C', () => {
    before(common.before(this))
    after(common.after(this), () => cli.do(`wsk rule rm ${ruleName}`))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    const cancel = (app, cmd='') => app.client.waitForExist(ui.selectors.CURRENT_PROMPT_BLOCK)
          .then(() => app.client.getAttribute(ui.selectors.CURRENT_PROMPT_BLOCK, 'data-input-count'))
          .then(count => parseInt(count))
	  .then(count => app.client.keys(cmd)
                .then(() => app.client.execute('repl.doCancel()'))
	        .then(() => ({ app: app, count: count}))
                .then(cli.expectBlank)
                .then(() => app.client.getValue(ui.selectors.PROMPT_N(count))) // make sure the cancelled command text is still there, in the previous block
                .then(input => assert.equal(input, cmd)))
          .catch(common.oops(this))

    it('should hit ctrl+c', () => cancel(this.app))
    it('should type foo and hit ctrl+c', () => cancel(this.app, 'foo'))

    // note that this action resolves with its input parameter; we'll check this in the await step below
    it('should create an action that completes with some delay', () => cli.do(`let ${actionName} = x=> new Promise((resolve, reject) => setTimeout(() => resolve(x), ${delay}))`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName)))

    it('should invoke the long-running action, then cancel', () => cli.do(`invoke -p name openwhisk`, this.app)
        .then(appAndCount => this.app.client.execute('repl.doCancel()').then(() => appAndCount))
       .then(cli.expectBlank)
       .catch(common.oops(this)))

    // checking the resolve(x)
    it('should await the long-running action', () => cli.do(`await`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName))
       .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
       .then(ui.expectStruct({
           name: 'openwhisk'
       }))
       .catch(common.oops(this)))
})
