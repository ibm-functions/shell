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
      packageName = 'ppp',
      seqName = 'sss'

describe('Delete multiple actions', () => {
    before(common.before(this))
    after(common.after(this), () => cli.do(`wsk rule rm ${ruleName}`))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    // create an action, using the implicit entity type
    it('should create an action', () => cli.do(`create ${actionName} ./data/foo.js`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName)))

    // create an action, using the implicit entity type
    it('should create another action', () => cli.do(`create ${actionName2} ./data/foo2.js`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName2)))

    // delete them both
    it('should delete them both', () => cli.do(`rm ${actionName} ${actionName2}`, this.app)
	.then(cli.expectOKWithCustom({ expect: 'deleted 2 elements', exact: true }))
       .then(sidecar.expectClosed))

    it('should NOT find a deleted action', () => cli.do(`action get ${actionName} --no-retry`, this.app)
	.then(cli.expectError(404))
       .catch(common.oops(this)))

    it('should FAIL to delete a non-existant action', () => cli.do(`rm ${actionName} --no-retry`, this.app)
	.then(cli.expectError(404))
       .catch(common.oops(this)))


    //
    // recursive removal of packages
    //
    it('should create a packaged action', () => cli.do(`let ${packageName}/${actionName} = x=>x`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName)))
    it('should create another packaged action', () => cli.do(`let ${packageName}/${actionName2} = x=>x`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName2)))
    it('should delete the package recursively', () => cli.do(`package rm -r ${packageName}`, this.app)
	.then(cli.expectOKWithCustom({ expect: 'deleted 3 elements', exact: true }))
       .then(sidecar.expectClosed)
       .catch(common.oops(this)))
    it('should FAIL to delete the removed package', () => cli.do(`package rm -r ${packageName} --no-retry`, this.app)
	.then(cli.expectError(404))
       .catch(common.oops(this)))
    it('should NOT find the deleted package', () => cli.do(`action get ${packageName} --no-retry`, this.app)
	.then(cli.expectError(404))
       .catch(common.oops(this)))
    it('should NOT find the deleted package action', () => cli.do(`action get ${packageName}/${actionName} --no-retry`, this.app)
	.then(cli.expectError(404))
       .catch(common.oops(this)))

    //
    // recursive removal of anonymous inline functions
    //
    it('should create an action', () => cli.do(`create ${actionName} ./data/foo.js`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName)))
    it('should create another action', () => cli.do(`create ${actionName2} ./data/foo2.js`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName2)))
    it('should create a sequence with anonymous inline action', () => cli.do(`let ${seqName} = ${actionName} -> x=>x -> ${actionName2}`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName)))
    it('should delete the sequence recursively', () => cli.do(`rm -r ${seqName}`, this.app)
	.then(cli.expectOKWithCustom({ expect: 'deleted 2 elements', exact: true }))
       .then(sidecar.expectClosed))
})
