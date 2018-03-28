/*
 * Copyright 2018 IBM Corporation
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
      actionName2 = 'foo2'

describe('blackbox actions', function() {
    before(common.before(this))
    after(common.after(this))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    it('should create a blackbox action variant 1', () => cli.do(`wsk action create --docker bb1 openwhisk/example`, this.app)
       .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing('bb1'))
       .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTION_SOURCE))
       .then(txt => assert.equal(txt, 'dockerhub image: openwhisk/example'))
       .catch(common.oops(this)))

    it('should create a blackbox action variant 2', () => cli.do(`wsk action create bb2 --docker openwhisk/example`, this.app)
       .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing('bb2'))
       .catch(common.oops(this)))

    it('should create a blackbox action variant 3', () => cli.do(`wsk action create bb3 openwhisk/example --docker`, this.app)
       .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing('bb3'))
       .catch(common.oops(this)))

    it(`should invoke bb2`, () => cli.do(`invoke bb2`, this.app)
       .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing('bb2'))
       .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
       .then(ui.expectStruct({
           "args": {},
           "msg": "Hello from arbitrary C program!"
       }))
       .catch(common.oops(this)))
})
