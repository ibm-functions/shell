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
const $ = require('jquery');

module.exports = (commandTree, prequire) => {
    return {
        // [required] fsm: composer-generated JSON. container: DOM selector 
        // [optional] w & h: canvas width and height. data: activation data
        visualize: (passedFsm, container, w, h, activations) => {
            console.log('[wskflow] plugin called');        
            console.log('[wskflow] fsm passed: ', passedFsm);

            const fsm2graph = require('./lib/fsm2graph.js');                    
            if(passedFsm == undefined){
                console.log("[wskflow] fsm is empty. return.");
                return;
            }
            else if(activations && typeof passedFsm == 'string' && (passedFsm == 'deleted' || passedFsm.indexOf('outdated') == 0)){
                let msg;
                if(passedFsm == 'deleted'){
                    msg = 'The flow visualization cannot be created because the app has been deleted. '
                }
                else{
                    let v = passedFsm.split(' ');
                    msg = `The flow visualization cannot be created because this session was generated by an older version of the app (session version: ${v[2]}, current app version: ${v[1]}). `;                    
                }
                msg += '<br/><br/>Visit the Trace tab to view a list of activations caused by the session.';
                msg = '<div style="margin: 25px">'+msg+'</div>'
                $(container).html(msg);
                return;

            }
            else if(passedFsm.States == undefined){                
                console.log("[wskflow] fsm is in a wrong format. return.");                
                return;
            }


            var fsm = JSON.parse(JSON.stringify(passedFsm));

            if(activations){   
                // showing runtime activations
                console.log('[wskflow] activations: ', activations);
                //fsm2graph(fsm, container, w, h, data.wskflowData.slice(0, data.wskflowData.length-1));   
                //fsm2graph(fsm, container, w, h, activations);   
            }
            else{       
                // showing the control flow
                // collect all action name, send a get request for each             
                let getPromises = [], actionName = [], action2State = {};
                Object.keys(fsm.States).forEach(n => {                  
                    if(fsm.States[n].Type == "Task" && fsm.States[n].Action){
                        getPromises.push(repl.qexec("wsk action get "+fsm.States[n].Action));
                        actionName.push(fsm.States[n].Action);
                        if(action2State[fsm.States[n].Action] == undefined)
                            action2State[fsm.States[n].Action] = [];
                        action2State[fsm.States[n].Action].push(n);
                    }
                });
                //fsm2graph(fsm, container, w, h);

                Promise.all(getPromises.map(p => p.catch(e => e)))
                    .then(result => {                        
                        result.forEach((r, index) => {
                            if(r.type == "actions" && r.name){
                                console.log(`[wskflow] action ${r.name} found`);
                            }
                            else{                                
                                console.log(`[wskflow] action ${actionName[index]} not deployed`);
                                if(action2State[actionName[index]]){                                   
                                    action2State[actionName[index]].forEach(s => {
                                        let t = setInterval(e => {
                                            if($('#'+action2State[actionName[index]]).length > 0){
                                                clearInterval(t);
                                                $('#'+action2State[actionName[index]]).attr('data-deployed', 'not-deployed');
                                                $('#'+action2State[actionName[index]]).find('rect').css('fill', 'lightgrey');
                                            }
                                        }, 20);
                                        //fsm.States[s].undeployed = true;
                                    });
                                   
                                }
                            }
                        });
                        //fsm2graph(fsm, container, w, h);
                    })
                    .catch(e => {
                        console.log('[wskflow] action get fetching error: ', e);
                       //fsm2graph(fsm, container, w, h);
                    });        
            }

           
            let width, height;
            if($('body').hasClass('sidecar-full-screen')){   
                width = $(window).width()-2;               
            }
            else{   // not full screen
                width = $(window).width()*0.6-2;                 
            }
            height = $('#sidecar').height()-$('.sidecar-header').height()-$('.sidecar-bottom-stripe').height()-2;

            fsm2graph(fsm, container, width, height, activations); 
           
            return true;
        }
    }
}
