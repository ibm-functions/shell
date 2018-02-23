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
// tests wsk package bind
//
const common = require('../../../lib/common'),
      openwhisk = require('../../../lib/openwhisk'),
      ui = require('../../../lib/ui'),
      assert = require('assert'),
      keys = ui.keys,
      cli = ui.cli,
      sidecar = ui.sidecar,
      package = 'package',
      package2 = 'package2',
      action = 'action'

describe('wsk package list tests', function() {
    before(common.before(this))
    after(common.after(this))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    it(`should create ${action} in ${package}`, () => cli.do(`let ${package}/${action} = x=>x`, this.app)
       .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(action, undefined, package))
       .catch(common.oops(this)))

    it(`should list actions in ${package} with ls ${package}`, () => cli.do(`ls ${package}`, this.app)
       .then(cli.expectOKWith(action))
       .catch(common.oops(this)))

    it(`should list ${package} with wsk package list`, () => cli.do(`wsk package list`, this.app)
       .then(cli.expectOKWithOnly(package))
       .catch(common.oops(this)))

    it(`should create ${package} with wsk package create`, () => cli.do(`wsk package create ${package2}`, this.app)
       .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(package2))
       .catch(common.oops(this)))

    it(`should list ${package} with fsh package ls`, () => cli.do(`fsh package ls`, this.app)
       .then(cli.expectOKWith(package))
       .catch(common.oops(this)))

    it(`should list ${package} with bx wsk package ls`, () => cli.do(`bx wsk package ls`, this.app)
       .then(cli.expectOKWith(package))
       .catch(common.oops(this)))

    it(`should list ${package} with wsk package ls`, () => cli.do(`wsk package ls`, this.app)
       .then(cli.expectOKWith(package))
       .catch(common.oops(this)))

    it(`should list ${package2} with package ls`, () => cli.do(`package ls`, this.app)
       .then(cli.expectOKWith(package2))
       .catch(common.oops(this)))

    it(`should list ${package2} with package list`, () => cli.do(`package list`, this.app)
       .then(cli.expectOKWith(package2))
       .catch(common.oops(this)))

    it(`should list ${package} with package list /${ui.expectedNamespace()}`, () => cli.do(`package list /${ui.expectedNamespace()}`, this.app)
       .then(cli.expectOKWith(package2))
       .catch(common.oops(this)))

    it(`should list ${package2} with package list /${ui.expectedNamespace()}`, () => cli.do(`package list /${ui.expectedNamespace()}`, this.app)
       .then(cli.expectOKWith(package2))
       .catch(common.oops(this)))

    it(`should list actions in ${package} with wsk action list ${package}`, () => cli.do(`wsk action list ${package}`, this.app)
       .then(cli.expectOKWith(action))
       .catch(common.oops(this)))

    it(`should list actions in ${package} with bx wsk action list ${package}`, () => cli.do(`bx wsk action list ${package}`, this.app)
       .then(cli.expectOKWith(action))
       .catch(common.oops(this)))

    it(`should list actions in ${package} with fsh action list ${package}`, () => cli.do(`fsh action list ${package}`, this.app)
       .then(cli.expectOKWith(action))
       .catch(common.oops(this)))

    it(`should list actions in ${package} with action list ${package}`, () => cli.do(`action list ${package}`, this.app)
       .then(cli.expectOKWith(action))
       .catch(common.oops(this)))

    it(`should list actions in ${package} with action ls ${package}`, () => cli.do(`action ls ${package}`, this.app)
       .then(cli.expectOKWith(action))
       .catch(common.oops(this)))
})
