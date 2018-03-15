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

describe('Tab completion', function() {
    before(common.before(this))
    after(common.after(this))

    const tabby = (app, partial, full) => app.client.waitForExist(ui.selectors.CURRENT_PROMPT_BLOCK)
          .then(() => app.client.getAttribute(ui.selectors.CURRENT_PROMPT_BLOCK, 'data-input-count'))
          .then(count => parseInt(count))
          .then(count => app.client.keys(partial)
                .then(() => app.client.waitForValue(ui.selectors.PROMPT_N(count), partial))
                .then(() => app.client.keys('Tab'))
                .then(() => app.client.waitForValue(ui.selectors.PROMPT_N(count), full)))
          .then(() => cli.do('', app))
          .then(cli.expectJustOK)
          .catch(common.oops(this));

    const tabbyWithOptions = (app, partial, expected, choiceIdx, full) => app.client.waitForExist(ui.selectors.CURRENT_PROMPT_BLOCK)
          .then(() => app.client.getAttribute(ui.selectors.CURRENT_PROMPT_BLOCK, 'data-input-count'))
          .then(count => parseInt(count))
          .then(count => app.client.keys(partial)
                .then(() => app.client.waitForValue(ui.selectors.PROMPT_N(count), partial))
                .then(() => app.client.keys('Tab'))
                .then(() => app.client.getText(`${ui.selectors.PROMPT_BLOCK_N(count)} .tab-completion-temporary .clickable`))
                .then(ui.expectArray(expected))
                .then(() => app.client.click(`${ui.selectors.PROMPT_BLOCK_N(count)} .tab-completion-temporary > div[data-value="${expected[choiceIdx]}"] .clickable`))
                .then(() => app.client.waitForExist(`${ui.selectors.PROMPT_BLOCK_N(count)} .tab-completion-temporary`, 5000, true)) // wait for non-existence of the temporary
                .then(() => app.client.waitForValue(ui.selectors.PROMPT_N(count), full)))
          .then(() => cli.do('', app))
          .then(cli.expectJustOK)
          .catch(common.oops(this));

    const tabbyWithOptionsThenCancel = (app, partial, expected) => app.client.waitForExist(ui.selectors.CURRENT_PROMPT_BLOCK)
          .then(() => app.client.getAttribute(ui.selectors.CURRENT_PROMPT_BLOCK, 'data-input-count'))
          .then(count => parseInt(count))
          .then(count => app.client.keys(partial)
                .then(() => app.client.waitForValue(ui.selectors.PROMPT_N(count), partial))
                .then(() => app.client.keys('Tab'))
                .then(() => app.client.getText(`${ui.selectors.PROMPT_BLOCK_N(count)} .tab-completion-temporary .clickable`))
                .then(ui.expectArray(expected))
                .then(() => app.client.keys('ffffff')) // type something random
                .then(() => app.client.waitForExist(`${ui.selectors.PROMPT_BLOCK_N(count)} .tab-completion-temporary`, 5000, true))) // wait for non-existence of the temporary
          .catch(common.oops(this));

    it('should have an active repl', () => cli.waitForRepl(this.app))

    it('should tab complete the data directory', () => tabby(this.app, 'lls da', 'lls data/'))
    it('should tab complete the data/fsm.js file', () => tabby(this.app, 'lls data/fsm.js', 'lls data/fsm.json'))
    it('should tab complete the ../app directory', () => tabby(this.app, 'lls ../ap', 'lls ../app/'))

    const expected = ['commandFile.wsk',
                      'composer-source/',
                      'composer-source-expect-errors/',
                      'composer-wookiechat/']

    // tab completion with options, then click on the second (idx=1) entry of the expected cmpletion list
    it('should tab complete with options', () => tabbyWithOptions(this.app, 'lls data/com',
                                                                  expected,
                                                                  1, // click on the second entry
                                                                  'lls data/composer-source/')) // expect this to be the completed value

    it('should tab complete with options, then options go away on edit', () => tabbyWithOptionsThenCancel(this.app, 'lls data/com',
                                                                                                          expected))
})
