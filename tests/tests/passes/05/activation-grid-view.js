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
      //{ openTableExpectCountOf } = require('../05/activation-table-view'),
      keys = ui.keys,
      cli = ui.cli,
      sidecar = ui.sidecar,
      actionName = `activation-grid-${uuid()}`, // some unique name
      actionName2 = `activation-grid-${uuid()}`, // some unique name
      packageName = 'ppp',
      N = 1, // number of activation batches to fetch
      randomGarbage = `activation-grid-garbage-${uuid()}` // some unique name

describe('Activation grid visualization', () => {
    // disabled until the bluewhisk views finish updating 20170927
    return;

    before(common.before(this))
    after(common.after(this))

    const invoke = (inputValue, name=actionName, packageName) => {
        // action bombs with negative numbers
        const expectedStruct = inputValue < 0 ? { error: 'bomb!' } : { x: inputValue },
              fullName = packageName ? `${packageName}/${name}` : name

        it(`should invoke ${fullName} with -p x ${inputValue}`, () => cli.do(`wsk action invoke ${fullName} -p x ${inputValue}`, this.app)
            .then(cli.expectOK)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(name))
           .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
           .then(ui.expectStruct(expectedStruct))
           .catch(common.oops(this)))
    }
    const notbomb = (name, packageName) => invoke(+1, name, packageName)
    const bomb = (name, packageName) => invoke(-1, name, packageName)

    const verifyGrid = (expectedCount, expectedErrorCount, name=actionName, expectedTotalCount) => () => Promise.resolve()
          .then(() => {
              // expected number of success cells?
              if (expectedTotalCount === undefined || expectedTotalCount !== 0) {
                  // if we're waiting for cells, wait for at least one cell to appear before we do the validation checks on the counts
                  const selector = `${ui.selectors.SIDECAR_CUSTOM_CONTENT} .grid .grid-cell`
                  console.error(`Waiting for ${selector}`)
                  return this.app.client.waitForExist(selector, 5000)
              }
          })
          .then(() => this.app.client.elements(`${ui.selectors.SIDECAR_CUSTOM_CONTENT} .grid[data-action-name="${name}"] .grid-cell.is-failure-false`))
          .then(elements => assert.equal(elements.value.length, expectedCount)) // .elements() returns a WebElements structure, with a .value[] field

    // expected number of failure cells?
          .then(() => this.app.client.elements(`${ui.selectors.SIDECAR_CUSTOM_CONTENT} .grid[data-action-name="${name}"] .grid-cell.is-failure-true`))
          .then(elements => assert.equal(elements.value.length, expectedErrorCount))

           // expected total number of cells for the entire view?
          .then(() => {
              if (expectedTotalCount) {
                  return this.app.client.elements(`${ui.selectors.SIDECAR_CUSTOM_CONTENT} .grid .grid-cell.grid-cell-occupied`)
                      .then(elements => assert.equal(elements.value.length, expectedTotalCount))
              }
          })
        
    const openGridExpectCountOf = (expectedCount, expectedErrorCount, cmd, name=actionName, expectedTotalCount) => {
        const once = (iter, resolve, reject) => cli.do(cmd, this.app)
            .then(cli.expectOK)
              .then(sidecar.expectOpen)
              .then(verifyGrid(expectedCount, expectedErrorCount, name, expectedTotalCount))
              .then(resolve)
              .catch(err => {
                  if (iter < 10) {
                      console.error('retry!')
                      setTimeout(() => once(iter + 1, resolve, reject), 5000)
                  } else {
                      common.oops(this)(err)
                  }
              });
        
        it(`open activation grid, with name=${name} ${cmd} ec=${expectedCount} eec=${expectedErrorCount} etc=${expectedTotalCount}`, () => {
            return new Promise((resolve, reject) => once(0, resolve, reject))
        })
    }

    it('should have an active repl', () => cli.waitForRepl(this.app))

    it(`should create an action ${actionName} that bombs if the input value is negative`, () => cli.do(`let ${actionName} = ({x}) => x<0 ? {error:'bomb!'} : {x: x}`, this.app)
        .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName))
       .catch(common.oops(this)))

    // invoke with positive number, expect count of 1 in the table
    notbomb()
    openGridExpectCountOf(1, 0, `grid --batches ${N} -a`)
    openGridExpectCountOf(1, 0, `grid --batches ${N} -a --name ${actionName}`, actionName, 1)
    openGridExpectCountOf(0, 0, `grid --batches ${N} -a --name ${randomGarbage}`, actionName, 0)     // expect 0 cells, for a random action name
    openGridExpectCountOf(0, 0, `grid --batches ${N} -a --name ${randomGarbage}`, randomGarbage, 0)  // either way, there should be nothing

    // invoke again with positive, and then look for a count of 2
    notbomb()
    openGridExpectCountOf(0, 0, `$ grid --batches ${N} -a --name ${randomGarbage}`, randomGarbage, 0)  // expect 0 cells, for a random action name
    openGridExpectCountOf(2, 0, `$ grid --batches ${N} -a`)
    notbomb()
    openGridExpectCountOf(3, 0, `$ grid --batches ${N} -a --name ${actionName}`, actionName, 3)

    // invoke again with positive, and then look for a count of 3
    notbomb()
    openGridExpectCountOf(4, 0, `wsk activation grid --batches ${N} -a`)
    openGridExpectCountOf(0, 0, `wsk activation grid --batches ${N} -a --name ${randomGarbage}`, randomGarbage, 0)  // expect 0 cells, for a random action name
    bomb()
    openGridExpectCountOf(4, 1, `wsk activation grid --batches ${N} -a --name ${actionName}`, actionName, 5)

    // invoke again with negative, and then look for a count of 4, and error rate of 0.25
    bomb()
    openGridExpectCountOf(4, 2, `grid --batches ${N} -a`)
    openGridExpectCountOf(0, 0, `grid --batches ${N} -a --name ${randomGarbage}`, randomGarbage, 0)

    // click on grid cell
    openGridExpectCountOf(4, 2, `grid --batches ${N} -a --name ${actionName}`)
    it('should drill down to activation when grid cell is clicked', () => this.app.client.getAttribute(`${ui.selectors.SIDECAR_CUSTOM_CONTENT} .grid:first-child`, 'data-action-name')
       .then(actionName => this.app.client.click(`${ui.selectors.SIDECAR_CUSTOM_CONTENT} .grid-cell:first-child`)
             .then(() => this.app)
             .then(sidecar.expectOpen)
             .then(sidecar.expectShowing(actionName))
             .then(() => this.app.client.click(ui.selectors.SIDECAR_BACK_BUTTON))
             .then(() => this.app)
             .then(sidecar.expectOpen)
             .then(verifyGrid(4, 2)))
       .catch(common.oops(this)))

    const tableTest = (iter, resolve, reject) => cli.do(`table -a --name ${actionName}`, this.app)
        .then(cli.expectOK)
          .then(sidecar.expectOpen)
          .then(() => this.app.client.click(`${ui.selectors.SIDECAR_CUSTOM_CONTENT} tr[data-action-name="${actionName}"] .cell-label.clickable`))
          .then(() => this.app)
          .then(sidecar.expectOpen)
          .then(verifyGrid(4, 2))
          .then(resolve)
          .catch(err => {
              if (iter < 10) {
                  console.error('retry in tableTest')
                  setTimeout(() => tableTest(iter + 1, resolve, reject), 1000)
              } else {
                  common.oops(this)(err)
              }
          });
    it(`should open table view, click on table row, and observe switch to grid view actionName=${actionName}`, () => new Promise((resolve, reject) => tableTest(0, resolve, reject)))

    it(`should create a second action ${actionName2} that bombs if the input value is negative`, () => cli.do(`let ${actionName2} = ({x}) => x<0 ? {error:'bomb!'} : {x: x}`, this.app)
        .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName2))
       .catch(common.oops(this)))

    notbomb(actionName2)
    openGridExpectCountOf(1, 0, `grid --batches ${N} -a`, actionName2)
    openGridExpectCountOf(0, 0, `grid --batches ${N} -a --name ${randomGarbage}`, randomGarbage, 0)

    bomb(actionName2)
    openGridExpectCountOf(1, 1, `grid --batches ${N} -a`, actionName2)
    openGridExpectCountOf(0, 0, `grid --batches ${N} -a --name ${randomGarbage}`, randomGarbage, 0)

    openGridExpectCountOf(1, 1, `grid --batches ${N} -a`, actionName2)
    openGridExpectCountOf(0, 0, `grid --batches ${N} -a --name ${randomGarbage}`, randomGarbage, 0)

    // purposefully reuse actionName2, but within a package
    it(`should create a packaged action ${packageName}/${actionName2} that bombs if the input value is negative`, () => cli.do(`let ${packageName}/${actionName2} = ({x}) => x<0 ? {error:'bomb!'} : {x: x}`, this.app)
        .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName2, undefined, undefined, packageName))
       .catch(common.oops(this)))

    // invoke not-packed actionName2 again, and packaged
    // actionName2. open grid filtering just to packaged actionName2,
    // and expect 1 success cell
    notbomb(actionName2, packageName)
    notbomb(actionName2)
    openGridExpectCountOf(3, 1, `grid --batches 2 -a`, actionName2) // it was 1,1 last time, and we did one notbomb against actionName2 and one against packaged actionName2, hence 3,1
    openGridExpectCountOf(2, 1, `grid --batches 2 -a --name ${actionName2}`, actionName2) // it was 1,1 last time, and we did one notbomb, so expect 2,1 now
    notbomb(actionName2, packageName)
    openGridExpectCountOf(2, 0, `grid --batches 2 -a --name ${packageName}/${actionName2}`, actionName2) // we've done two notbombs against the packaged actionName2, hence 2,0
})
