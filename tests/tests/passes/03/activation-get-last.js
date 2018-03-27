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
      actionName1 = `foo1-${new Date().getTime()}`,
      actionName2 = `foo2-${new Date().getTime()}`

describe('wsk activation get --last', function() {
    before(common.before(this))
    after(common.after(this))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    // create an action
    it(`should create an action ${actionName1}`, () => cli.do(`create ${actionName1} ./data/foo.js`, this.app)
       .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName1))
       .catch(common.oops(this)))

    it(`should invoke it ${actionName1}`, () => cli.do(`invoke -p name lastTestIPromise`, this.app)
       .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName1))
       .catch(common.oops(this)))

    // create another action
    it(`should create an action ${actionName2}`, () => cli.do(`create ${actionName2} ./data/foo.js`, this.app)
       .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName2))
       .catch(common.oops(this)))

    it(`should show ${actionName1} with wsk activation get --last`, () => this.app.client.waitUntil(() => {
        return cli.do(`wsk activation get --last`, this.app)
            .then(cli.expectOK)
            .then(sidecar.expectOpen)
            .then(sidecar.expectShowing(actionName1, undefined, undefined, undefined, undefined, 500))
            .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
            .then(ui.expectStruct({name:'Step1 lastTestIPromise'}))
            .catch(common.oops(this))
    }))

    it(`should invoke it ${actionName2}`, () => cli.do(`invoke ${actionName2} -p name lastTestIPromise`, this.app)
       .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName2))
       .catch(common.oops(this)))

    it(`should show ${actionName1} with wsk activation get --last ${actionName1}`, () => this.app.client.waitUntil(() => {
        return cli.do(`wsk activation get --last ${actionName1}`, this.app)
            .then(cli.expectOK)
            .then(sidecar.expectOpen)
            .then(sidecar.expectShowing(actionName1, undefined, undefined, undefined, undefined, 500))
            .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
            .then(ui.expectStruct({name:'Step1 lastTestIPromise'}))
            .catch(common.oops(this))
    }))
    
    it(`should show ${actionName2} with wsk activation get --last ${actionName2}`, () => this.app.client.waitUntil(() => {
        return cli.do(`wsk activation get --last ${actionName2}`, this.app)
            .then(cli.expectOK)
            .then(sidecar.expectOpen)
            .then(sidecar.expectShowing(actionName2, undefined, undefined, undefined, undefined, 500))
            .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
            .then(ui.expectStruct({name:'Step1 lastTestIPromise'}))
            .catch(common.oops(this))
    }))
})
