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
      condition1 = 'cond1',
      condition2 = 'cond2',
      condition3 = 'cond3',
      task1 = 'task1',
      seqName1 = 'seq1'

describe('Create a composer while', function() {
    before(common.before(this))
    after(common.after(this))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    /** expected return value */
    const expect = (key, value, extraExpect, expectIsIt) => {
        if (expectIsIt) {
            return extraExpect
        } else {
            const expect = {}
            if (key) expect[key] = value
            return Object.assign(expect, extraExpect)
        }
    }

    /** invoke a composition */
    const invoke = (name, key, value, extraExpect, expectIsIt=false) => {
        const params = key ? `-p ${key} ${value}` : ''

        it(`should invoke the composition ${name} with ${key}=${value}`, () => cli.do(`invoke ${name} ${params}`, this.app)
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


    makeAction(condition1, 'aa', 11, "P => ({value:false})")
    makeAction(condition2, 'aaa', 111, "({$i}) => ({value: ($i||0) < 5})")
    makeAction(condition3, 'aaaa', 1111, "({$i}) => ({value: ($i||0) < 6})")
    makeAction(task1, 'bb', 22, "({$i}) => ({ $i: ($i||0) + 1 })")

    /*{
        const cmd = `app init --reset --url ${sharedURL}`
        it(`should ${cmd}`, () => cli.do(cmd, this.app)
            .then(cli.expectOKWithCustom({expect: 'Successfully initialized the required services. You may now create compositions.'}))
           .catch(common.oops(this)))
    }*/

    const loop1 = `while_${condition1}_do_${task1}`
    it('should create a composer while with condition1 and task1', () => cli.do(`while ${condition1} do ${task1}`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(loop1))
       .then(sidecar.expectBadge('loop'))
       .catch(common.oops(this)))
    invoke(loop1, 'x', 3)

    const loop2 = `while_${condition2}_do_${task1}`
    it('should create a composer while with condition2 and task1', () => cli.do(`while ${condition2} do ${task1}`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(loop2))
       .then(sidecar.expectBadge('loop'))
       .catch(common.oops(this)))
    invoke(loop2, undefined, undefined, { $i: 5 })

    // try without the "do"
    const loop3 = `while_${condition3}_do_${task1}`
    it('should create a composer while, no "do", with condition3 and task1', () => cli.do(`while ${condition3} ${task1}`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(loop3))
       .then(sidecar.expectBadge('loop'))
       .catch(common.oops(this)))
    invoke(loop3, undefined, undefined, { $i: 6 })

    // name the loop, with let
    const loop4 = 'loopy'
    it('should create a composer while with let, condition2 and task1', () => cli.do(`let ${loop4} = |while ${condition2} do ${task1}|`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(loop4))
       .then(sidecar.expectBadge('loop'))
       .catch(common.oops(this)))
    invoke(loop4, undefined, undefined, { $i: 5 })

    // make a simple sequence, then nest in as the task
    it(`should create a composer sequence with echo->${task1}`, () => cli.do(`letc ${seqName1} = x=>x -> ${task1}`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName1))
       .then(sidecar.expectBadge(badges.sequence))
       .catch(common.oops(this)))
    invoke(seqName1, 'x', 3, { $i: 1 }, true) // true means we expect just $i:1 back

    const loop5 = 'loopy2'
    it('should create a composer while with let, condition2 and ${seqName1}', () => cli.do(`let ${loop5} = |while ${condition2} do ${seqName1}|`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(loop5))
       .then(sidecar.expectBadge('loop'))
       .catch(common.oops(this)))
    invoke(loop4, 'x', 3, { $i: 5 }, true) // true means we expect just $i:5 back
})
