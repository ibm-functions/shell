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
      isUrl = require('is-url'),
      fs = require('fs'),
      path = require('path'),
      //sharedURL = process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      badges = require(path.join(__dirname, '../../../../app/plugins/modules/composer/lib/badges.js')),
      keys = ui.keys,
      cli = ui.cli,
      sidecar = ui.sidecar,
      actionName1 = 'foo1',
      actionName2 = 'foo2',
      actionName3 = 'foo3',
      seqName1 = 'seq1',
      seqName2 = 'seq2',
      seqName3 = 'seq3',
      packageName1 = 'ppp1',
      srcDir = './data/composer-source'  // inputs for create-from-source

describe('app invoke with implicit entity', function() {
    before(common.before(this))
    after(common.after(this))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    for (let idx = 1; idx <= 3; idx++) {
        const name = `foo${idx}`
        it(`should create an action ${name} via let`, () => cli.do(`let ${name} = x=>x`, this.app)
	   .then(cli.expectOK)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(name))
           .catch(common.oops(this)))
    }

    it('should create a composer sequence', () => cli.do(`app create ${seqName1} ./data/fsm.json`, this.app)
       .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName1))
       .then(sidecar.expectBadge(badges.fsm))
       .catch(common.oops(this)))

    for (let idx = 0; idx < 5; idx++) {
        it(`should invoke ${seqName1} with implicit entity idx=${idx}`, () => cli.do(`app invoke -p name grumble${idx}`, this.app)
           .then(cli.expectOK)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(seqName1))
           .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
           .then(ui.expectStruct({ name: `grumble${idx}` }))
           .catch(common.oops(this)))
    }
})
