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
      triggerName = 'ttt',
      triggerName2 = 'ttt2',
      ruleName = `on_${triggerName}_do_${actionName}`

describe('Preflight blockers', function() {
    before(common.before(this))
    after(common.after(this))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    it('should create a trigger', () => cli.do(`wsk trigger update ${triggerName}`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(triggerName))
       .catch(common.oops(this)))

    it('should create an action via let', () => cli.do(`let ${actionName} = x=>x`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName))
       .catch(common.oops(this)))

    it('should enable the demo preflight', () => cli.do(`preflight demo`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName))
       .catch(common.oops(this)))

    it('should fail to create an action', () => cli.do(`let ${actionName2} = x=>x`, this.app)
	.then(cli.expectError(500, 'Operation failed preflight checks: This is a demo of the validator, it blocks all update operations'))
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName))
       .catch(common.oops(this)))

    it('should fail to create a trigger', () => cli.do(`wsk trigger update ${triggerName2}`, this.app)
	.then(cli.expectError(500, 'Operation failed preflight checks: This is a demo of the validator, it blocks all update operations'))
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName))
       .catch(common.oops(this)))

    it('should fail to create a rule via on, from existing trigger and action', () => cli.do(`on ${triggerName} do ${actionName}`, this.app)
	.then(cli.expectError(500, 'Operation failed preflight checks: This is a demo of the validator, it blocks all update operations'))
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName))
       .catch(common.oops(this)))

    it('should disable preflight', () => cli.do(`preflight off`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName))
       .catch(common.oops(this)))

    it('should now create an action', () => cli.do(`let ${actionName2} = x=>x`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName2))
       .catch(common.oops(this)))

    it('should re-enable preflight', () => cli.do(`preflight on`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName2))
       .catch(common.oops(this)))

    it('should fail to create an action', () => cli.do(`let ${actionName3} = x=>x`, this.app)
	.then(cli.expectError(500, 'Operation failed preflight checks: This is a demo of the validator, it blocks all update operations'))
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName2))
       .catch(common.oops(this)))
})
