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

const debug = require('debug')('wskflow')
debug('loading')

const $ = require('jquery'),
      fsm2graph = require('./lib/fsm2graph.js')

debug('finished loading modules')

module.exports = (commandTree, prequire) => {
    return {
        /**
         * Export a programmatic API to visualize a Composition
         *
         * [required] fsm: composer-generated JSON. container: DOM selector 
         * [optional] w & h: canvas width and height. data: activation data
         *
         */
        visualize: (passedFsm, container, w, h, activations) => {
            debug('visualize', passedFsm);
            if(passedFsm == undefined || passedFsm.composition == undefined || !Array.isArray(passedFsm.composition)){
                debug('fsm is not in the right format. return.');
                return true;
            }

            let ir = JSON.parse(JSON.stringify(passedFsm)), // create a copy - all annotations make by wskflow will not affect the original object.
                width, 
                height;

            if($('body').hasClass('sidecar-full-screen')){   
                width = $(window).width()-2;               
            }
            else{   // not full screen
                width = $(window).width()*0.6-2;                 
            }
            height = $('#sidecar').height()-$('.sidecar-header').height()-$('.sidecar-bottom-stripe').height()-2;

            return fsm2graph(ir, container, width, height, activations); 
        }
    }
}

debug('finished loading')
