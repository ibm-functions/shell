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
      openwhisk = require('../../../lib/openwhisk'),
      ui = require('../../../lib/ui'),
      assert = require('assert'),
      keys = ui.keys,
      cli = ui.cli,
      sidecar = ui.sidecar,
      actionName = 'foo'

describe('Check error handling for invoking a non-existant action', function() {
    before(common.before(this))
    after(common.after(this))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    it('invoke a non-existant action', () => cli.do(`invoke xxxxxx`, this.app)
	.then(cli.expectError(404))
       .catch(common.oops(this)))

    it('async a non-existant action', () => cli.do(`async xxxxxx`, this.app)
	.then(cli.expectError(404))
       .catch(common.oops(this)))

    it('create an action', () => cli.do(`let ${actionName} = x=>x`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName))
       .catch(common.oops(this)))

    it('invoke with a non-existant package, but existing action name', () => cli.do(`invoke xxxxxx/${actionName}`, this.app)
	.then(cli.expectError(404))
       .catch(common.oops(this)))

    it('invoke with a non-existant package, but existing action name, via bx wsk action invoke', () => cli.do(`bx wsk action invoke xxxxxx/${actionName}`, this.app)
	.then(cli.expectError(404))
       .catch(common.oops(this)))

    it('invoke with a non-existant package, but existing action name, via fsh action invoke', () => cli.do(`fsh action invoke xxxxxx/${actionName}`, this.app)
	.then(cli.expectError(404))
       .catch(common.oops(this)))

    it('invoke with a non-existant package, but existing action name, via wsk action invoke', () => cli.do(`wsk action invoke xxxxxx/${actionName}`, this.app)
	.then(cli.expectError(404))
       .catch(common.oops(this)))

    it('async with a non-existant package, but existing action name', () => cli.do(`async xxxxxx/${actionName}`, this.app)
	.then(cli.expectError(404))
       .catch(common.oops(this)))
})
