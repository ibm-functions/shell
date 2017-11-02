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

// A simple test to verify a visible window is opened with a title
const common = require('../../../lib/common'),
      ui = require('../../../lib/ui'),
      cli = ui.cli,
      path = require('path'),
      assert = require('assert'),
      expectedVersion = require(path.join(__dirname, '../../../../app/package.json')).version

describe('Version command', () => {
    before(common.before(this))
    after(common.after(this))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    it('should report proper version', () => cli.do('version', this.app)
        .then(cli.expectOKWithCustom({ expected: expectedVersion }))
       .catch(common.oops(this)))
})

