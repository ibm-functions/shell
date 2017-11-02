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
      sharedURL = process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      actionName1 = 'foo1',
      actionName2 = 'foo2',
      seqName1 = 'seq1',
      seqName2 = 'seq2'

describe('Use the app list command to list the invokeable compositions', function() {
    before(common.before(this))
    after(common.after(this))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    {
        const cmd = `app init --reset --url ${sharedURL}`
        it(`should ${cmd}`, () => cli.do(cmd, this.app)
            .then(cli.expectOKWithCustom({expect: 'Successfully initialized the required services. You may now create compositions.'}))
           .catch(common.oops(this)))
        
    }

    // make an app
    it('should create a composer sequence', () => cli.do(`app create ${seqName1} ./data/fsm.json`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName1))
       .then(sidecar.expectBadge('fsm'))
       .catch(common.oops(this)))

    // list it
    it('should list ${seqName1} via app ls', () => cli.do(`app ls`, this.app)
	.then(cli.expectOKWithOnly(seqName1))
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName1))
       .then(sidecar.expectBadge('fsm'))
       .catch(common.oops(this)))
    
    // make a second app
    it('should create a second composer sequence', () => cli.do(`app create ${seqName2} ./data/fsm.json`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName2))
       .then(sidecar.expectBadge('fsm'))
       .catch(common.oops(this)))

    // list it
    it('should list ${seqName1} via app list', () => cli.do(`app list`, this.app)
	.then(cli.expectOKWith(seqName1))     // seqName1 had better still be in the list
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName2)) // but the sidecar should be showing seqName2
       .then(sidecar.expectBadge('fsm'))
       .catch(common.oops(this)))

    it('should list ${seqName1} via wsk app list', () => cli.do(`wsk app list`, this.app)
	.then(cli.expectOKWith(seqName2))     // seqName2 had better also be in the list
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName2))
       .then(sidecar.expectBadge('fsm'))
       .catch(common.oops(this)))
})
