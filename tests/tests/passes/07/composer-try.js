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
      path = require('path'),
      //sharedURL = process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      badges = require(path.join(__dirname, '../../../../app/plugins/modules/composer/lib/badges.js')),
      actionName1 = 'foo1',
      actionName2 = 'foo2',
      actionName3 = 'foo3',
      seqName1 = 'seq1',
      seqName2 = 'seq2',
      seqName3 = 'seq3',
      seqName4 = 'seq4'

describe('Create a composer try-catch', function() {
    before(common.before(this))
    after(common.after(this))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    /** expected return value */
    const expect = (key, value, extraExpect, expectIsIt) => {
        if (expectIsIt) {
            return extraExpect
        } else {
            const expect = {}
            expect[key] = value
            return Object.assign(expect, extraExpect)
        }
    }

    /** invoke a composition */
    const invoke = (name, key, value, extraExpect, expectIsIt=false) => {
        it(`should invoke the composition ${name} with ${key}=${value}`, () => cli.do(`invoke ${name} -p ${key} ${value}`, this.app)
	    .then(cli.expectOK)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(name))
           .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
           .then(ui.expectStruct(expect(key, value, extraExpect, expectIsIt)))
           .catch(common.oops(this)))
    }

    /** make a plain openwhisk action */
    const makeAction = (name, key, value, body='x=>x') => {
        it('should create an action via let', () => cli.do(`let ${name} = ${body} -p ${key} ${value}`, this.app)
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


    makeAction(actionName1, 'aa', 11, "P => { if (P.x<0) throw new Error('oops'); else return P }")
    makeAction(actionName2, 'bb', 22, "err => ({message: err})")
    
    /*{
        const cmd = `app init --reset --url ${sharedURL}`
        it(`should ${cmd}`, () => cli.do(cmd, this.app)
            .then(cli.expectOKWithCustom({expect: 'Successfully initialized the required services. You may now create compositions.'}))
           .catch(common.oops(this)))
    }*/

    it('should create a composer try', () => cli.do(`recover ${actionName1} with ${actionName2}`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName1))
       .then(sidecar.expectBadge('try-catch'))
       .catch(common.oops(this)))
    invoke(actionName1, 'x', 3, { aa: 11, x: 3 })

    // note that we defined actionName1 to bomb if the input x is less
    // than zero, so expect the recovery here
    invoke(actionName1, 'x', -3, {
        aa: 11,
        "message": {
            bb: 22, // we bound bb=22 to the recovery action
            error: "An error has occurred: Error: oops"
        }
    }, true)


    // simple sequence
    it(`should create a composer sequence with echo->${actionName1}`, () => cli.do(`letc ${seqName1} = x=>x -> ${actionName1}`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName1))
       .then(sidecar.expectBadge(badges.sequence))
       .catch(common.oops(this)))
    invoke(seqName1, 'x', 3, { aa: 11 })
    
    it('should create a composer try with nested composer sequence', () => cli.do(`recover ${seqName1} with ${actionName2}`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName1))
       .then(sidecar.expectBadge('try-catch'))
       .catch(common.oops(this)))
    invoke(seqName1, 'x', 3, { aa: 11 })

    invoke(seqName1, 'x', -3, {
        "message": {
            bb: 22, // we bound bb=22 to the recovery action
            "error": "An error has occurred: Error: oops"
        }
    }, true)
})
