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

describe('wsk action invoke with implicit entity', function() {
    before(common.before(this))
    after(common.after(this))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    it('should create an action', () => cli.do(`let ${actionName} = x=>x -p x 3`, this.app)
       .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName))
       .catch(common.oops(this)))

    for (let idx = 0; idx < 5; idx++) {
        it(`should invoke ${actionName} with implicit entity idx=${idx}`, () => cli.do(`wsk action invoke -p name grumble`, this.app)
           .then(cli.expectOK)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(actionName))
           .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
           .then(ui.expectStruct({ x:3, name:'grumble' }))
           .catch(common.oops(this)))
    }
})
