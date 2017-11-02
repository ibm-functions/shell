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
      sidecar = ui.sidecar,
      actionName1 = 'foo1',
      actionName1b = 'foo1b',
      actionName2 = 'foo2',
      actionName2b = 'foo2b',
      packageName1 = 'ppp1',
      packageName2 = 'ppp2',
      packageName3 = 'ppp3',
      key1 = 'foo',
      value1= 'bar'

describe('Use cp to copy entities', function() {
    before(common.before(this))
    after(common.after(this))

    it('should have an active repl', () => cli.waitForRepl(this.app))

    const cp = (a,b,aPackage,bPackage) => {
        // pass this key-value pair to the invocation
        const key = 'name',
              value = `whisker ${a} to ${b}`,
              expect = {},
              expectAnnotations = {},
              aFull = `${aPackage ? aPackage + '/' : ''}${a}`,
              bFull = `${bPackage ? bPackage + '/' : ''}${b}`

        // expected return value, as struct
        expect[key] = value   // passed to this invocation
        expect[key1] = value1 // bound to the original action; make sure it survives the copy
        expectAnnotations[key1] = value1

        it(`should copy ${aFull} to ${bFull}`, () => cli.do(`cp ${aFull} ${bFull}`, this.app)
	    .then(cli.expectJustOK)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(b, undefined, undefined, bPackage))
           .catch(common.oops(this)))

        // verify that annotations survived the copy
        it('should switch to annotations mode', () => cli.do('annotations', this.app)
            .then(cli.expectJustOK)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(b, undefined, undefined, bPackage))
           .then(app => app.client.getText(`${ui.selectors.SIDECAR_CONTENT} .action-source`))
           .then(ui.expectSubset(expectAnnotations)))

        // invoke the copy
        it(`should invoke the copied action ${bFull}`, () => cli.do(`invoke -p "${key}" "${value}"`, this.app)
	    .then(cli.expectJustOK)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(b))
           .then(() => this.app.client.getText(ui.selectors.SIDECAR_ACTIVATION_RESULT))
           .then(ui.expectStruct(expect)))

        // verify that the original still exists
        it(`${aFull} should still exist`, () => cli.do(`wsk action get ${aFull}`, this.app)
	    .then(cli.expectJustOK)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(a, undefined, undefined, aPackage))
           .catch(common.oops(this)))

        // verify that original annotations survived the copy
        it('should switch to annotations mode', () => cli.do('annotations', this.app)
            .then(cli.expectJustOK)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(a, undefined, undefined, aPackage))
           .then(app => app.client.getText(`${ui.selectors.SIDECAR_CONTENT} .action-source`))
           .then(ui.expectSubset(expectAnnotations)))
    }


    // COPY ACTION
    it('should create an action via let', () => cli.do(`let ${actionName1} = x=>x -p ${key1} ${value1} -a ${key1} ${value1}`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName1))
       .catch(common.oops(this)))
    cp(actionName1, actionName1b)

    // COPY PACKAGED ACTION TO NON-PACKAGED ACTION
    it('should create a packaged action via let', () => cli.do(`let ${packageName1}/${actionName2}.js = x=>x -p ${key1} ${value1} -a ${key1} ${value1}`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(actionName2, undefined, undefined, packageName1))
       .catch(common.oops(this)))
    cp(actionName2, actionName2b, packageName1)

    // COPY PACKAGED ACTION TO PACKAGED ACTION, existing package
    it('should create a package', () => cli.do(`wsk package update ${packageName2}`, this.app)
	.then(cli.expectJustOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(packageName2))
       .catch(common.oops(this)))
    cp(actionName2, actionName2b, packageName1, packageName2)

    // COPY PACKAGED ACTION TO PACKAGED ACTION, new package
    cp(actionName2, actionName2b, packageName1, packageName3)
})
