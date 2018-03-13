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

const uuid = require('uuid').v4,
      common = require('../../../lib/common'),
      openwhisk = require('../../../lib/openwhisk'),
      ui = require('../../../lib/ui'),
      assert = require('assert'),
      keys = ui.keys,
      cli = ui.cli,
      sidecar = ui.sidecar,
      actionName = `activation-table-${uuid()}` // some unique name

const parsesAsInteger = str => {
    try {
        parseInt(str)
        return true
    } catch (e) {
        return false
    }
}
const isInteger = str => typeof str === 'number' || parsesAsInteger(str)

const openTableExpectCountOf = function(ctx, expectedCount, expectedErrorRate, cmd) {
    const view = `${ui.selectors.SIDECAR_CUSTOM_CONTENT} .activation-viz-plugin`,
          row = `${view} tr[data-action-name="${actionName}"]`,
          successCell = `${row} .cell-successes.cell-hide-when-outliers-shown`,
          failureCell = `${row} .cell-failures.cell-hide-when-outliers-shown`,
          bar = `${row} .stat-bar`,
          focusLabel = `${view} .table-header .x-axis-focus-label`,
          outliersButton = `${view} li[data-choice="outliers"]`,
          outlierDots = `${view} .outlier-dot`

    const once = (iter, resolve, reject) => cli.do(cmd, ctx.app)
        .then(cli.expectOK)
          .then(sidecar.expectOpen)
          .then(() => ctx.app.client.getText(successCell))
          .then(actualCount => assert.equal(actualCount, expectedCount))

          .then(() => ctx.app.client.getAttribute(failureCell, 'data-failures'))
          .then(actualErrorRate => assert.equal(actualErrorRate, expectedErrorRate))

          // hover over a bar, expect focus labels
          .then(() => ctx.app.client.moveToObject(bar, 5, 5))
          .then(() => ctx.app.client.waitForVisible(focusLabel))

          // click outliers button
          .then(() => ctx.app.client.click(outliersButton))
          .then(() => {
              if (expectedCount > 8) {
                  return ctx.app.client.waitForVisible(outlierDots)
              }
          })

          /*.then(() => ctx.app.client.getAttribute(`${ui.selectors.SIDECAR_CUSTOM_CONTENT} tr[data-action-name="${actionName}"] .cell-stat`, 'data-value'))
          .then(stats => assert.equal(stats.length, 5) && stats.reduce((okSoFar,stat) => ok && isInteger(stat), true))*/

    // return the selector
          .then(() => `${ui.selectors.SIDECAR_CUSTOM_CONTENT} tr[data-action-name="${actionName}"]`)
          .then(resolve)
          .catch(err => {
              if (iter < 10) {
                  setTimeout(() => once(iter + 1, resolve, reject), 1000)
              } else {
                  common.oops(ctx)(err)
              }
          });

    it(`open activation table, with ${cmd}`, () => new Promise((resolve, reject) => once(0, resolve, reject)))
}
exports.openTableExpectCountOf = openTableExpectCountOf

describe('Activation table visualization', function() {
    before(common.before(this))
    after(common.after(this))

    const invoke = (inputValue=1) => {
        // action bombs with negative numbers
        const expectedStruct = inputValue < 0 ? { error: 'bomb!' } : { x: inputValue }

        it('should invoke the action with explicit action name', () => cli.do(`wsk action invoke ${actionName} -p x ${inputValue}`, this.app)
            .then(cli.expectOK)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(actionName))
           .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
           .then(ui.expectStruct(expectedStruct))
           .catch(common.oops(this)))
    }
    const notbomb = () => invoke(+1)
    const bomb = () => invoke(-1)

    /*const openSplitTableExpectCountsOf = (expectedCountA, expectedErrorRateA,
                                          expectedCountB, expectedErrorRateB,
                                          cmd) => {
        it(`open activation table, with ${cmd}`, () => cli.do(cmd, this.app)
            .then(cli.expectOK)
           .then(sidecar.expectOpen)

           .then(() => this.app.client.getText(`${ui.selectors.SIDECAR_CUSTOM_CONTENT} tr[data-action-name="${actionName} v0.0.1"] .cell-count`))
           .then(actualCountA => assert.equal(actualCountA, expectedCountA))
           .then(() => this.app.client.getAttribute(`${ui.selectors.SIDECAR_CUSTOM_CONTENT} tr[data-action-name="${actionName} v0.0.1"] .cell-errorRate`, 'data-value'))
           .then(actualErrorRateA => assert.equal(actualErrorRateA, expectedErrorRateA))

           .then(() => this.app.client.getText(`${ui.selectors.SIDECAR_CUSTOM_CONTENT} tr[data-action-name="${actionName} v0.0.2"] .cell-count`))
           .then(actualCountB => assert.equal(actualCountB, expectedCountB))
           .then(() => this.app.client.getAttribute(`${ui.selectors.SIDECAR_CUSTOM_CONTENT} tr[data-action-name="${actionName} v0.0.2"] .cell-errorRate`, 'data-value'))
           .then(actualErrorRateB => assert.equal(actualErrorRateB, expectedErrorRateB))
           .catch(common.oops(this)))
    }*/

    it('should have an active repl', () => cli.waitForRepl(this.app))

    it(`should create the action that bombs if the input value is negative ${actionName}`, () => cli.do(`let ${actionName} = ({x}) => x<0 ? {error:'bomb!'} : {x: x}`, this.app)
        .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName))
       .catch(common.oops(this)))

    // invoke with positive number, expect count of 1 in the table
    notbomb()
    openTableExpectCountOf(this, 1, 0, 'summary')
    openTableExpectCountOf(this, 1, 0, 'summary --auto')
    openTableExpectCountOf(this, 1, 0, 'summary --batches 10')

    // invoke again with positive, and then look for a count of 2
    notbomb()
    openTableExpectCountOf(this, 2, 0, 'summary')
    openTableExpectCountOf(this, 2, 0, 'summary --batches 10')

    // invoke again with positive, and then look for a count of 3
    notbomb()
    openTableExpectCountOf(this, 3, 0, 'summary')
    openTableExpectCountOf(this, 3, 0, 'summary --batches 10')

    // invoke again with negative, and then look for a count of 4, and error rate of 0.25
    bomb()
    openTableExpectCountOf(this, 3, 1, 'summary')
    openTableExpectCountOf(this, 3, 1, 'summary --batches 10')

    // force a version update
    it('should create the action that bombs if the input value is negative', () => cli.do(`let ${actionName} = ({x}) => x<0 ? {error:'bomb!'} : {x: x}`, this.app)
        .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName))
       .catch(common.oops(this)))

    notbomb()
    notbomb()
    notbomb()
    bomb()
    bomb()
    bomb()
    openTableExpectCountOf(this, 6, 4, `summary ${actionName}`) // 10 total activations, 4 of which failed
    /*openSplitTableExpectCountsOf(4, 0.25, // the previous version counts should not be changed from when we last checked
                                 6, 0.5,  // we've made 6 invocations against the new version, 3 of which failed
                                 `summary -a --split --name ${actionName}`)*/

    it(`should load test ${actionName}`, () => cli.do(`lt ${actionName}`, this.app)
       .catch(common.oops(this)))
    
    openTableExpectCountOf(this, 46, 4, `summary ${actionName}`) // 46 successful activations, 4 of which failed
})
