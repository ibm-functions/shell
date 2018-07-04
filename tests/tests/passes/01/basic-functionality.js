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

// A simple test to verify a visible window is opened with a title
const common = require('../../../lib/common'),
      assert = require('assert'),
      { validateNamespace} = require('../../../lib/ui'),
      timeout = process.env.TIMEOUT || 60000

const API_HOST = process.env.API_HOST || 'openwhisk.ng.bluemix.net',
      APP_TITLE = process.env.APP_TITLE || 'IBM Cloud Shell',
      CLI_PLACEHOLDER = process.env.CLI_PLACEHOLDER || 'enter your command'

const selectors ={
    APIHOST: '#openwhisk-api-host',
    NAMESPACE: '#openwhisk-namespace',
    PROMPT_BLOCK: '#main-repl .repl-active',
}
selectors.PROMPT = `${selectors.PROMPT_BLOCK} input`

describe('Basic Functionality', function() {
    before(common.before(this))
    after(common.after(this))

    const openWindow = app => app.client.getWindowCount()
          .then(count => assert.equal(count, 1))                       // Verify that one window is open
          .then(() => this.app.browserWindow.isVisible())              // Check if the window is visible
          .then(isVisible => assert.equal(isVisible, true))            // Verify the window is visible
          .then(() => app.client.getTitle())                           // Get the window's title
          .then(title => assert.equal(title, APP_TITLE))               // Verify the window's title

    it('shows an initial window', () => openWindow(this.app))

    it('has an initial focus on the CLI prompt', () =>
       assert.ok(this.app.client.hasFocus(selectors.PROMPT)))

    it('has the expected placeholder text in the CLI prompt', () =>
       this.app.client.getAttribute(selectors.PROMPT, 'placeholder')
       .then(attr => assert.equal(attr, CLI_PLACEHOLDER))
       .then(() => this.app.client.waitForValue(selectors.PROMPT, timeout, true)) // true: expect no value in the prompt input
       .catch(common.oops(this)))

    it('has a well-formed apihost', () =>
       this.app.client.waitForText(selectors.APIHOST, timeout)
       .then(() => this.app.client.getText(selectors.APIHOST))
       .then(apihost => {
	   // console.log('got apihost', apihost)
	   assert.equal(apihost.toLowerCase().replace(/^http[s]?:\/\//, ''), API_HOST.toLowerCase().replace(/^http[s]?:\/\//, ''))
       })
       .catch(common.oops(this)))

    it('has a well-formed namespace', () =>
       this.app.client.waitForText(selectors.NAMESPACE, timeout)
       .then(() => this.app.client.getText(selectors.NAMESPACE))
       .then(validateNamespace)
       .catch(common.oops(this)))
})

