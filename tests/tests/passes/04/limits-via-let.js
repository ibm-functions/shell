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
      actionName1 = 'foo1',
      actionName2 = 'foo2',
      actionName3 = 'foo3',
      actionName4 = 'foo4',
      actionName5 = 'foo5',
      actionName6 = 'foo6',
      actionName7 = 'foo7',
      actionName8 = 'foo8',
      actionName9 = 'foo9'

describe('Create an action with limits, using let', () => {
    before(common.before(this))
    after(common.after(this), () => cli.do(`wsk rule rm ${ruleName}`))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    it('should create an action with -m 129', () => cli.do(`let ${actionName1} = data/foo.js -m 129`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName1))
       .then(sidecar.expectLimit('memory', 129))//'129 MB'))
       .catch(common.oops(this)))

    it('should create an action with --memory 131', () => cli.do(`let ${actionName2} = data/foo.js --memory 131`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName2))
       .then(sidecar.expectLimit('memory', 131))//'131 MB'))
       .catch(common.oops(this)))

    it('should create an action with -t 1000', () => cli.do(`let ${actionName3} = data/foo.js -t 1000`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName3))
       .then(sidecar.expectLimit('timeout', 1000))//'1 sec'))
       .catch(common.oops(this)))

    it('should create an action with --timeout 2000', () => cli.do(`let ${actionName4} = data/foo.js --timeout 2000`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName4))
       .then(sidecar.expectLimit('timeout', 2000))//'2 sec'))
       .catch(common.oops(this)))

    it('should create an action with --timeout 3s', () => cli.do(`let ${actionName5} = data/foo.js --timeout 3s`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName5))
       .then(sidecar.expectLimit('timeout', 3000))//'3 sec'))
       .catch(common.oops(this)))

    it('should create an action with --timeout 5m', () => cli.do(`let ${actionName6} = data/foo.js --timeout 5m`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName6))
       .then(sidecar.expectLimit('timeout', 300000))//'300 sec'))
       .catch(common.oops(this)))

    it('should create an action with -l 1', () => cli.do(`let ${actionName7} = data/foo.js -l 1`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName7))
       .then(sidecar.expectLimit('logs', 1))//'1 MB of logs'))
       .catch(common.oops(this)))

    it('should create an action with --logs 2', () => cli.do(`let ${actionName8} = data/foo.js --logs 2`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName8))
       .then(sidecar.expectLimit('logs', 2))//'2 MB of logs'))
       .catch(common.oops(this)))

    // updating the action8 this time
    it('should create an action with --log 3', () => cli.do(`let ${actionName8} = data/foo.js --log 3`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName8))
       .then(sidecar.expectLimit('logs', 3))//'3 MB of logs'))
       .catch(common.oops(this)))

    it('should create an action with --logsize 3', () => cli.do(`let ${actionName9} = data/foo.js --logsize 3`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName9))
       .then(sidecar.expectLimit('logs', 3))//'3 MB of logs'))
       .catch(common.oops(this)))
})
