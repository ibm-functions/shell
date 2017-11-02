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
      condition1 = 'cond1',
      condition2 = 'cond2',
      condition3 = 'cond3',
      condition4 = 'cond4',
      condition5 = 'cond5',
      yes = 'yes',
      yesyes = 'yesyes',
      no = 'no',
      iffy1 = 'iffy1',
      iffy2 = 'iffy2',
      seqName1 = 'seq1'

describe('Create a composer if', function() {
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


    makeAction(condition1, 'aa', 11, "x => ({value:true})")
    makeAction(condition2, 'aaa', 111, "x => ({value:true})")
    makeAction(condition3, 'aaaa', 1111, "x => ({value:false})")
    makeAction(condition4, 'aaaaa', 11111, "x => ({value:false})")
    makeAction(condition5, 'aaaaaa', 111111, "x => x")
    makeAction(yes, 'yy', 22, "x=>({message:'yes'})")
    makeAction(yesyes, 'yyy', 222, "x=>Object.assign(x,{message:'yes'})")
    makeAction(no, 'nn', 33, "x=>({message:'no'})")

    {
        const cmd = `app init --reset --url ${sharedURL}`
        it(`should ${cmd}`, () => cli.do(cmd, this.app)
            .then(cli.expectOKWithCustom({expect: 'Successfully initialized the required services. You may now create compositions.'}))
           .catch(common.oops(this)))
        
    }

    const ifthen1 = `if_${condition1}_then_${yes}`
    it(`should create a composer if with ${condition1} and ${yes}`, () => cli.do(`if ${condition1} then ${yes}`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(ifthen1, undefined, true)) // name might overflow, true means substring ok
       .then(sidecar.expectBadge('if-then'))
       .catch(common.oops(this)))
    invoke(ifthen1, 'ignored', undefined, {message:yes}, true)

    const ifthen2 = `if_${condition2}_then_${yesyes}`
    it('should create a composer if without the "then" syntax', () => cli.do(`if ${condition2} ${yesyes}`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(ifthen2, undefined, true)) // name might overflow, true means substring ok
       .then(sidecar.expectBadge('if-then'))
       .catch(common.oops(this)))
    invoke(ifthen2, 'x', 3, {message:yes, yyy:222})

    const ifthen3 = `if_${condition3}_then_${yes}_else_${no}`
    it('should create a composer if/then/else', () => cli.do(`if ${condition3} then ${yes} else ${no}`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(ifthen3, undefined, true)) // name might overflow, true means substring ok
       .then(sidecar.expectBadge('if-then'))
       .catch(common.oops(this)))
    invoke(ifthen3, 'ignored', undefined, {message:no}, true)

    const ifthen4 = `if_${condition4}_then_${yes}_else_${no}`
    it('should create a composer if/then/else without the "then" or "else" syntax', () => cli.do(`if ${condition4} ${yes} ${no}`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(ifthen4, undefined, true)) // name might overflow, true means substring ok
       .then(sidecar.expectBadge('if-then'))
       .catch(common.oops(this)))
    invoke(ifthen4, 'ignored', undefined, {message:no}, true)

    it(`should create a composer if with let ${iffy1}`, () => cli.do(`let ${iffy1} = |if ${condition1} ${yes}|`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(iffy1))
       .then(sidecar.expectBadge('if-then'))
       .catch(common.oops(this)))
    invoke(iffy1, 'ignored', undefined, {message:yes}, true)
})
