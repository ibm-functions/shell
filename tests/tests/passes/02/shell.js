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

describe('shell commands', function() {
    before(common.before(this))
    after(common.after(this))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    it('should echo hi', () => cli.do(`! echo hi`, this.app)
       .then(cli.expectOKWithCustom({ expect: 'hi' }))
       .catch(common.oops(this)))

    it('should echo ho to a file', () => cli.do(`! echo ho > /tmp/testTmp`, this.app)
       .then(cli.expectOK)
       .catch(common.oops(this)))

    it('should cat that file', () => cli.do(`! cat /tmp/testTmp`, this.app)
       .then(cli.expectOKWithCustom({ expect: 'ho' }))
       .catch(common.oops(this)))

    it('should cat that file', () => cli.do(`! cd data`, this.app)
       .then(cli.expectOK)
       .catch(common.oops(this)))

    it('should list commandFile.wsk', () => cli.do(`lls`, this.app)
       .then(cli.expectOKWithCustom({ expect: 'commandFile.wsk' }))
       .catch(common.oops(this)))
})
