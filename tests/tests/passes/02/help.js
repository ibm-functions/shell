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
// read-only tests against the cli's help APIs
//
const common = require('../../../lib/common'),
      openwhisk = require('../../../lib/openwhisk'),
      assert = require('assert'),
      ui = require('../../../lib/ui'),
      cli = ui.cli,
      sidecar = ui.sidecar

const expectConsoleToBeClear = app => {
    return app.client.elements('#main-repl .repl-block')
        .then(elements => assert.equal(elements.value.length, 1))
}

describe('Help command', function() {
    before(common.before(this))
    after(common.after(this))

    /** helper method, used in the tests below: ask for help */
    const doHelp = (cmd, code=450) => {
        return it(`should show help via ${cmd}`, () => cli.do(cmd, this.app)
                  .then(cli.expectError(code))
                  .catch(common.oops(this)))
    }

    //
    // and now here come the tests...
    //
    it('should have an active repl', () => cli.waitForRepl(this.app))

    // help in default context
    doHelp('help')
    doHelp('wsk')
    doHelp('wsk action')
    doHelp('editor')
    doHelp('composer')
    doHelp('wsk action create', 497) // insufficient arguments
})
