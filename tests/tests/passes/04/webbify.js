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
      rp = common.rp,
      openwhisk = require('../../../lib/openwhisk'),
      ui = require('../../../lib/ui'),
      assert = require('assert'),
      keys = ui.keys,
      cli = ui.cli,
      sidecar = ui.sidecar,
      actionName = 'foo',
      actionName2 = 'foo2',
      actionName3 = 'foo3',
      actionName4 = 'foo4',
      actionName5 = 'foo5',
      actionName6 = 'foo6',
      packageName = 'ppp'

describe('Webbify actions', () => {
    before(common.before(this))
    after(common.after(this))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    it('should create an action', () => cli.do(`let ${actionName} = x=>x`, this.app)
       .then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName)))

    it('should create another action', () => cli.do(`let ${actionName2} = x=>x`, this.app)
       .then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName2)))

    it('should webbify with implicit action', () => cli.do(`webbify`, this.app)
       .then(cli.expectOKWithCustom({ selector: '.entity-web-export-url' }))
       .then(selector => this.app.client.getText(selector))
       .then(href => rp({ url: `${href}?message=test`, rejectUnauthorized: false })) // provide an input to the remote request
       .then(ui.expectSubset({ message: 'test' }))             // and expect it right back, since the action is an echo action
       .then(() => this.app)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName2)))

    it('should webbify with explicit action', () => cli.do(`webbify ${actionName}`, this.app)
       .then(cli.expectOKWithCustom({ selector: '.entity-web-export-url' }))
       .then(selector => this.app.client.getText(selector))
       .then(href => rp({ url: `${href}?message2=test2`, rejectUnauthorized: false })) // provide an input to the remote request
       .then(ui.expectSubset({ message2: 'test2' }))            // and expect it right back, since the action is an echo action
       .then(() => this.app)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName)))

    it('should create a packaged action', () => cli.do(`let ${packageName}/${actionName3} = x=>x`, this.app)
       .then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName3, undefined, undefined, packageName)))

    it('should create another packaged action', () => cli.do(`let ${packageName}/${actionName4} = x=>x`, this.app)
       .then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName4, undefined, undefined, packageName)))

    it('should webbify a packaged action with implicit action', () => cli.do(`webbify`, this.app)
       .then(cli.expectOKWithCustom({ selector: '.entity-web-export-url' }))
       .then(selector => this.app.client.getText(selector))
       .then(href => rp({ url: `${href}?message3=test3`, rejectUnauthorized: false })) // provide an input to the remote request
       .then(ui.expectSubset({ message3: 'test3' }))             // and expect it right back, since the action is an echo action
       .then(() => this.app)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName4, undefined, undefined, packageName)))

    it('should webbify a packaged action with explicit action', () => cli.do(`webbify ${packageName}/${actionName3}`, this.app)
       .then(cli.expectOKWithCustom({ selector: '.entity-web-export-url' }))
       .then(selector => this.app.client.getText(selector))
       .then(href => rp({ url: `${href}?message4=test4`, rejectUnauthorized: false })) // provide an input to the remote request
       .then(ui.expectSubset({ message4: 'test4' }))             // and expect it right back, since the action is an echo action
       .then(() => this.app)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName3, undefined, undefined, packageName)))

    it('should create an action for http', () => cli.do(`let ${actionName5} = x=>({body: x.message})`, this.app)
       .then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName5)))

    it('should create another action for http', () => cli.do(`let ${actionName6} = x=>({body: x.message})`, this.app)
       .then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName6)))

    it('should webbify as http with implicit action', () => cli.do(`webbify as http`, this.app)
       .then(cli.expectOKWithCustom({ selector: '.entity-web-export-url' }))
       .then(selector => this.app.client.getText(selector))
       .then(href => rp({ url: `${href}?message=test5`, rejectUnauthorized: false })) // provide an input to the remote request
       .then(response => assert.equal(response, 'test5'))       // and expect it right back
       .then(() => this.app)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName6)))

    it('should webbify as http with explicit action', () => cli.do(`webbify ${actionName5} as http`, this.app)
       .then(cli.expectOKWithCustom({ selector: '.entity-web-export-url' }))
       .then(selector => this.app.client.getText(selector))
       .then(href => rp({ url: `${href}?message=test6`, rejectUnauthorized: false })) // provide an input to the remote request
       .then(response => assert.equal(response, 'test6'))       // and expect it right back
       .then(() => this.app)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName5)))
})
