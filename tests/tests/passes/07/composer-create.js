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
      isUrl = require('is-url'),
      fs = require('fs'),
      path = require('path'),
      //sharedURL = process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      badges = require(path.join(__dirname, '../../../../app/plugins/modules/composer/lib/badges.js')),
      keys = ui.keys,
      cli = ui.cli,
      sidecar = ui.sidecar,
      actionName1 = 'foo1',
      actionName2 = 'foo2',
      actionName3 = 'foo3',
      seqName1 = 'seq1',
      seqName2 = 'seq2',
      seqName3 = 'seq3',
      packageName1 = 'ppp1',
      srcDir = './data/composer-source'  // inputs for create-from-source

describe('app create and sessions', function() {
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
    const invoke = (_name, key, value, extraExpect, expectIsIt=false, cmd='app invoke') => {
        const name = typeof _name === 'string' ? _name : _name.action,
              packageName = _name.package,
              fullName = packageName ? `${packageName}/${name}` : name

        it(`should invoke via ${cmd} the composition ${fullName} with ${key}=${value}`, () => cli.do(`${cmd} ${fullName} -p ${key} ${value}`, this.app)
	   .then(cli.expectOK)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(seqName1))
           .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
           .then(ui.expectStruct(expect(key, value, extraExpect, expectIsIt)))
           .then(() => this.app.client.click(ui.selectors.SIDECAR_TITLE)) // click on the name part in the sidecar header
           .then(() => this.app)
           .then(sidecar.expectShowing(seqName1, undefined, undefined, packageName))
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

    /** regular action get */
    const getAction = name => it(`should get regular action ${name}`, () => cli.do(`wsk action get ${name}`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(name))
       .catch(common.oops(this)))

    /** app config */
    const getConfig = cmd => it(`should show app configuration via "${cmd}"`, () => cli.do(cmd, this.app)
	.then(cli.expectOKWithCustom({ expect: 'Composer version' }))
        .catch(common.oops(this)))

    /** sessions */
    const doGetSessions = (cmd, nLive, nDone) => {
        const once = iter => cli.do(cmd, this.app)
	    .then(cli.expectOKWithCustom({ passthrough: true }))
            .then(N => this.app.client.elements(`${ui.selectors.OUTPUT_N(N)} .entity.session[data-status="live"]`)
                  .then(list => {
                      if (list.value.length !== nLive) {
                          console.error('live does not match ' + list.value.length + ' != ' + nLive)
                          if (list.value.length < nLive) {
                              // we'll retry
                              return false
                          } else {
                              // if actual live > expected live, then fail fast
                              assert.equal(list.value.length, nLive)
                          }
                      } else {
                          // actual live === expected live, good!
                          return true
                      }
                  })
                  .then(liveGood => this.app.client.elements(`${ui.selectors.OUTPUT_N(N)} .entity.session[data-status="done"]`)
                        .then(list => {
                            if (!liveGood || list.value.length < nDone) {
                                if (iter < 3) {
                                    // let's retry
                                    setTimeout(() => once(iter + 1), 5000)
                                } else {
                                    // fail fast
                                    assert.ok(liveGood)
                                    assert.equal(list.value.length, nDone)
                                }
                            } else if (list.value.length !== nDone) {
                                console.error('done does not match ' + list.value.length + ' != ' + nDone)
                                if (list.value.length < nDone && iter < 3) {
                                    // then let's retry
                                    setTimeout(() => once(iter + 1), 5000)
                                } else {
                                    // fail fast
                                    assert.equal(list.value.length, nDone)
                                }
                            } else {
                                // then both match
                                return true
                            }
                        })))

        return once(0).catch(common.oops(this));
    }

    const getSessions = (cmd, nLive, nDone) => it(`should list sessions via "${cmd}" nLive=${nLive} nDone=${nDone}`, () => doGetSessions(cmd, nLive, nDone))

    //
    // start of test suite
    //
    makeAction(actionName1, 'aa', 11, "x=>x")
    makeAction(actionName2, 'bb', 22, "x=>x")
    makeAction(actionName3, 'cc', 22, "x=>x")//"x=>new Promise(resolve => setTimeout(() => resolve(x), 20000))") // sleep, so we can get async and "live" session list

    /*it('should initialize composer', () => cli.do(`app init --url ${sharedURL} --cleanse`, this.app) // cleanse important here for counting sessions in `sessions`
        .then(cli.expectOKWithCustom({expect: 'Successfully initialized and reset the required services. You may now create compositions.'}))
       .catch(common.oops(this)))*/

    it('should throw a usage message for incomplete app create', () => cli.do(`app create ${seqName1}`, this.app)
        .then(cli.expectError(0, 'app create <name> <file.js|file.json>'))
       .catch(common.oops(this)))

    it('should throw a usage message for incomplete app create v2', () => cli.do(`app create`, this.app)
        .then(cli.expectError(0, 'app create <name> <file.js|file.json>'))
       .catch(common.oops(this)))

    it('should throw a usage message for incomplete app create v3', () => cli.do(`app create ./data/fsm.json`, this.app)
        .then(cli.expectError(0, 'app create <name> <file.js|file.json>'))
       .catch(common.oops(this)))

    it('should create a composer sequence', () => cli.do(`app create ${seqName1} ./data/fsm.json`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName1))
       .then(sidecar.expectBadge(badges.fsm))
       .catch(common.oops(this)))

    it('should create a packaged composer sequence', () => cli.do(`app create ${packageName1}/${seqName1} ./data/fsm.json`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName1, undefined, undefined, packageName1))
       .then(sidecar.expectBadge(badges.fsm))
       .catch(common.oops(this)))
    invoke({package: packageName1, action: seqName1}, 'x', 3, { aa: 11, bb: 22, cc: 22 })

    it('should create a composer sequence via app update', () => cli.do(`app update ${seqName1} ./data/fsm.json`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName1))
       .then(sidecar.expectBadge(badges.fsm))
       .catch(common.oops(this)))

    it('should create another composer sequence, via letc', () => cli.do(`letc ${seqName3} = ${actionName1} -> ${actionName3}`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName3))
       .then(sidecar.expectBadge(badges.sequence))
       .catch(common.oops(this)))

    /*getSessions('sessions list', 0, 0) // no sessions, yet
    getSessions('session list --skip 0', 0, 0) // no sessions, yet (intentional variant sessions->session)
    getSessions('session list --skip 0', 0, 0) // no sessions, yet
    getSessions('sessions list', 0, 0) // no sessions, yet (intentional variant session->sessions)
    getSessions('sess list', 0, 0) // no sessions, yet
    getSessions('ses list', 0, 0) // no sessions, yet*/

    getConfig('app config')

    // get some regular action, so we can test switching back to the composer action
    getAction(actionName1)

    it('should get the composer sequence via "app get"', () => cli.do(`app get ${seqName1}`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName1))
       .then(sidecar.expectBadge(badges.fsm))
       .then(() => this.app.client.getText(`${ui.selectors.SIDECAR_MODE_BUTTONS}`))
       .then(buttons => buttons.length > 0 && buttons.reduce((M, button) => {
           if (M[button]) {
               // duplicate button!!
               assert.fail('Duplicate mode button ' + button)
           } else {
               M[button] = true
           }
           return M
       }, {}))
       .catch(common.oops(this)))

    it('should get the composer sequence via "action get"', () => cli.do(`action get ${seqName1}`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName1))
       .then(sidecar.expectBadge(badges.fsm))
       .then(() => this.app.client.waitForVisible(`${ui.selectors.SIDECAR_MODE_BUTTON('visualization')}`))
       .catch(common.oops(this)))

    // mix it up!
    getConfig('app props')

    // get some regular action, so we can test switching back to the composer action
    getAction(actionName1)

    it('should throw a usage message for incomplete app get', () => cli.do(`app get`, this.app)
        .then(cli.expectError(0, 'app get <appName>'))
       .catch(common.oops(this)))

    // mix it up!
    getConfig('wsk app config')

    invoke(seqName1, 'x', 3, { aa: 11, bb: 22, cc: 22 })
    invoke(seqName1, 'x', 3, { aa: 11, bb: 22, cc: 22 }, false, 'invoke') // invoke via "invoke" rather than "app invoke"
    /*getSessions('session list', 0, 1) // 1 "done" session
    getSessions('session ls', 0, 1)   // 1 "done" session (testing ls alias)
    getSessions('sessions list --skip 1', 0, 0) // expect empty, if we skip 1 (since we expect 1 in total)
    getSessions('sess list', 0, 1)    //  1 "done" session*/

    invoke(seqName1, 'x', 3, { aa: 11, bb: 22, cc: 22 })
    /*getSessions('sessions list', 0, 2) // 2 "done" sessions
    getSessions('ses ls', 0, 2)        // 2 "done" sessions (testing aliases here)
    getSessions('session list --skip 1', 0, 1) // expect 1, if we skip 1 (since we expect 2 in total)
    getSessions('sessions list --skip 2', 0, 0) // expect 0, if we skip 2 (since we expect 2 in total)*/
    //getSessions('sessions --limit 0', 0, 0) // expect 0, if we limit 0 (since we expect 2 in total)
    //getSessions('sessions --limit 1', 0, 1) // expect 1, if we limit 1 (since we expect 2 in total)
    //getSessions('sessions --limit 2', 0, 2) // expect 2, if we limit 2 (since we expect 2 in total)
    /*getSessions('sess list', 0, 2) //  2 "done" session*/

    invoke(seqName1, 'x', 3, { aa: 11, bb: 22, cc: 22 })
    /*getSessions('session list', 0, 3) // 3 "done" sessions
    getSessions('sessions list --skip 1', 0, 2) // expect 2, if we skip 1 (since we expect 3 in total)*/
    //getSessions('sessions --limit 2', 0, 2) // expect 2, if we limit 2 (since we expect 3 in total)

    // mix it up!
    getConfig('app properties')
    getConfig('wsk app properties')
    getConfig('wsk app props')

    // do an async invocation, and look for 1 "live" in getSessions
    it(`should async ${seqName3}`, () => cli.do(`app async ${seqName3}`, this.app)  // async invoke
       .then(cli.expectOKWithCustom(cli.makeCustom('.activationId', '')))
       .then(selector => this.app.client.getText(selector)
             .then(activationId => Promise.resolve(true)/*doGetSessions('session list', 0, 3)*/      // expect 3 "done" sessions, 1 "live"
                   .then(() => cli.do(`await ${activationId}`, this.app)        // now wait for the invocation to complete
	               .then(cli.expectOK)
                         .then(sidecar.expectOpen)
                         .then(sidecar.expectShowing(seqName3)))))
       .catch(common.oops(this)))
    /*getSessions('session list', 0, 4)*/                                           // expect 4 "done" sessions, 0 "live"

    // create from source
    fs.readdirSync(srcDir).forEach((file,idx) => {
        const name = `${seqName2}-${idx}`

        if (file.endsWith('.js')) {
            it(`should create a composer sequence from source ${file}`, () => cli.do(`app create ${name} ${path.join(srcDir, file)}`, this.app)
	        .then(cli.expectOK)
               .then(sidecar.expectOpen)
               .then(sidecar.expectShowing(name))
               .then(sidecar.expectBadge(badges.composerLib))
               .catch(common.oops(this)))
        }
    })
})
