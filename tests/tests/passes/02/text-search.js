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
      sidecar = ui.sidecar

describe('Text search', function() {
    before(common.before(this))
    after(common.after(this))

    it('should open the search bar when cmd+f is pressed', () => this.app.client.keys([ui.ctrlOrMeta, 'f'])
       .then(() => this.app.client.isVisible('#search-bar'))
       .then(r => assert.ok(r, 'search-bar visible'))
       .catch(common.oops(this)))

    it('should not close the search bar if pressing esc outside of search input', () => this.app.client.click(ui.selectors.CURRENT_PROMPT_BLOCK)
       .then(() => this.app.client.keys('\uE00C'))
       .then(() => this.app.client.isVisible('#search-bar'))
       .then(r => assert.ok(r, 'assert if search-bar is visible'))
       .catch(common.oops(this)))

    it('should focus on search input when search input is pressed', () => this.app.client.click('#search-input')
       .then(() => this.app.client.hasFocus('#search-input'))
       .then(r => assert.ok(r, 'assert if search-input is focused'))
       .catch(common.oops(this)))

    it('should close the search bar if pressing esc in search input', () => this.app.client.setValue('#search-input', '\uE00C')
       .then(() => this.app.client.waitForVisible('#search-bar', 2000, false))
       .catch(common.oops(this)))

    // re-open, so that we can test the close button
    it('should open the search bar when cmd+f is pressed', () => this.app.client.keys([ui.ctrlOrMeta, 'f'])
       .then(() => this.app.client.isVisible('#search-bar'))
       .then(r => assert.ok(r, 'search-bar visible'))
       .catch(common.oops(this)))

    it('should close the search bar if clicking the close button', () => this.app.client.click('#search-close-button')
       .then(() => this.app.client.waitForVisible('#search-bar', 2000, false))
       .catch(common.oops(this)))
})
