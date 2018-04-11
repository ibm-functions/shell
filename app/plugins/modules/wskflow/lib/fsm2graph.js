/*
 * Copyright 2017-18 IBM Corporation
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

'use strict'
const graph2doms = require('./graph2doms.js'),
      $ = require('jquery'),
      { textualPropertiesOfCode } = require('./util'),
      maxWidth = 100, defaultWidth = 40, defaultHeight = 20, defaultCharWidth = 5, defaultCharHeight = 10;

let graphData, dummyCount, visited, activations, actions, taskIndex;

function addDummy(sources, targets, obj, options, directionS, directionT){

	if(sources.length === 0 && targets.length === 0)
		return;

	let dummyId = "dummy_"+dummyCount, o, port;
	dummyCount++;
	obj.children.push(drawNodeNew(dummyId, dummyId, 'Dummy', sources, options));
	if(sources && sources.length > 0){
		o = drawEdgeNew(sources[0], dummyId, obj), port = o.targetPort;
		obj.edges.push(o);
		for(let i=1; i<sources.length; i++){
			obj.edges.push(drawEdgeNew(sources[i], dummyId, obj, undefined, directionS, undefined, port))
		}	
	}
	
	if(targets && targets.length > 0){
		o = drawEdgeNew(dummyId, targets[0], obj); port = o.sourcePort;
		obj.edges.push(o);
		for(let i=1; i<targets.length; i++){
			obj.edges.push(drawEdgeNew(dummyId, targets[i], obj, undefined, directionT, port, undefined))
		}
	}	

	return dummyId;

}

function drawNodeNew(id, label, type, properties, options){
	let o = {
		id: id,
		label: label,
		type: type, 
		ports: [],
		properties: {}
	}
	if(visited){
		if(id === 'Entry'){
			visited[id] = [0];
			o.visited = visited[id];
		}
		else if(id === 'Exit'){
			if(Array.isArray(properties)){
				properties.forEach(p => {
					if(visited[p]){
						visited[id] = [activations.length-1];						
					}
				})
			}
			o.visited = visited[id];
		}
		else if(visited[id]){
			if(type === 'action'){
				visited[id].forEach((v, i) => {visited[id][i]++}); // for actions, increase all index by one to point to the next activation in the array.
			}
			o.visited = visited[id];
		}
	}

	if(visited && (visited[id] || id === 'Entry'))
		o.visited = visited[id] || 0;

	//if(type !== 'tryBody' && type !== 'handler'){
	if(type !== 'try' && type !== 'handler'){
		//o.properties["de.cau.cs.kieler.portConstraints"] = "FIXED_SIDE";
		// DO NOT TOUCH THIS. 
		o.properties["de.cau.cs.kieler.portConstraints"] = "FIXED_ORDER";
	}
	
	if(type !== 'Dummy' && type !== 'Exit' && properties){	// dummy and entry/exit nodes have no layout properties
		o.layoutOptions = {};
		Object.keys(properties).forEach(p => {
			o.properties[p] = properties[p];
			o.layoutOptions[p] = properties[p];
		});
	}

	if(o.type === 'action'){
		if(label.indexOf('\|') !== -1){					
			o.name = label.substring(0, label.indexOf('|'));
			label = label.substring(label.indexOf('|')+1);	
			o.label = label;		
		}
		else{
			o.name = label;		
		}	
		
		if(label.lastIndexOf('/') !== -1 && label.lastIndexOf('/') < label.length-1){
			o.label = label.substring(label.lastIndexOf('/') + 1);
		}
		o.height = defaultHeight;

		if(o.label.length < 40){
			o.width = o.label.length*defaultCharWidth+10
		}	
		else{
			o.label = o.label.substring(0, 40)+'...';
			o.width = 40*defaultCharWidth+10;
		}

		/*if(o.width<defaultWidth)
			o.width = defaultWidth;*/

		if(actions){
			if(actions[o.name] === undefined) actions[o.name] = [];
			actions[o.name].push(o.id);
		}

		o.taskIndex = taskIndex++;
	}
        else if(o.type === 'function'){
	        o.fullFunctionCode = label;
                const prettyCode = require('js-beautify')(o.fullFunctionCode),
                      { nLines, maxLineLength } = textualPropertiesOfCode(prettyCode)

                // uncomment the second clause if you want always to display 1-liner functions inline in the view
                if (options.renderFunctionsInView /*|| nLines === 1*/) {
                    // ok cool, then render this function body directly in the view
                    const charWidthForCode = defaultCharWidth * 0.63

		    o.width = Math.min(maxWidth, maxLineLength * charWidthForCode);
   	            o.height = Math.max(2.25, nLines) * defaultCharHeight; // use at least two lines; makes one-line functions look better
                    o.multiLineLabel = prettyCode.split(/[\n\r]/).map(line => {
                        const width = o.width / charWidthForCode
                        if (width >= line.length) {
                            // not cropped
                            return line
                        } else {
                            return line.substring(0, width) + '\u2026' // horizontal ellipsis unicode
                        }
                    })
                    o.prettyCode = prettyCode
                    delete o.label
                } else {
                    // otherwise, don't show any function code directly in the view; only in tooltip
		    o.width = 8;
   	            o.height = 8;
                    o.tooltip = prettyCode
                    delete o.label;
                }


    	        o.taskIndex = taskIndex++;
	}
	else if(o.type === 'try_catch'){
	    o.properties = {direction:'RIGHT', 'org.eclipse.elk.direction': 'RIGHT'}
		o.children = [{
			id: `${id}-body`,
			label: 'try',
			type: 'try', 
			ports: [],
			properties: {},
			children: [],
			edges: []
		}, {
			id: `${id}-handler`,
			label: 'error handler',
			type: 'handler', 
			ports: [],
			properties: {},
			children: [],
			edges: []
		}];
		o.edges = [drawEdgeNew(`${id}-body`, `${id}-handler`, o, undefined, 'RIGHT')];				
	}
	else if(o.type === 'Entry' || o.type === 'Exit'){
		o.width = 18;
   	        o.height = 18;
	}
	else if(o.type === 'retain'){
		o.width = 4;
		o.height = 4;
	}
	else if(o.type === 'Dummy'){
		o.width = 4;
		o.height = 4;
		// Dummy node's `properties` is `sources`, used to determine if the dummy is visited 
		if(visited && Array.isArray(properties)){
			properties.forEach(s => {	// a source id			 
				if(visited[s]){			// if the source is visited
					visited[s].forEach(a => {	// find out if any of its activation was success
					        if(activations[a].response.success){	// if so, dummy is visited
							if(visited[o.id] == undefined) {
								visited[o.id] = [];
								o.visited = [];
							}
							visited[o.id].push(a);
							o.visited.push(a);
						}
					})
				}				
			})
		}
	}
        else if(o.type === 'let' || o.type === 'literal'){
		if(o.label.length>30)
			o.width = 30*defaultCharWidth+10;
		else
			o.width = o.label.length*defaultCharWidth+10;
		o.height = defaultHeight;
                o.tooltip = o.label;
                delete o.label;

                o.width = 20;
                o.height = 20;
	}
	else if(o.type === 'retry'){
		o.children = [];
		o.edges = [];
		o.retryCount = label;		
		o.label = `Retry ${label} time${label>1?'s':''}`;
	}
	else if(o.type === 'repeat'){
		o.children = [];
		o.edges = [];
		o.repeatCount = label;		
		o.label = `Repeat ${label} time${label>1?'s':''}`;
	}

	return o;
}

function drawEdgeNew(sourceId, targetId, layer, type, direction, sourcePort, targetPort){
	//let sourcePort, targetPort;

	for(let i=0; i<layer.children.length; i++){
		if(layer.children[i].id === sourceId){
			if(type){
				if(type === 'true' || type == 'false'){					
					sourcePort = `${sourceId}_p${type}`
					layer.children[i].properties.choice = true;
				}
				
			}
			else if(layer.children[i].properties.choice){
				sourcePort = `${sourceId}_pfalse`				
			}
			else{
				sourcePort = `${sourceId}_p${layer.children[i].ports.length}`
			}
			layer.children[i].ports.push({
				id: sourcePort,
				properties: {portSide: direction ? direction : "SOUTH"}
			});
		}
		if(layer.children[i].id === targetId){
			//console.log("found! "+targetId);
			//targetPort = targetId+"_p"+layer.children[i].ports.length;
			targetPort = `${targetId}_p${layer.children[i].ports.length}`;
			layer.children[i].ports.push({
				id: targetPort,
				properties: {portSide: direction ? direction : "NORTH"}
			});			
		}
		if(sourcePort && targetPort)
			break;
	}

	if(sourcePort === undefined || targetPort === undefined){
		console.error("ERROR!!!");
		console.log(sourceId, targetId, layer, graphData);
	}

	return {
		id: sourceId+"_"+sourcePort+"->"+targetId+"_"+targetPort,
		source: sourceId,
		sourcePort: sourcePort,
		target: targetId,
		targetPort: targetPort,
		visited: (visited && visited[sourceId] && visited[targetId]) 
	};
}

function ir2graph(ir, gm, id, prevId, options={}){	// ir and graph model
	if(Array.isArray(ir)){
		// for an array of things, prevId is the previous element
		// console.log(ir, gm, id, prevId);
		let count = 0, prev;
		ir.forEach(obj => {
			if(obj.options && obj.options.helper){
				// do nothing
			}			
			else{
			        prev = ir2graph(obj, gm, `${id}-${count}`, count>0 ? prev : prevId, options);
				count++;
			}
			
		});

		return prev;	
	}
	else{
		if(ir.type === 'action'){
			let name = ir.name;
			if(ir.displayLabel)
				name += `|${ir.displayLabel}`;
		        gm.children.push(drawNodeNew(id, name, ir.type, undefined, options))
			if(prevId)
				prevId.forEach(pid => gm.edges.push(drawEdgeNew(pid, id, gm)));
			return [id];		
		}
		else if(ir.type === 'function'){
			gm.children.push(drawNodeNew(id, ir.exec.code, ir.type, undefined, options))
			
			if(prevId)
				prevId.forEach(pid => gm.edges.push(drawEdgeNew(pid, id, gm)));
			return [id];	
		}
		else if(ir.type === 'if'){
			let firstTestId = gm.children.length,
			        lastTestId = ir2graph(ir.test, gm,`${id}-test`, undefined, options),
				firstConsId = gm.children.length,
				lastConsId = ir2graph(ir.consequent, gm,`${id}-consequent`, undefined, options),
				firstAltId = gm.children.length,
			        lastAltId = ir2graph(ir.alternate, gm,`${id}-alternate`, undefined, options)

			if(prevId)	// connect prevId to the first node in test
				prevId.forEach(pid => gm.edges.push(drawEdgeNew(pid, gm.children[firstTestId].id, gm)));
			
			// connect test to consequence
			let ltid;
			if(lastTestId.length>1){
				// insert a dummy node to converge
			        ltid = addDummy(lastTestId, undefined, gm, options);
			}
			else{
				ltid = lastTestId[0];
			}
			gm.edges.push(drawEdgeNew(ltid, gm.children[firstConsId].id, gm, 'true'));
			if(lastAltId && lastAltId.length>0)	// may or may not have a alt branch
				gm.edges.push(drawEdgeNew(ltid, gm.children[firstAltId].id, gm, 'false'));
			else
				lastAltId = [ltid];

		    const exitConcentrator = addDummy(lastAltId.concat(lastConsId), undefined, gm, options);
                    return [exitConcentrator]
		}
		else if(ir.type === 'try'){
			// insert a compound node for try
			gm.children.push(drawNodeNew(id, 'Try-Catch', 'try_catch', undefined, options));
			if(prevId){
				prevId.forEach(pid => gm.edges.push(drawEdgeNew(pid, id, gm)));
			} else {
                                gm.children[gm.children.length-1].properties.compoundNoParents = true
                        }

                        const tryCatchPart = gm.children[gm.children.length-1],
                              tryPart = tryCatchPart.children[0],
                              catchPart = tryCatchPart.children[1]

		        ir2graph(ir.body, tryPart, tryPart.id, undefined, options);
			ir2graph(ir.handler, catchPart, catchPart.id, undefined, options);

			return [gm.children[gm.children.length-1].id];
		}
		else if(ir.type === 'while' || ir.type === 'dowhile'){	
			let firstTestId, firstBodyId, lastTestId, lastBodyId;

			if(ir.type === 'while'){
				firstTestId = gm.children.length;
				lastTestId = ir2graph(ir.test, gm, `${id}-test`, undefined, options);
				if(prevId)	// connect prevId to the first node in test
					prevId.forEach(pid => gm.edges.push(drawEdgeNew(pid, gm.children[firstTestId].id, gm)));
				firstBodyId = gm.children.length;
				lastBodyId = ir2graph(ir.body, gm, `${id}-body`, undefined, options);
			}	
			else{
				firstBodyId = gm.children.length;
				lastBodyId = ir2graph(ir.body, gm, `${id}-body`, undefined, options);
				if(prevId)	// connect prevId to the first node in test
					prevId.forEach(pid => gm.edges.push(drawEdgeNew(pid, gm.children[firstBodyId].id, gm)));
				firstTestId = gm.children.length;
				lastTestId = ir2graph(ir.test, gm, `${id}-test`, undefined, options);

			}	
			
			// connect test to consequence
			let ltid, lbid;
			if(lastTestId.length>1){
				// insert a dummy node to converge
				ltid = addDummy(lastTestId, undefined, gm, options);
			}
			else{
				ltid = lastTestId[0];
			}

			if(lastBodyId.length>1){
				// insert a dummy node to converge
				lbid = addDummy(lastBodyId, undefined, gm, options);
			}
			else{
				lbid = lastBodyId[0];
			}
			
			gm.edges.push(drawEdgeNew(ltid, gm.children[firstBodyId].id, gm, 'true')); // true edge for test, go to body
			gm.edges.push(drawEdgeNew(lbid, gm.children[firstTestId].id, gm)); // edge loop back to the beginning of test
			
			return [ltid];
		}
		else if(ir.type === 'retain'){
			gm.children.push(drawNodeNew(`${id}__origin`, '', ir.type, undefined, options));
			
			if(prevId){
				prevId.forEach(pid => gm.edges.push(drawEdgeNew(pid, `${id}__origin`, gm)));
			}
			let lastNodes = ir2graph(ir.body, gm, `${id}-body`, [`${id}__origin`], options);
			gm.children.push(drawNodeNew(`${id}__terminus`, '', ir.type, undefined, options));
			if(lastNodes){
				lastNodes.forEach(pid => gm.edges.push(drawEdgeNew(pid, `${id}__terminus`, gm)));
			}

                    const forwardingEdge = drawEdgeNew(`${id}__origin`, `${id}__terminus`, gm, undefined, 'EAST')
                    // forwardingEdge.labels = [ { text: 'forwarding' } ]
                    forwardingEdge.properties = { type: 'retain' }
		    gm.edges.push(forwardingEdge)

			return [`${id}__terminus`];
		}
		else if(ir.type === 'let'){
			if(ir.body && ir.body.length>0 && ir.body[0].options && ir.body[0].options.helper === 'retry_1'){
				// retry, insert a compound node				
				gm.children.push(drawNodeNew(id, ir.declarations.count, 'retry', undefined, options));
				if(prevId){
					prevId.forEach(pid => gm.edges.push(drawEdgeNew(pid, id, gm)));
				}
				// body is in ir.body[1].body[0].finalizer[0].body[0].body
				ir2graph(ir.body[1].body[0].finalizer[0].body[0].body, gm.children[gm.children.length-1], `${id}-body-1-body-0-finalizer-0-body-0-body`, undefined, options);
				
				return [gm.children[gm.children.length-1].id];

			}
			else if(ir.body && ir.body.length>0 && ir.body[0].test && ir.body[0].test.length>0 && ir.body[0].test[0].options && ir.body[0].test[0].options.helper === 'repeat_1'){
				// repeat, insert a compound node				
				gm.children.push(drawNodeNew(id, ir.declarations.count, 'repeat', undefined, options));
				if(prevId){
					prevId.forEach(pid => gm.edges.push(drawEdgeNew(pid, id, gm)));
				}
				// body is in ir.body[0].body
				ir2graph(ir.body[0].body, gm.children[gm.children.length-1], `${id}-body-0-body`, undefined, options);
				
				return [gm.children[gm.children.length-1].id];
			}
			else{
				// regular let
			        let s = JSON.stringify(ir.declarations, undefined, 4);
                                gm.children.push(drawNodeNew(id, s, ir.type, undefined, options))
				if(prevId)
					prevId.forEach(pid => gm.edges.push(drawEdgeNew(pid, id, gm)));

				return ir2graph(ir.body, gm, `${id}-body`, [id], options);
			}
		}
		else if(ir.type === 'literal'){			
  		        const s = JSON.stringify(ir.value, undefined, 4);
			gm.children.push(drawNodeNew(id, s, ir.type, undefined, options))
			if(prevId)
				prevId.forEach(pid => gm.edges.push(drawEdgeNew(pid, id, gm)));

			return [id];
		}
		else if(ir.type === 'finally'){
			let lastBodyNode = ir2graph(ir.body, gm, `${id}-body`, prevId, undefined, options);
			return ir2graph(ir.finalizer, gm, `${id}-finalizer`, lastBodyNode, undefined, options);
		}
	        else if(typeof ir.body === 'object'){
                    // generic handler for any subgraph-via-body node
                    const body = drawNodeNew(id, ir.type, ir.type, undefined, options)
                    body.children = []
                    body.edges = []
		    gm.children.push(body);

                    if(prevId)
		        prevId.forEach(pid => gm.edges.push(drawEdgeNew(pid, id, gm)));

		    ir2graph(ir.body, body, `${id}-body`, undefined, options)

                    return [id]

		} else {
                    console.error('wskflow warning! unsupported node type', ir)
                }
	}
}


function fsm2graph(ir, containerElement, acts, options){
	//console.log(ir, containerElement, acts);
	taskIndex = 0;
	activations = acts;
        visited = undefined; // see shell issue #602
	dummyCount = 0;
	graphData = {
		id: 'root',
		label: 'root',
		children: [],
		edges: []
	};

	$('.wskflowWarning').remove();

	if(activations){
		// parse the activations to get a list of states that was visted 
		activations = activations.sort((a, b) => {return a.start - b.start;});
		console.log(activations);
		visited = {};
		activations.forEach((a, index) => {
			if(a.logs){	// states recorded in logs
				a.logs.forEach(log => {
					if(log.indexOf('stdout: Entering state ') !== -1){
						// a conductor path log 
						let path = log.substring(log.lastIndexOf(' ')+1);
						// replace all [,],.in path to - to use as a id, as css selector cannot have those characters
						path = path.replace(/[\[\.]/g, '-').replace(/\]/g, '');
						if(visited[path] == undefined) visited[path] = [];
						visited[path].push(index);
					}
				});				
			}
		});
		Object.keys(visited).forEach(k => {
			// make sure the compound node, if any, is included in visited too. 
			let seg = k.split('-');
			seg.pop(); // kick out the last element == get the compound node id
			let path = seg.join('-');
			if(visited[path] == undefined) visited[path] = []
			visited[path] = visited[path].concat(visited[k]); // join it back, value is all the items in the child arrays (not sure if it's necessary)
		});
		console.log('[wskflow] visited nodes:', visited);
	}
	else{
		actions = {};
	}
	
	console.log('[wskflow] generating graph model');

        const renderFunctionsInView = isSimpleComposition(ir),
              viewOptions = Object.assign( { renderFunctionsInView }, options)

        graphData.children.push(drawNodeNew('Entry', 'start', 'Entry'));	// insert Entry node
        let lastNodes = ir2graph(ir.composition, graphData, 'fsm', ['Entry'],   // build the graph model, link the start of the graph to Entry
                                 viewOptions);                                  // <-- options to the rendering
	if(lastNodes == undefined)
		lastNodes = ['Entry'];
	graphData.children.push(drawNodeNew('Exit', 'end', 'Exit', lastNodes));	// insert Exit node
	lastNodes.forEach(pid => graphData.edges.push(drawEdgeNew(pid, 'Exit', graphData))); // link the end of the graph to Exit
	
	console.log(graphData);        
	if(actions){
		console.log(actions);
		let array = [], names = Object.keys(actions);
		names.forEach(name => {
			array.push(repl.qexec(`wsk action get "${name}"`));
		});
		Promise.all(array.map(p => p.catch(e => e)))
		.then(result => {
                        const notDeployed = []
			result.forEach((r, index) => {
				if(r.type === "actions" && r.name){
					debug(`action ${r.name} is deployed`);
				}
				else{
				        debug(`action ${names[index]} is not deployed`);
					if(actions[names[index]]){
                                                notDeployed.push(names[index])
						actions[names[index]].forEach(id => {
							let t = setInterval(e => {
								if($('#'+id).length > 0){
									clearInterval(t);
									$('#'+id).attr('data-deployed', 'not-deployed');
								}
							}, 20);
						});
					}
				}
			});

                    // warn user about not-deployed actions (but only if !activations, i.e. not for session flow)
                    if (notDeployed.length > 0 && !activations) {
                        const container = document.querySelector('#sidecar .sidecar-header .sidecar-header-secondary-content .custom-header-content')
                        if (container) {
                            const css = {
                                message: 'wskflow-undeployed-action-warning',
                                text: 'wskflow-undeployed-action-warning-text',
                                examples: 'wskflow-undeployed-action-warning-examples'
                            }
                            let message = container.querySelector(`.${css.message}`),
                                text, examples

                            if (!message) {
                                const message = document.createElement('div'),
                                      warning = document.createElement('strong')

                                text = document.createElement('span')
                                examples = document.createElement('span')

                                message.className = css.message
                                text.className = css.text
                                examples.className = css.examples

                                message.appendChild(warning)
                                message.appendChild(text)
                                message.appendChild(examples)
                                container.appendChild(message)
                            
                                warning.className = 'red-text'
                                examples.className = 'deemphasize deemphasize-partial left-pad'

                                warning.innerText = 'Warning: '
                            } else {
                                text = message.querySelector(`.${css.text}`)
                                examples = message.querySelector(`.${css.examples}`)
                            }

                            const actionStr = notDeployed.length === 1 ? 'action' : 'actions'
                            text.innerText = `This composition depends on ${notDeployed.length} undeployed ${actionStr}`

                            const pre = notDeployed.length > 2 ? 'e.g. ' : '',
                                  examplesOfNotDeployed = notDeployed.slice(0,2).map(_ => _.substring(_.lastIndexOf('/') + 1)).join(', '),
                                  post = notDeployed.length > 2 ? ', \u2026' : '' // horizontal ellipsis

                            examples.innerText = `(${pre}${examplesOfNotDeployed}${post})`
                        }
                    }
		})
		.catch(e => {
			console.log('[wskflow] action get fetching error: ', e);
		});   
	}
	
	console.log('[wskflow] inserting DOM, calling graph2doms');

	return graph2doms(graphData, containerElement, activations);

}

/**
 * Heuristic: is this composition "pretty simple"?
 *
 */
const isSimpleComposition = ir => {
    const isShort = ir.composition.length <= 2,
          numNonFuncs = numNonFunctions(ir.composition),
          atMostOneNonFunction = numNonFuncs <= 3

    debug('isSimpleComposition', isShort, numNonFuncs)
    return isShort && atMostOneNonFunction
}

const numNonFunctions = composition => {
    if (composition.type === 'function') {
        return 0
    } else if (composition.type) {
        // then this is a compound node of some type
        let sum = 0
        for (let key in composition) {
            sum += numNonFunctions(composition[key])
        }
        return sum + 1
    }
    else if (Array.isArray(composition)) {
        return composition.reduce((sum, sub) => sum + numNonFunctions(sub), 0)
    } else {
        return 0
    }
}

module.exports = fsm2graph;
