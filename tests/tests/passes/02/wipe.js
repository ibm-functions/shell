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
      sidecar = ui.sidecar

describe('wipe command', function() {
    before(common.before(this))
    after(common.after(this))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    it('should create a package', () => cli.do('wsk package create ppp', this.app)
       .then(cli.expectOK)
       .catch(common.oops(this)))

    it('should create a trigger', () => cli.do('wsk trigger create ttt', this.app)
       .then(cli.expectOK)
       .catch(common.oops(this)))

    it('should create an action', () => cli.do('wsk action create aaa ./data/foo.js', this.app)
       .then(cli.expectOK)
       .catch(common.oops(this)))

    it('should create a rule', () => cli.do('wsk rule create rrr ttt aaa', this.app)
       .then(cli.expectOK)
       .catch(common.oops(this)))

    it('should successfully execute the wipe command', () => cli.do('wipe', this.app)
       .then(res => this.app.client.keys(`yes${keys.ENTER}`).then(() => res))
       .then(cli.expectOK)
       .catch(common.oops(this)))

    it('should find no entities with list all', () => cli.do('wsk list', this.app)
       .then(cli.expectBlank)
       .catch(common.oops(this)))
})
