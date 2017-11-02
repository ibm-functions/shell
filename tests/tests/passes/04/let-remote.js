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

const fs = require('fs'),
      del = require('del'),
      common = require('../../../lib/common'),
      rp = common.rp,
      openwhisk = require('../../../lib/openwhisk'),
      ui = require('../../../lib/ui'),
      normalizeHTML = ui.normalizeHTML,
      assert = require('assert'),
      keys = ui.keys,
      cli = ui.cli,
      sidecar = ui.sidecar,
      REMOTE1 = {
          url: 'https://ibm.box.com/shared/static/8eraoo66gza7rbd7xxi2nal7v9jav8wf.html',
          local: 'data/hello.html'
      },
      REMOTE2 = {
          url: 'http://ibm.biz/openwhisk-shell-demo-html',
          local: 'data/openwhisk-shell-demo-html'
      },
      actionName = 'foo',
      actionName2 = 'foo2',
      actionName3 = 'foo3',
      actionName4 = 'foo4',
      actionName5 = 'foo5',
      actionName6 = 'foo6',
      packageName = 'ppp',
      packageName2 = 'ppp2',
      packageName3 = 'ppp3'

describe('Create an action via let from a remote resource', () => {
    before(common.before(this))
    after(common.after(this))

    const doCreate = remote => (actionName, extension='', packageName) => () => {
        return cli.do(`let ${packageName ? packageName + '/' : ''}${actionName}${extension} = ${remote.url}`, this.app)
            .then(cli.expectOKWithCustom({ selector: '.entity-web-export-url' }))
            .then(selector => this.app.client.getText(selector))
            .then(href => rp({ url: href, rejectUnauthorized: false }))
            .then(content => fs.readFile(remote.local, (err, data) => {
                if (err) throw err
                else assert.equal(normalizeHTML(content),
                                  normalizeHTML(data).replace('nickm_wskng_test', ui.expectedNamespace()))
            }))
            .then(() => this.app)
            .then(sidecar.expectOpen)
            .then(sidecar.expectShowing(actionName, undefined, undefined, packageName))
    }

    const doCreate1 = doCreate(REMOTE1),
          doCreate2 = doCreate(REMOTE2)

    it('should have an active repl', () => cli.waitForRepl(this.app))

    it('should create an action from a remote resource', doCreate1(actionName))
    it('should create an action from a remote resource, with extension', doCreate1(actionName2, '.html'))
    it('should create an action from a remote resource, with extension and package name', doCreate1(actionName3, '.html', packageName))
    it('should create an action from a remote resource, without extension, with package name', doCreate1(actionName4, '', packageName2))

    it('should create an action from a remote resource that has no extension', doCreate2(actionName5, '.html'))
    it('should create an action from a remote resource that has no extension, with package name', doCreate2(actionName6, '.html', packageName3))
})
