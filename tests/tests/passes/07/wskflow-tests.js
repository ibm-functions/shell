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
      common = require('../../../lib/common'),
      openwhisk = require('../../../lib/openwhisk'),
      ui = require('../../../lib/ui'),
      cli = ui.cli,
      sidecar = ui.sidecar,
      keys = ui.keys,      
      assert = require('assert'),
      //sharedURL = process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      {
          input,
          composerInput,
          verifyNodeExists,
          verifyNodeStatusExists,
          verifyNodeExistsById,
          verifyEdgeExists,
          verifyOutgoingEdgeExists,
          verifyNodeLabelsAreSane,
          verifyTheBasicStuff
      } = require('../../../lib/composer-viz-util')

/**
 * Here starts the test
 *
 */
// test if the graph is by default zoom to fit 
describe('bring up the composer visualization when the sidecar is minimized', function() {
    before(common.before(this))
    after(common.after(this))

    it('should have an active repl', () => this.app.client.waitForText('#openwhisk-api-host', 60000))

    it('should show the if composition graph', () => cli.do('preview data/composer-source/if.js', this.app)
      .then(verifyTheBasicStuff('if.js', 'composerLib'))  // verify basic things
      .catch(common.oops(this)))

    it('should minimize the sidecar', () => this.app.client.keys(keys.ESCAPE)
      .then(() => sidecar.expectClosed(this.app))
      .catch(common.oops(this)))

    it('should show the if composition graph again', () => cli.do('app preview data/composer-source/if.js', this.app)
      .then(() => sidecar.expectOpen(this.app))
      .catch(common.oops(this)))

    it('should use viewBox to let the graph fit the container', () => this.app.client.waitForExist('#wskflowSVG[viewBox]', 3000))


});

// test if app preview update a graph when the watched file gets updated 
describe('app preview should actively watching an external file', function() {
    before(common.before(this))
    after(common.after(this))
    let tempFileName = 'testtemp.js';
    it('should have an active repl', () => this.app.client.waitForText('#openwhisk-api-host', 60000))

    it('should write composer.sequence("a", "b") to a temp file', () => {
      return new Promise((resolve, reject) => {
        fs.writeFile(tempFileName, `composer.sequence("a", "b")`, (err) => {
          if(err)
            reject(err);
          else
            resolve(true);
        });
      });
    });

    it('should preview the temp file', () => cli.do(`preview ${tempFileName}`, this.app)
      .then(verifyTheBasicStuff(tempFileName, 'composerLib'))  // verify basic things
      .then(verifyNodeExists('a'))
      .then(verifyNodeExists('b'))
      .catch(common.oops(this)))

    it('should update the temp file to composer.sequence("a", "c")', () => {
      return new Promise((resolve, reject) => {
        fs.writeFile(tempFileName, `composer.sequence("a", "c")`, (err) => {
          if(err)
            reject(err);
          else
            resolve(true);
        });
      });
    });

    it('should update preview', () => verifyNodeExists('a')(this.app)
      .then(verifyNodeExists('c'))
      .catch(common.oops(this)))

    it('should delete the temp file', () => {
      return new Promise((resolve, reject) => {
        fs.unlink(tempFileName, (err) => {
          if(err)
            reject(err);
          else
            resolve(true);
        });
      });
    });

    it('should preview the temp file and throw file not found error', () => cli.do(`preview ${tempFileName}`, this.app)
    .then(cli.expectError(0, 'The specified file does not exist'))
    .catch(common.oops(this)))
    
});


// test if session flow highlighting is correct
describe('create a if composition, invoke, verify session flow is shown correctly', function() {
    before(common.before(this))
    after(common.after(this))
    const appName = 'test-if', appFile = 'data/composer-source/if-session.js';
    it('should have an active repl', () => this.app.client.waitForText('#openwhisk-api-host', 60000))

    it(`should create an app with ${appFile}`, () => cli.do(`app create ${appName} ${appFile}`, this.app)
      .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(appName))
       .catch(common.oops(this)))

    it(`should invoke ${appName} with condition equals true`, () => cli.do(`app invoke ${appName} -p condition true`, this.app)
      .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .catch(common.oops(this)))

    it(`should be able to click on the mode button to switch to session flow, and see the true path highlighted`, () => this.app.client.click(ui.selectors.SIDECAR_MODE_BUTTON('visualization'))
      .then(() => this.app)           
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(appName))
           .then(app => app.client.waitForExist('#wskflowSVG', 5000))
           .then(() => this.app)    
           .then(verifyNodeStatusExists('p=>({path:true})', 'success'))
           .then(verifyNodeStatusExists('p=>({path:false})', 'not-run'))
           .catch(common.oops(this)))

    it(`should invoke ${appName} with condition equals false`, () => cli.do(`app invoke ${appName} -p condition false`, this.app)
      .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .catch(common.oops(this)))


    it(`should be able to click on the mode button to switch to session flow, and see the false path highlighted`, () => this.app.client.click(ui.selectors.SIDECAR_MODE_BUTTON('visualization'))
      .then(() => this.app)
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(appName))
           .then(() => this.app.client.waitForExist('#wskflowSVG', 3000))
           .then(() => this.app)    
           .then(verifyNodeStatusExists('p=>({path:true})', 'not-run'))
           .then(verifyNodeStatusExists('p=>({path:false})', 'success'))
           .catch(common.oops(this)))

});

// test if mousedown on a node, drag and release triggers the clicking behavior of the node (it shouldn't)
describe('test if pressing a node, dragging and releasing triggers the clicking behavior of the node (it shouldn not)', function() {
    before(common.before(this))
    after(common.after(this))

    const appName = 'test-if', appFile = 'data/composer-source/if-session.js';
    it('should have an active repl', () => this.app.client.waitForText('#openwhisk-api-host', 60000))

    it(`should create an app with ${appFile}`, () => cli.do(`app create ${appName} ${appFile}`, this.app)
      .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .then(sidecar.expectShowing(appName))
       .catch(common.oops(this)))

    it(`should invoke ${appName} with condition equals true`, () => cli.do(`app invoke ${appName} -p condition true`, this.app)
      .then(cli.expectOK)
       .then(sidecar.expectOpen)
       .catch(common.oops(this)))

    it(`should be able to click on the mode button to switch to session flow`, () => this.app.client.click(ui.selectors.SIDECAR_MODE_BUTTON('visualization'))
      .then(() => this.app)           
           .then(sidecar.expectOpen)
           .then(sidecar.expectShowing(appName))
           .then(app => app.client.waitForExist('#wskflowSVG', 5000))
           .then(() => this.app)
           .then(verifyNodeStatusExists('Exit', 'success'))
           .catch(common.oops(this)))

    it(`should press, drag and release exist node and still stay at session flow`, () => this.app.client.moveToObject('#Exit')
      .then(() => this.app.client.buttonDown())
      .then(() => this.app.client.moveToObject('#wskflowSVG'))
      .then(() => this.app.client.buttonUp())      
      .then(() => this.app.client.getText('.sidecar-header-icon'))
      .then(text => assert.equal(text, 'SESSION'))
      .catch(common.oops(this)))

    it(`should click on the exit node and go to the activation`, () => this.app.client.click('#Exit')
      .then(() => this.app.client.getText('.sidecar-header-icon'))      
      .then(text => assert.equal(text, 'ACTIVATION'))
      .catch(common.oops(this)))

});
