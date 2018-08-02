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
      normalizeHTML = ui.normalizeHTML,
      assert = require('assert'),
      fs = require('fs'),
      rp = common.rp,
      keys = ui.keys,
      cli = ui.cli,
      sidecar = ui.sidecar,
      commandFile = 'data/commandFile.wsk',
      local = 'data/openwhisk-shell-demo-html'

const API_HOST = process.env.API_HOST || 'openwhisk.ng.bluemix.net',
      ns = ui.expectedNamespace()

/**
 * Make sure the given host is proper
 *
 */
const clean = host => {
    const parsed = require('url').parse(host)
    if (!parsed.protocol) {
        return `https://${host}`
    } else {
        return host
    }
}

describe('Execute a command file', function() {
    before(common.before(this))
    after(common.after(this))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    it('execute commands from a file', () => cli.do(`run ${commandFile}`, this.app)
	.then(cli.expectOKWithCustom({expect: 'Successfully executed 3 commands'}))
       .then(() => rp({ url: `${clean(API_HOST)}/api/v1/web/${ns}/public/hello.html`, rejectUnauthorized: false }))
       .then(content => fs.readFile(local, (err, data) => {
           if (err) throw err
           else assert.equal(normalizeHTML(content),
                             normalizeHTML(data).replace('nickm_wskng_test', `${ns}`))
       }))
       .catch(common.oops(this)))
})
