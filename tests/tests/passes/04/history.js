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
// read-only tests against the cli's list APIs
//
const common = require('../../../lib/common'),
      openwhisk = require('../../../lib/openwhisk'),
      assert = require('assert'),
      ui = require('../../../lib/ui'),
      cli = ui.cli,
      sidecar = ui.sidecar

describe('History commands', () => {
    before(common.before(this))
    after(common.after(this))

    const entityName = 'foo',
          createCommand = `create ${entityName} ./data/foo.js`,
          listCommand = 'ls'

    it('should have an active repl', () => cli.waitForRepl(this.app))

    it('should create an action', () => cli.do(createCommand, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(entityName))
       .catch(common.oops(this)))

    it(`should list history with filter 1`, () => cli.do(`history create 1`, this.app).then(cli.expectOKWithOnly(createCommand))) // 1 says it better be the last command we executed
    it(`should list history 2 and show the action creation`, () => cli.do(`history 2`, this.app).then(cli.expectOKWith(createCommand)))

    // get something on the screen
    it(`should list actions`, () => cli.do(listCommand, this.app).then(cli.expectOKWithOnly(entityName)))

    it('should delete the action', () => cli.do(`rm ${entityName}`, this.app)
        .then(cli.expectOK)
       .then(sidecar.expectClosed))

    it('should re-execte from history', () => cli.do('history create 5', this.app)
        .then(cli.expectOKWithCustom({ passthrough: true }))
       .then(N => this.app.client.click(`${ui.selectors.LIST_RESULTS_N(N)}:first-child .entity-name`))
       .then(() => this.app)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(entityName))
       .catch(common.oops(this)))

    it(`should list history and show the action creation`, () => cli.do(`history`, this.app).then(cli.expectOKWith(createCommand)))
    it(`should list history and show the action list`, () => cli.do(`history`, this.app).then(cli.expectOKWith(listCommand)))

    it(`should list history with filter, expect nothing`, () => cli.do(`history gumbogumbo`, this.app).then(cli.expectOK)) // some random string that won't be in the command history
})
