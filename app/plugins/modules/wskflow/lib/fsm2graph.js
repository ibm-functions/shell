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

'use strict'
const processNodes = require('./process-new.js'),
graph2doms = require('./graph2doms.js'),
$ = require('jquery'),
defaultWidth = 40, defaultHeight = 21, defaultCharWidth = 4;


let graphData, dummyCount, visited, activations, actions, taskIndex;

function addDummy(sources, targets, obj, directionS, directionT){

	if(sources.length === 0 && targets.length === 0)
		return;

	let dummyId = "dummy_"+dummyCount, o, port;
	dummyCount++;
	obj.children.push(drawNodeNew(dummyId, '', 'Dummy', sources));		
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

function drawNodeNew(id, label, type, properties, w, h){
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

		if(o.width<defaultWidth)
			o.width = defaultWidth;

		if(actions){
			if(actions[o.name] === undefined) actions[o.name] = [];
			actions[o.name].push(o.id);
		}

		o.taskIndex = taskIndex++;
	}
	else if(o.type === 'function'){
		o.fullFunctionCode = label;
		o.label = label.replace(/\s\s+/g, ' ');
		o.height = defaultHeight;

		if(o.label.length < 40){
			o.width = o.label.length*defaultCharWidth+10
		}	
		else{
			o.label = o.label.substring(0, 40)+'...';
			o.width = 40*defaultCharWidth+10;
		}

		if(o.width<defaultWidth)
			o.width = defaultWidth;

		o.taskIndex = taskIndex++;
	}
	else if(o.type === 'try_catch'){
		o.properties = {direction:'RIGHT', 'org.eclipse.elk.direction': 'RIGHT'};
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
		o.width = 25;
		o.height = defaultHeight;
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
							if(visited[dummyId] == undefined) {
								visited[dummyId] = [];
								o.visited = [];
							}
							visited[dummyId].push(a);
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

function ir2graph(ir, gm, id, prevId){	// ir and graph model
	if(Array.isArray(ir)){
		// for an array of things, prevId is the previous element
		// console.log(ir, gm, id, prevId);
		let count = 0, prev;
		ir.forEach(obj => {
			if(obj.options && obj.options.helper){
				// do nothing
			}			
			else{
				prev = ir2graph(obj, gm, `${id}-${count}`, count>0 ? prev : prevId);
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
			gm.children.push(drawNodeNew(id, name, ir.type))
			if(prevId)
				prevId.forEach(pid => gm.edges.push(drawEdgeNew(pid, id, gm)));
			return [id];		
		}
		else if(ir.type === 'function'){
			gm.children.push(drawNodeNew(id, ir.exec.code, ir.type))
			
			if(prevId)
				prevId.forEach(pid => gm.edges.push(drawEdgeNew(pid, id, gm)));
			return [id];	
		}
		else if(ir.type === 'if'){
			let firstTestId = gm.children.length,
				lastTestId = ir2graph(ir.test, gm, `${id}-test`),
				firstConsId = gm.children.length,
				lastConsId = ir2graph(ir.consequent, gm, `${id}-consequent`),
				firstAltId = gm.children.length,
				lastAltId = ir2graph(ir.alternate, gm, `${id}-alternate`);

			if(prevId)	// connect prevId to the first node in test
				prevId.forEach(pid => gm.edges.push(drawEdgeNew(pid, gm.children[firstTestId].id, gm)));
			
			// connect test to consequence
			let ltid;
			if(lastTestId.length>1){
				// insert a dummy node to converge
				ltid = addDummy(lastTestId, undefined, gm);
			}
			else{
				ltid = lastTestId[0];
			}
			gm.edges.push(drawEdgeNew(ltid, gm.children[firstConsId].id, gm, 'true'));
			if(lastAltId && lastAltId.length>0)	// may or may not have a alt branch
				gm.edges.push(drawEdgeNew(ltid, gm.children[firstAltId].id, gm, 'false'));
			else
				lastAltId = [ltid];
			
			return lastAltId.concat(lastConsId);
		}
		else if(ir.type === 'try'){
			// insert a compound node for try
			gm.children.push(drawNodeNew(id, 'Try-Catch', 'try_catch'));
			if(prevId){
				prevId.forEach(pid => gm.edges.push(drawEdgeNew(pid, id, gm)));
			}
			ir2graph(ir.body, gm.children[gm.children.length-1].children[0], `${id}-body`);
			ir2graph(ir.handler, gm.children[gm.children.length-1].children[1], `${id}-handler`);

			return [gm.children[gm.children.length-1].id];
		}
		else if(ir.type === 'while' || ir.type === 'dowhile'){	
			let firstTestId, firstBodyId, lastTestId, lastBodyId;

			if(ir.type === 'while'){
				firstTestId = gm.children.length;
				lastTestId = ir2graph(ir.test, gm, `${id}-test`);
				if(prevId)	// connect prevId to the first node in test
					prevId.forEach(pid => gm.edges.push(drawEdgeNew(pid, gm.children[firstTestId].id, gm)));
				firstBodyId = gm.children.length;
				lastBodyId = ir2graph(ir.body, gm, `${id}-body`);
			}	
			else{
				firstBodyId = gm.children.length;
				lastBodyId = ir2graph(ir.body, gm, `${id}-body`);
				if(prevId)	// connect prevId to the first node in test
					prevId.forEach(pid => gm.edges.push(drawEdgeNew(pid, gm.children[firstBodyId].id, gm)));
				firstTestId = gm.children.length;
				lastTestId = ir2graph(ir.test, gm, `${id}-test`);

			}	
			
			// connect test to consequence
			let ltid, lbid;
			if(lastTestId.length>1){
				// insert a dummy node to converge
				ltid = addDummy(lastTestId, undefined, gm);
			}
			else{
				ltid = lastTestId[0];
			}

			if(lastBodyId.length>1){
				// insert a dummy node to converge
				lbid = addDummy(lastBodyId, undefined, gm);
			}
			else{
				lbid = lastBodyId[0];
			}
			
			gm.edges.push(drawEdgeNew(ltid, gm.children[firstBodyId].id, gm, 'true')); // true edge for test, go to body
			gm.edges.push(drawEdgeNew(lbid, gm.children[firstTestId].id, gm)); // edge loop back to the beginning of test
			
			return [ltid];
		}
		else if(ir.type === 'retain'){
			gm.children.push(drawNodeNew(`${id}__origin`, '', ir.type));
			
			if(prevId){
				prevId.forEach(pid => gm.edges.push(drawEdgeNew(pid, `${id}__origin`, gm)));
			}
			let lastNodes = ir2graph(ir.body, gm, `${id}-body`, [`${id}__origin`]);
			gm.children.push(drawNodeNew(`${id}__terminus`, '', ir.type));
			if(lastNodes){
				lastNodes.forEach(pid => gm.edges.push(drawEdgeNew(pid, `${id}__terminus`, gm)));
			}
			gm.edges.push(drawEdgeNew(`${id}__origin`, `${id}__terminus`, gm, undefined, 'EAST'))

			return [`${id}__terminus`];
		}
		else if(ir.type === 'let'){
			if(ir.body && ir.body.length>0 && ir.body[0].options && ir.body[0].options.helper === 'retry_1'){
				// retry, insert a compound node				
				gm.children.push(drawNodeNew(id, ir.declarations.count, 'retry'));
				if(prevId){
					prevId.forEach(pid => gm.edges.push(drawEdgeNew(pid, id, gm)));
				}
				// body is in ir.body[1].body[0].finalizer[0].body[0].body
				ir2graph(ir.body[1].body[0].finalizer[0].body[0].body, gm.children[gm.children.length-1], `${id}-body-1-body-0-finalizer-0-body-0-body`);
				
				return [gm.children[gm.children.length-1].id];

			}
			else if(ir.body && ir.body.length>0 && ir.body[0].test && ir.body[0].test.length>0 && ir.body[0].test[0].options && ir.body[0].test[0].options.helper === 'repeat_1'){
				// repeat, insert a compound node				
				gm.children.push(drawNodeNew(id, ir.declarations.count, 'repeat'));
				if(prevId){
					prevId.forEach(pid => gm.edges.push(drawEdgeNew(pid, id, gm)));
				}
				// body is in ir.body[0].body
				ir2graph(ir.body[0].body, gm.children[gm.children.length-1], `${id}-body-0-body`);
				
				return [gm.children[gm.children.length-1].id];
			}
			else{
				// regular let
				let s = '';
				Object.keys(ir.declarations).forEach(k => { s += `${k} = ${JSON.stringify(ir.declarations[k])}; `})
				gm.children.push(drawNodeNew(id, s, ir.type))
				if(prevId)
					prevId.forEach(pid => gm.edges.push(drawEdgeNew(pid, id, gm)));

				return ir2graph(ir.body, gm, `${id}-body`, [id]);
			}
		}
		else if(ir.type === 'literal'){			
			let s = '';
			Object.keys(ir.value).forEach(k => { s += `${k} = ${JSON.stringify(ir.value[k])}; `})
			gm.children.push(drawNodeNew(id, s, ir.type))
			if(prevId)
				prevId.forEach(pid => gm.edges.push(drawEdgeNew(pid, id, gm)));

			return [id];
		}
		else if(ir.type === 'finally'){
			let lastBodyNode = ir2graph(ir.body, gm, `${id}-body`, prevId);
			return ir2graph(ir.finalizer, gm, `${id}-finalizer`, lastBodyNode);
		}
	}
}


function fsm2graph(ir, containerId, w, h, acts){
	//console.log(ir, containerId, w, h, act);
	taskIndex = 0;
	activations = acts;
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
	
	graphData.children.push(drawNodeNew('Entry', 'Entry', 'Entry'));	// insert Entry node
	let lastNodes = ir2graph(ir.composition, graphData, 'fsm', ['Entry']);	// bulid the graph model, link the start of the graph to Entry
	if(lastNodes == undefined)
		lastNodes = ['Entry'];
	graphData.children.push(drawNodeNew('Exit', 'Exit', 'Exit', lastNodes));	// insert Exit node
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
			result.forEach((r, index) => {
				if(r.type === "actions" && r.name){
					debug(`action ${r.name} is deployed`);
				}
				else{
					debug(`action ${names[index]} is not deployed`);
					if(actions[names[index]]){
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
		})
		.catch(e => {
			console.log('[wskflow] action get fetching error: ', e);
		});   
	}
	
	console.log('[wskflow] inserting DOM, calling graph2doms');

	graph2doms(graphData, containerId, w, h, activations);

}

module.exports = fsm2graph;
