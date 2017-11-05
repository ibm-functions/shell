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
      subset = ['foo', 'foo2'],
      actions = subset.concat(['goo'])

describe('Delete using rm with wildcards', function() {
    before(common.before(this))
    after(common.after(this), () => cli.do(`wsk rule rm ${ruleName}`))

    /**
     * Create the actions named by the given listToCreate
     *
     */
    const create = listToCreate => {
        listToCreate.forEach(actionName => {
            it('should create an action', () => cli.do(`let ${actionName} = x=>x`, this.app)
                .then(cli.expectJustOK)
               .then(sidecar.expectOpen)
               .then(sidecar.expectShowing(actionName))
               .catch(common.oops(this)))
        })
    }

    /**
     * Verify that the given list of action names is indeed gone
     *
     */
    const verifyDeleted = list => list.forEach(actionName => {
        it('should NOT find a deleted action', () => cli.do(`action get ${actionName} --no-retry`, this.app)
	    .then(cli.expectError(404))
           .catch(common.oops(this)))
        it('should FAIL to delete a non-existant action', () => cli.do(`rm ${actionName} --no-retry`, this.app)
	    .then(cli.expectError(404))
           .catch(common.oops(this)))
    })

    /**
     * Create actions in the given listToCreate, delete them with `rm
     * ${cmd}`, then verify that the listToBeDeleted is indeed gone
     *
     */
    const recreateDeleteAndVerify = (cmd, listToBeDeleted, listToCreate) => {
        create(listToCreate)

        it(`should delete via rm ${cmd}`, () => cli.do(`rm ${cmd}`, this.app)
	    .then(cli.expectOKWithCustom({ expect: `deleted ${listToBeDeleted.length} elements`, exact: true }))
           .then(sidecar.expectClosed)
           .catch(common.oops(this)))

        verifyDeleted(listToBeDeleted)
    }
    
    it('should have an active repl', () => cli.waitForRepl(this.app))

    create(actions)

    it('should delete nothing with rm zzz*', () => cli.do(`rm zzz*`, this.app)
	.then(cli.expectOKWithCustom({ expect: 'deleted 0 elements', exact: true }))
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actions[2]))  // since goo was the last one we created, and we didn't delete it, it should still be open in the sidecar
       .catch(common.oops(this)))

    it('should delete foo and foo2 with rm foo*', () => cli.do(`rm foo*`, this.app)
	.then(cli.expectOKWithCustom({ expect: 'deleted 2 elements', exact: true }))
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actions[2]))  // since goo was the last one we created, and we didn't delete it, it should still be open in the sidecar
       .catch(common.oops(this)))

    // goo should still show up in the list and get views
    it('should list goo', () => cli.do(`ls`, this.app)
	.then(cli.expectOKWithOnly(actions[2]))
       .catch(common.oops(this)))
    it('should find a not-deleted action', () => cli.do(`action get ${actions[2]}`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actions[2]))
       .catch(common.oops(this)))

    // foo and foo2 should be gone
    verifyDeleted(subset)

    //
    // try to remove all three with "rm *oo*"
    //   ... first we need re-create the subset we deleted
    //
    recreateDeleteAndVerify('*oo*', actions, subset)

    //
    // try to remove all three with "rm *"
    //   ... first we need re-create all three actions
    //
    recreateDeleteAndVerify('*', actions, actions)

    //
    // try to remove all three with "rm **"
    //   ... first we need re-create all three actions
    //
    recreateDeleteAndVerify('**', actions, actions)

    //
    // try to remove all three with "rm foo* goo"
    //   ... first we need re-create all three actions
    //
    recreateDeleteAndVerify('foo* goo', actions, actions)
})
