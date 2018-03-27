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
      assert = require('assert')

const path = require('path'),
      { exec } = require('child_process'),
      fsh = path.join(__dirname, '../../../../app/bin/fsh')

const cli = {
    do: cmd => new Promise((resolve, reject) => {
        const command = `${fsh} ${cmd} --no-color`

        exec(command, (err, stdout, stderr) => {
            if (err) {
                resolve({ code: err.code, output: stderr })
            } else {
                resolve({ code: 0, output: stdout })
            }
        })
    }),

    expectOK: (expectedOutput, { exact=false, skipLines=0, squish=false }={}) => ({code:actualCode, output:actualOutput}) => {
        assert.equal(actualCode, 0)
        if (expectedOutput) {
            let checkAgainst = actualOutput

            // skip a number of initial lines?
            if (skipLines > 0) {
                checkAgainst = checkAgainst.split(/\n/).slice(1).join('\n')
            }

            // squish whitespace?
            if (squish) {
                checkAgainst = checkAgainst.split(/\n/).map(_ => _.replace(/\s+/g, ' ').trim()).join('\n').trim()
            }

            if (exact) {
                if (checkAgainst !== expectedOutput) {
                    console.error(`mismatch; actual='${actualOutput}'; expected='${checkAgainst}'`)
                }
                assert.equal(checkAgainst, expectedOutput)
            } else {
                const ok = actualOutput.indexOf(checkAgainst) >= 0
                if (!ok) {
                    console.error(`mismatch; actual='${actualOutput}'; expected='${checkAgainst}'`)
                }
                assert.ok(ok)
            }
        }
        return actualOutput
    },
    expectError: (expectedCode, expectedOutput) => ({code:actualCode, output:actualOutput}) => {
        assert.equal(actualCode, expectedCode)
        if (expectedOutput) {
            const ok = actualOutput.indexOf(expectedOutput) >= 0
            if (!ok) {
                console.error(`mismatch; actual='${actualOutput}'; expected='${expectedOutput}'`)
            }
            assert.ok(ok)
        }
        return actualOutput
    }
}

describe('Headless mode', function() {
    before(common.before(this, { noApp: true }))

    it('should list sessions', () => cli.do('session list')
       .then(cli.expectOK('ok'))
       .catch(common.oops(this)))

    it('should show top-level help with no arguments', () => cli.do('')
       .then(cli.expectError(1, 'Shell Docs / Getting Started'))
       .catch(common.oops(this)))

    it('should show top-level help with help', () => cli.do('help')
       .then(cli.expectError(1, 'Shell Docs / Getting Started'))
       .catch(common.oops(this)))

    it('should show wsk help with wsk', () => cli.do('wsk')
       .then(cli.expectError(1, 'Shell Docs / OpenWhisk'))
       .catch(common.oops(this)))

    it('should show wsk help with wsk help', () => cli.do('wsk help')
       .then(cli.expectError(1, 'Shell Docs / OpenWhisk'))
       .catch(common.oops(this)))

    const listers = ['action list', 'wsk action list', 'ls']
    listers.forEach(ls => {
        it(`should show empty ${ls}`, () => cli.do(ls)
           .then(cli.expectOK('', { exact: true }))
           .catch(common.oops(this)))
    })

    it('should create an action', () => cli.do('action create foo ./data/foo.js')
       .then(cli.expectOK('ok: updated action foo\n', { exact: true }))
       .catch(common.oops(this)))

    listers.forEach(ls => {
        it(`should show one-entry ${ls}`, () => cli.do(ls)
           .then(cli.expectOK('foo private nodejs:6 0.0.1', { exact: true, skipLines: 1, squish: true }))
           .catch(common.oops(this)))
    })

    it('should create an app', () => cli.do('app create seq ./data/fsm.json')
       .then(cli.expectOK('ok: updated app seq\n', { exact: true }))
       .catch(common.oops(this)))
})
