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
      sharedURL = process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      actionName1 = 'foo1',
      actionName2 = 'foo2',
      actionName3 = 'foo3',
      seqName1 = 'seq1',
      seqName2 = 'seq2',
      seqName3 = 'seq3',
      seqName4 = 'seq4'

describe('Create a composer sequence', function() {
    before(common.before(this))
    after(common.after(this))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    /** expected return value */
    const expect = (key, value, extraExpect={}) => {
        const expect = {}
        expect[key] = value
        return Object.assign(expect, extraExpect)
    }

    /** verify that annotations stuck */
    const checkAnnotation = (name, expect) => {
        it('should switch to annotations mode', () => cli.do('annotations', this.app)
            .then(cli.expectOK)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(name))
           .then(app => app.client.getText(`${ui.selectors.SIDECAR_CONTENT} .action-source`))
           .then(ui.expectSubset(expect))
           .catch(common.oops(this)))
    }

    /** invoke a composition */
    const invoke = (name, key, value, extraExpect={}) => {
        it(`should invoke the composer sequence ${name} with ${key}=${value}`, () => cli.do(`invoke ${name} -p ${key} ${value}`, this.app)
	    .then(cli.expectOK)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(name))
           .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
           .then(ui.expectStruct(expect(key, value, extraExpect)))
           .catch(common.oops(this)))
    }

    /** make a plain openwhisk action */
    const makeAction = (name, key, value) => {
        it('should create an action via let', () => cli.do(`let ${name} = x=>x -p ${key} ${value}`, this.app)
	    .then(cli.expectOK)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(name))
           .catch(common.oops(this)))

        it('should switch to parameters mode', () => cli.do('parameters', this.app)
            .then(cli.expectOK)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(name))
           .then(app => app.client.getText(`${ui.selectors.SIDECAR_CONTENT} .action-source`))
           .then(ui.expectStruct(expect(key, value)))
           .catch(common.oops(this)))
    }

    {
        const cmd = `app init --reset --url ${sharedURL}`
        it(`should ${cmd}`, () => cli.do(cmd, this.app)
            .then(cli.expectOKWithCustom({expect: 'Successfully initialized the required services. You may now create compositions.'}))
           .catch(common.oops(this)))
        
    }

    // simple sequence
    it(`should create a composer sequence ${seqName1} with anonymous functions`, () => cli.do(`letc ${seqName1} = x=>x -> x=>x -a m 4`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName1))
       .then(sidecar.expectBadge('sequence'))
       .catch(common.oops(this)))
    checkAnnotation(seqName1, { m: 4 })
    invoke(seqName1, 'n', 3)

    // nested sequence
    it(`should create a nested composer sequence ${seqName2} with anonymous functions`, () => cli.do(`letc ${seqName2} = ${seqName1} -> x=>x -a mm 44`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName2))
       .then(sidecar.expectBadge('sequence'))
       .catch(common.oops(this)))
    checkAnnotation(seqName2, { mm: 44 })
    invoke(seqName2, 'nn', 33)

    // now make an sequence with named actions
    makeAction(actionName1, 'aa', 11)
    makeAction(actionName2, 'bb', 22)
    it(`should create a composer sequence ${seqName3} with named functions`, () => cli.do(`letc ${seqName3} = ${actionName1} -> ${actionName2} -a mmm 444`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName3))
       .then(sidecar.expectBadge('sequence'))
       .catch(common.oops(this)))
    checkAnnotation(seqName3, { mmm: 444 })
    invoke(seqName3, 'nnn', 333, {aa:11, bb:22})

    // now make a nested action of that
    makeAction(actionName3, 'cc', 33)
    it(`should create a nested composer sequence ${seqName4} with named functions`, () => cli.do(`letc ${seqName4} = ${seqName3} -> ${actionName3} -a mmmm 4444`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName4))
       .then(sidecar.expectBadge('sequence'))
       .catch(common.oops(this)))
    checkAnnotation(seqName4, { mmmm: 4444 })
    invoke(seqName4, 'nnnn', 3333, {aa:11, bb:22, cc:33})
})
