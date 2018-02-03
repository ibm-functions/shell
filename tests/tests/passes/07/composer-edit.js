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
// test the edit actionName command for compositions
//
const common = require('../../../lib/common'),
      openwhisk = require('../../../lib/openwhisk'),
      ui = require('../../../lib/ui'),
      path = require('path'),
      sharedURL = process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      badges = require(path.join(__dirname, '../../../../app/plugins/modules/composer/lib/badges.js')),
      assert = require('assert'),
      keys = ui.keys,
      cli = ui.cli,
      sidecar = ui.sidecar,
      actionName = 'long'

describe('edit compositions', function() {
    before(common.before(this))
    after(common.after(this))

    /** deploy the changes */
    const deploy = (app, action) => () => {
        return app.client.click(ui.selectors.SIDECAR_MODE_BUTTON('Deploy'))
            .then(() => app.client.waitForExist(`${ui.selectors.SIDECAR} .editor-status.is-up-to-date`))
            .then(() => app)
            .catch(err => {
                console.error('Ouch, something bad happened, let us clean up the action before retrying')
                console.error(err)
                return cli.do(`rm ${action}`, app)
                    .then(() => {
                        throw err
                    })
            })
    }

    it('should have an active repl', () => cli.waitForRepl(this.app))

    it('should initialize composer', () => cli.do(`app init --url ${sharedURL} --cleanse`, this.app) // cleanse important here for counting sessions in `sessions`
       .then(cli.expectOKWithCustom({expect: 'Successfully initialized and reset the required services. You may now create compositions.'}))
       .catch(common.oops(this)))

    it('should create an app from FSM', () => cli.do(`app create comp1 ./data/fsm.json`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing('comp1'))
       .then(sidecar.expectBadge(badges.fsm))
       .catch(common.oops(this)))

    it('should fail to edit the fsm-based app', () => cli.do('edit comp1', this.app)
       .then(cli.expectError(406))
       .catch(common.oops(this)))

    it('should create an app from source', () => cli.do('app create comp2 ./data/composer-source/seq.js', this.app)
       .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing('comp2'))
       .then(sidecar.expectBadge(badges.composerLib))
       .catch(common.oops(this)))

    // do this in a loop, to make sure we don't have any event listener leaks
    it(`should edit the app with source`, () => cli.do('edit comp2', this.app)
       .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing('comp2'))
       .then(sidecar.expectBadge('v0.0.1'))
       .then(deploy(this.app, 'comp2'))
       .then(sidecar.expectBadge('v0.0.2'))
       .catch(common.oops(this)))
})
