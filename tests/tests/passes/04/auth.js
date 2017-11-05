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
// tests that create an action and test that it shows up in the list UI
//    this test also covers toggling the sidecar
//
const common = require('../../../lib/common'),
      openwhisk = require('../../../lib/openwhisk'),
      ui = require('../../../lib/ui'),
      keys = ui.keys,
      cli = ui.cli,
      sidecar = ui.sidecar

describe('auth tests', function() {
    before(common.before(this))
    after(common.after(this))

    const ns1 = ui.expectedNamespace(),
          ns2 = ui.expectedNamespace(process.env.TEST_SPACE2)

    it('should have an active repl', () => cli.waitForRepl(this.app))

    // create an action, using the implicit entity type
    it('should create an action foo', () => cli.do(`create foo ./data/foo.js`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing('foo')))

    // list should show only foo
    it(`should find the foo action with "ls"`, () => cli.do('ls', this.app).then(cli.expectOKWithOnly('foo')))

    // install namespace key
    it(`should install a namespace key for ${ns2}`, () => cli.do(`auth add ${process.env.AUTH2}`, this.app)
	.then(cli.expectOKWithCustom({selector: '', expect: `You are now using the OpenWhisk namespace ${ns2}` })))

    // list should show no actions
    it(`should NOT find the foo action with "ls"`, () => cli.do('ls', this.app).then(cli.expectJustOK))

    // create the second action
    it('should create an action foo2', () => cli.do(`create foo2 ./data/foo.js`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing('foo2')))

    // list should show only foo2
    it(`should find the foo2 action with "ls"`, () => cli.do('ls', this.app).then(cli.expectOKWithOnly('foo2')))

    // switch to first namespace
    it('should switch to the first namespace, using the CLI switch command', () => cli.do(`auth switch ${ns1}`, this.app)
	.then(cli.expectOKWithCustom({selector: '', expect: `You are now using the OpenWhisk namespace ${ns1}` })))

    // list should show only foo
    it(`should find the foo action with "ls"`, () => cli.do('ls', this.app).then(cli.expectOKWithOnly('foo')))

    it(`should have no selection context after switching context`, () => cli.do('ls', this.app)
        .then(cli.expectContext(undefined, ''))) // don't care about command context (undefined), and selection must be empty ('')

    // switch back to second namespace
    it('should switch to the second namespace, using the CLI use command', () => cli.do(`auth use ${ns2}`, this.app)
	.then(cli.expectOKWithCustom({selector: '', expect: `You are now using the OpenWhisk namespace ${ns2}` })))

    // list should show only foo2
    it(`should find the foo2 action with "ls"`, () => cli.do('ls', this.app).then(cli.expectOKWithOnly('foo2')))

    it(`should have no selection context after switching auth`, () => cli.do('ls', this.app)
        .then(cli.expectContext(undefined, ''))) // don't care about command context (undefined), and selection must be empty ('')

    // auth ls should so both installed namespaces
    ui.aliases.list.forEach(cmd => {
        it(`should list first namespace with "auth ${cmd}"`, () => cli.do(`auth ${cmd}`, this.app).then(cli.expectOKWith(ns1)))
        it(`should list second namespace with "auth ${cmd}"`, () => cli.do(`auth ${cmd}`, this.app).then(cli.expectOKWith(ns2)))
    })

    // switch back to first namespace
    it('should switch to the first namespace, using the CLI auth add command', () => cli.do(`auth add ${process.env.AUTH}`, this.app)
	.then(cli.expectOKWithCustom({selector: '', expect: `You are now using the OpenWhisk namespace ${ns1}` })))
})
