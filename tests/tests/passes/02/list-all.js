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
      packageName = 'ppp',
      triggerName = 'ttt',
      actionNameInPackage = `${packageName}/${actionName}`
      ruleName = `on_${triggerName}_do_${actionNameInPackage.replace(/\//g, '_')}`

describe('List all entities', () => {
    before(common.before(this))
    after(common.after(this), () => cli.do(`wsk rule rm ${ruleName}`))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    // create action
    it('should create a packaged action', () => cli.do(`let ${actionNameInPackage} = x=>x`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName)))

    // create rule (and trigger)
    it('should create a rule', () => cli.do(`on ${triggerName} do ${packageName}/${actionName}`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(ruleName)))

    // list them all
    it('should list them all', () => cli.do('wsk list', this.app).then(cli.expectOKWith(actionName)))
    it('should list them all', () => cli.do('wsk list', this.app).then(cli.expectOKWith(triggerName)))
    it('should list them all', () => cli.do('wsk list', this.app).then(cli.expectOKWith(ruleName)))
    it('should list them all', () => cli.do('wsk list', this.app).then(cli.expectOKWith(packageName)))
})
