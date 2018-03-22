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
