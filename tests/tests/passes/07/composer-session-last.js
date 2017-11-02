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
      badges = require(path.join(__dirname, '../../../../app/plugins/modules/composer/lib/badges.js')),
      sharedURL = process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      keys = ui.keys,
      cli = ui.cli,
      sidecar = ui.sidecar,
      seqName1 = 'seq1',
      seqName2 = 'seq2',
      seqName3 = 'seq3'

describe('session get --last and --last-failed', function() {
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

    it('should initialize composer', () => cli.do(`app init --url ${sharedURL} --cleanse`, this.app) // cleanse important here for counting sessions in `sessions`
        .then(cli.expectOKWithCustom({expect: 'Successfully initialized and reset the required services. You may now create compositions.'}))
       .catch(common.oops(this)))

    it('create sequence that invokes without error', () => cli.do(`letc ${seqName1} = x=>x -> x=>x`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName1))
       .then(sidecar.expectBadge(badges.sequence))
       .catch(common.oops(this)))

    it(`should invoke ${seqName1}`, () => cli.do(`app invoke ${seqName1} -p xxx 333`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName1))
       .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
       .then(ui.expectStruct({xxx:333}))
       .catch(common.oops(this)))

    it('create sequence that invokes WITH ERROR', () => cli.do(`letc ${seqName2} = x=>x -> x=>({error:x})`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName2))
       .then(sidecar.expectBadge(badges.sequence))
       .catch(common.oops(this)))

    it(`should show ${seqName1} with session get --last`, () => cli.do(`session get --last`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName1))
       .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
       .then(ui.expectStruct({xxx:333}))
       .catch(common.oops(this)))

    it('create another sequence that invokes without error', () => cli.do(`letc ${seqName3} = x=>x -> x=>x`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName3))
       .then(sidecar.expectBadge(badges.sequence))
       .catch(common.oops(this)))

    it(`should invoke ${seqName3}`, () => cli.do(`app invoke ${seqName3} -p zzz 555`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName3))
       .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
       .then(ui.expectStruct({zzz:555}))
       .catch(common.oops(this)))

    it(`should show ${seqName1} with session get --last ${seqName1}`, () => cli.do(`session get --last ${seqName1}`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName1))
       .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
       .then(ui.expectStruct({xxx:333}))
       .catch(common.oops(this)))

    it(`should show ${seqName3} with session get --last`, () => cli.do(`session get --last`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName3))
       .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
       .then(ui.expectStruct({zzz:555}))
       .catch(common.oops(this)))

    it(`should invoke ${seqName2}`, () => cli.do(`app invoke ${seqName2} -p yyy 444`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpenWithFailure)
       .then(sidecar.expectShowing(seqName2))
       .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
       .then(ui.expectStruct({error: {yyy:444}}))
       .catch(common.oops(this)))

    it(`should show ${seqName1} with session get --last ${seqName1}`, () => cli.do(`session get --last ${seqName1}`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName1))
       .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
       .then(ui.expectStruct({xxx:333}))
       .catch(common.oops(this)))

    it(`should show ${seqName2} with session get --last-failed`, () => cli.do(`session get --last-failed`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName2))
       .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
       .then(ui.expectStruct({error: {yyy:444}}))
       .catch(common.oops(this)))

    it(`should invoke ${seqName3}`, () => cli.do(`app invoke ${seqName3} -p zzz 555`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName3))
       .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
       .then(ui.expectStruct({zzz:555}))
       .catch(common.oops(this)))

    it(`should show ${seqName2} with session get --last-failed`, () => cli.do(`session get --last-failed`, this.app)
	.then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName2))
       .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
       .then(ui.expectStruct({error: {yyy:444}}))
       .catch(common.oops(this)))
})
