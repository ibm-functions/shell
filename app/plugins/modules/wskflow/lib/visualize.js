/*
 * Copyright 2018 IBM Corporation
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

const debug = require('debug')('wskflow visualize')
debug('loading')

const $ = require('jquery'),
      fsm2graph = require('./fsm2graph')

debug('finished loading modules')

/**
 * Create the wskflow visualization for the given fsm
 *
 */
module.exports = (passedFsm, container, w, h, activations) => {
    debug('fsm', passedFsm);

    if(passedFsm == undefined || passedFsm.composition == undefined || !Array.isArray(passedFsm.composition)){
        debug('fsm is not in the right format. return.');
        return true;
    }

    // create a copy - all annotations make by wskflow will not affect the original object.
    let ir = JSON.parse(JSON.stringify(passedFsm));
    return fsm2graph(ir, container, activations); 
}
