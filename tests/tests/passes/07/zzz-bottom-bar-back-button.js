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

//
// tests that create an action and test that it shows up in the list UI
//    this test also covers toggling the sidecar
//
const uuid = require('uuid/v4'),
      common = require('../../../lib/common'),
      openwhisk = require('../../../lib/openwhisk'),
      ui = require('../../../lib/ui'),
      assert = require('assert'),
      keys = ui.keys,
      cli = ui.cli,
      sidecar = ui.sidecar,
      //sharedURL = process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      actionName1 = `bottom-bar-back-button-test-${uuid()}`,
      actionName2 = `bottom-bar-back-button-test-${uuid()}`,
      seqName1 = 'seq1',
      //cell1 = `${ui.selectors.SIDECAR_CUSTOM_CONTENT} .grid[data-action-name="${actionName1}"] .grid-cell`,
      //cell2 = `${ui.selectors.SIDECAR_CUSTOM_CONTENT} .grid[data-action-name="${actionName2}"] .grid-cell`
      cell1 = `${ui.selectors.SIDECAR_CUSTOM_CONTENT} .grid:first-child .grid-cell:first-child`,
      cell2 = `${ui.selectors.SIDECAR_CUSTOM_CONTENT} .grid:first-child .grid-cell:last-child`

describe('Bottom bar back button functionality', function() {
    before(common.before(this))
    after(common.after(this), () => cli.do(`wsk rule rm ${ruleName}`))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    /*{
        const cmd = `app init --reset --url ${sharedURL}`
        it(`should ${cmd}`, () => cli.do(cmd, this.app)
            .then(cli.expectOKWithCustom({expect: 'Successfully initialized the required services. You may now create compositions.'}))
           .catch(common.oops(this)))
    }*/

    it('should create a composer sequence', () => cli.do(`letc ${seqName1} = x=>x -> x=>x`, this.app)
        .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(seqName1))
       .catch(common.oops(this)))

    const node1 = `${ui.selectors.SIDECAR_CUSTOM_CONTENT} .node.action[data-deployed="deployed"]:nth-of-type(3)`,
          node2 = `${ui.selectors.SIDECAR_CUSTOM_CONTENT} .node.action[data-deployed="deployed"]:nth-of-type(4)`
    it('should click on the first node', () => {
        return this.app.client.waitForVisible(node1)
            .then(() => this.app.client.getAttribute(node1, 'data-name'))
            .then(path => path.substring(path.lastIndexOf('/') + 1))
            .then(actionName => this.app.client.click(node1)
                  .then(() => this.app)
                  .then(sidecar.expectOpen)
                  .then(sidecar.expectShowing(actionName)))
            .then(() => this.app.client.click(ui.selectors.SIDECAR_BACK_BUTTON))
            .then(() => this.app)
            .then(sidecar.expectShowing(seqName1))
            .catch(common.oops(this));
    })

    it('should click on the second node', () => {
        return this.app.client.waitForVisible(node2)
            .then(() => this.app.client.getAttribute(node2, 'data-name'))
            .then(path => path.substring(path.lastIndexOf('/') + 1))
            .then(actionName => this.app.client.click(node2)
                  .then(() => this.app)
                  .then(sidecar.expectOpen)
                  .then(sidecar.expectShowing(actionName)))
            .then(() => this.app.client.click(ui.selectors.SIDECAR_BACK_BUTTON))
            .then(() => this.app)
            .then(sidecar.expectShowing(seqName1))
            .catch(common.oops(this))
    })
    
    /*it(`should create an action ${actionName1}`, () => cli.do(`let ${actionName1} = x=>x`, this.app)
        .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName1))
       .catch(common.oops(this)))

    it(`should invoke ${actionName1}`, () => cli.do(`invoke ${actionName1} -p x 3`, this.app)
        .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName1))
       .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
       .then(ui.expectStruct({x:3}))
       .catch(common.oops(this)))

    it(`should create an action ${actionName2}`, () => cli.do(`let ${actionName2} = x=>x`, this.app)
        .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName2))
       .catch(common.oops(this)))

    it(`should invoke ${actionName2}`, () => cli.do(`invoke ${actionName2} -p y 9`, this.app)
        .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName2))
       .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
       .then(ui.expectStruct({y:9}))
       .catch(common.oops(this)))*/

    it(`should open grid, click on some cell, and come back`, () => {
        const once = iter => cli.do('grid', this.app)
            .then(cli.expectOK)
              .then(sidecar.expectOpen)
              .then(sidecar.expectShowing('Recent Activity'))

               // find cell1, click, then click back
              .then(() => this.app.client.getAttribute(cell1, 'data-action-name'))
              .then(actionName => this.app.client.click(cell1)
                    .then(() => this.app)
                    .then(sidecar.expectShowing(actionName)))
              .then(() => this.app.client.click(ui.selectors.SIDECAR_BACK_BUTTON))
              .then(() => this.app)
              .then(sidecar.expectShowing('Recent Activity'))

              .catch(err => {
                  console.error(err)
                  if (iter < 20) {
                      return once(iter + 1)
                  } else {
                      common.oops(this)(err)
                  }
              })

        return once(0)
    })

    it(`should open grid, click on ${actionName2}, and come back, then ${actionName1}, and come back`, () => {
        const once = iter => cli.do('grid', this.app)
            .then(cli.expectOK)
              .then(sidecar.expectOpen)
              .then(sidecar.expectShowing('Recent Activity'))

              // find cell1, click, then click back
              .then(() => this.app.client.getAttribute(cell1, 'data-action-name'))
              .then(actionName => this.app.client.click(cell1)
                    .then(() => this.app)
                    .then(sidecar.expectShowing(actionName)))
              .then(() => this.app.client.click(ui.selectors.SIDECAR_BACK_BUTTON))
              .then(() => this.app)
              .then(sidecar.expectShowing('Recent Activity'))

              // find cell2, click, then click back
              .then(() => this.app.client.getAttribute(cell2, 'data-action-name'))
              .then(actionName => this.app.client.click(cell2)
                    .then(() => this.app)
                    .then(sidecar.expectShowing(actionName)))
              .then(() => this.app.client.click(ui.selectors.SIDECAR_BACK_BUTTON))
              .then(() => this.app)
              .then(sidecar.expectShowing('Recent Activity'))

              .catch(err => {
                  console.error(err)
                  if (iter < 20) {
                      return once(iter + 1)
                  } else {
                      common.oops(this)(err)
                  }
              })

       return once(0)
    })
})
