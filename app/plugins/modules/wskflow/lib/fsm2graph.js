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


let graphData, fsmData, dummyCount, isAct, visited;

function drawNode(id, label, isCompound, properties, w, h){
	let o = {id: id, label: label?label:id, ports:[], properties:{}};
	if(id.indexOf("try_") ==-1 && id.indexOf("handler_") == -1){
		//o.properties["de.cau.cs.kieler.portConstraints"] = "FIXED_SIDE";
		// DO NOT TOUCH THIS. IT FIXES EVERYTHING.
		o.properties["de.cau.cs.kieler.portConstraints"] = "FIXED_ORDER";
	}
	if(properties){
		o.layoutOptions = {};
		Object.keys(properties).forEach(p => {
			o.properties[p] = properties[p];
			o.layoutOptions[p] = properties[p];
		});
	}


	if(isCompound){
		o.children = [];
		o.edges = [];
	}			

	// add type == state.Type
	if(fsmData.States[id] && !isCompound){
		if(fsmData.States[id].Value != undefined){
			o.Type = "Value";
		}
		else{
			o.Type = fsmData.States[id].Type;
		}
		//o.Type = fsmData.States[id].Type;


		if(o.Type == "Pass" || o.Type == "Catch"){
			o.width = 5;
			o.height = 5;
		}
		else if(o.Type == "Entry" || o.Type == "Exit"){
			o.width = 25;
			o.height = defaultHeight;
		}
		/*else if(o.Type == "Choice"){
			o.width = 40;
			o.height = 20;
		}*/
		else if(o.Type == "Choice"){
			o.width = o.label.length*3+10;
			o.height = defaultHeight;
		}
		else if(o.Type == "Value"){
			if(o.label.length>30)
				o.width = 30*defaultCharWidth+10;
			else
				o.width = o.label.length*defaultCharWidth+10;
			o.height = defaultHeight;
		}
		else if(o.Type == "Push" || o.Type == "Pop"){
			o.width = 5;
			o.height = 5;
		}	
		else if(o.Type == "Task"){
			let label = o.label, d = o;;

			if(fsmData.States[d.id]){
				if(fsmData.States[d.id].Action){
					// action node, cut down namespace 
					if(fsmData.States[d.id].Action.lastIndexOf("/") != -1 && fsmData.States[d.id].Action.lastIndexOf("/") < fsmData.States[d.id].Action.length-1){
						label = fsmData.States[d.id].Action.substring(fsmData.States[d.id].Action.lastIndexOf("/")+1);
					}
					else{
						label = fsmData.States[d.id].Action;
					}
				}
				else if(fsmData.States[d.id].Function){
					let s = fsmData.States[d.id].Function;
					s = s.replace(/\s\s+/g, ' ');
					if(s.length > 40)
						label = s.substring(0, 40)+"...";
					else
						label = s;
				}

			}

			if(label.length < 40){
				o.width = label.length*defaultCharWidth+10
			}	
			else{
				o.width = 40*defaultCharWidth+10;
			}
			if(o.width<defaultWidth)
				o.width = defaultWidth;

			o.height = h?h:defaultHeight;
		}	
		else{
			
			o.width = w?w:defaultWidth;			
			o.height = h?h:defaultHeight;
		}

		if(o.Type == "Task"){
			if(fsmData.States[o.id].Action){
				o.name = fsmData.States[o.id].Action;
			}
		}

                o.TaskIndex = fsmData.States[id].TaskIndex

	        // for undeployed data
		o.undeployed = fsmData.States[id].undeployed;
	}
	else{
		if(o.id.indexOf("try_catch_")!= -1 || o.id.indexOf("repeat_") != -1){
			o.Type = "try_catch";
		}			
		else{
			o.Type = o.label;
			if(o.Type == "Dummy"){
				o.width = 4;
				o.height = 4;
			}
			else if(o.Type == "condition")
				o.Type = "try_catch";
			else if(o.Type == "try")
				o.Type = "Try";
		}
		
	}

	// mark in the fsm that the state has been stored
	if(fsmData.States[id])
		fsmData.States[id].stored = true;



	return o;
}

function drawEdge(sourceId, targetId, layer, direction, sourcePort, targetPort){
	//let sourcePort, targetPort

	for(let i=0; i<layer.children.length; i++){
		if(layer.children[i].id == sourceId){
			//console.log("found! "+sourceId);
			sourcePort = sourceId+"_p";
			//if(sourceId.indexOf("choice_") == 0){
			if(layer.children[i].properties.choice){
				let r = [];
				layer.children[i].ports.forEach(p => r.push(p.id));
				if(r.indexOf(sourceId+"_ptrue") == -1)
					sourcePort += "true";
				else{
					// already has true branch
					if(r.indexOf(sourceId+"_pfalse") == -1)
						sourcePort += "false";
					else
						sourcePort += layer.children[i].ports.length;
				}
				//sourcePort += layer.children[i].ports.length;

			}
			else{
				sourcePort += layer.children[i].ports.length;
			}
			
			layer.children[i].ports.push({
				id: sourcePort,
				properties: {portSide: direction ? direction : "SOUTH"}
			});			
		}
		if(layer.children[i].id == targetId){
			//console.log("found! "+targetId);
			targetPort = targetId+"_p"+layer.children[i].ports.length;
			layer.children[i].ports.push({
				id: targetPort,
				properties: {portSide: direction ? direction : "NORTH"}
			});			
		}
		if(sourcePort && targetPort)
			break;
	}

	if(sourcePort == undefined || targetPort == undefined){
		console.log("ERROR!!!");
		console.log(sourceId, targetId, layer, graphData);
	}

	return {
		id: sourceId+"_"+sourcePort+"->"+targetId+"_"+targetPort,
		source: sourceId,
		sourcePort: sourcePort,
		target: targetId,
		targetPort: targetPort,

	};
}


function addDummy(sources, targets, obj, directionS, directionT){

	if(sources.length == 0 && targets.length == 0)
		return;

	let dummyId = "dummy_"+dummyCount, o, port;
	dummyCount++;
	obj.children.push(drawNode(dummyId, "Dummy"));		
	if(sources.length > 0){
		o = drawEdge(sources[0], dummyId, obj), port = o.targetPort;
		obj.edges.push(o);
		for(let i=1; i<sources.length; i++){
			obj.edges.push(drawEdge(sources[i], dummyId, obj, directionS, undefined, port))
		}	

		if(isAct){
			sources.forEach(s => {if(visited[s] && visited[s] != 'failed') visited[dummyId] = true;})
		}
	}

	if(targets.length > 0){
		o = drawEdge(dummyId, targets[0], obj); port = o.sourcePort;
		obj.edges.push(o);
		for(let i=1; i<targets.length; i++){
			obj.edges.push(drawEdge(dummyId, targets[i], obj, directionT, port, undefined))
		}
	}
	


	return dummyId;

}

function graph(fsm, startName, endName, obj, lastNode, whichBranch){
	let name = startName;	

	if(lastNode == undefined)
		lastNode = [];

	while(name){		
	
		if(fsm.States[name].stored){
			console.log("reached a node that's already added. build the edge and then stop");
			//console.log(whichBranch, fsm.States[name], lastNode);

			// if there are multiple lastNode, merge them into one node 			
			if(lastNode.length>1){				
				/*let dummyId = "dummy_"+dummyCount;
				dummyCount++;
				obj.children.push(drawNode(dummyId, "Dummy"));		
				let o = drawEdge(lastNode[0], dummyId, obj), targetPort = o.targetPort;
				obj.edges.push(o);
				for(let i=1; i<lastNode.length; i++){
					obj.edges.push(drawEdge(lastNode[i], dummyId, obj, undefined, undefined, targetPort))
				}			
				lastNode = [dummyId];
				*/
				addDummy(lastNode, [name], obj, undefined, "WEST");
				//addDummy(lastNode, [name], obj)
			}
			else{
				lastNode.forEach(ln => obj.edges.push(drawEdge(ln, name, obj, "WEST")));
				//lastNode.forEach(ln => obj.edges.push(drawEdge(ln, name, obj)));			
			}
						
			// return directly an empty array, as no lastNode needs to create an edge
			return [];
		}


		let state = fsm.States[name], Type = state.Type, next;
	
		if(state.display != "ignore"){

			if(name == "Entry"){
				obj.children.push(drawNode(name));
				lastNode = ['Entry'];			
				next = state.Next;

				if(isAct){
					// Entry always true
					visited[name] = true;
				}


			}
			else if(name == "Exit"){
				obj.children.push(drawNode(name));
				//if(lastNode) obj.edges.push(drawEdge(lastNode, name, obj));	
				lastNode.forEach(ln => obj.edges.push(drawEdge(ln, name, obj)));

				if(isAct && state.act){
					// exit true when final result is obtained					
					visited[name] = true;
				}

				break;
			}
			else if(Type == "Choice"){
				// first, push node
				let id = name.substring("choice_".length), nodeName = name;
				if(state.repeat){
					// repeat label
					let label = "Repeat ";
					if(state.repeat == 1)
						label += "1 time";
					else
						label += state.repeat+" times";
					//obj.children.push(drawNode(name, label));	
					obj.children.push(drawNode("repeat_"+id, label, true));
					nodeName = "repeat_"+id;

					lastNode.forEach(ln => obj.edges.push(drawEdge(ln, nodeName, obj)));
					if(isAct){
						lastNode.forEach(ln => { if(visited[ln] && visited[ln] != 'failed') visited[nodeName] = true;});
					}

					
					lastNode = [nodeName];

					let repeatNode = obj.children[obj.children.length-1], connectingNode;
					let l = graph(fsm, state.Then, "push_"+id, repeatNode);
					if(repeatNode.children.length>0){										
						obj.children[obj.children.length-1].edges.push(drawEdge(nodeName, repeatNode.children[0].id, repeatNode, undefined, nodeName+"_p0"));						
					}

					l.forEach(n => {
						obj.children[obj.children.length-1].edges.push(drawEdge(n, nodeName, repeatNode, undefined, undefined, nodeName+"_p1"));
					});
				}
				else{
					// new: condition node combined with the previous node. if multiple lastNode, insert a dummy then branch out. 					
					if(lastNode.length == 1){
						// this should be the most common condition 
						// not inserting anynode. add a property in fsm
						let conNode = lastNode[0];
						for(var i=obj.children.length-1; i>=0; i--){
							if(obj.children[i].id == conNode){
								obj.children[i].properties.choice = true;
								break;
							}
						}

						let l1 = graph(fsm, state.Then, "pass_"+id, obj, lastNode, "y");
						let l2 = graph(fsm, state.Else, "pass_"+id, obj, lastNode, "n");	
						
						lastNode = l2.concat(l1);
					}
					else if(lastNode.length > 1){
						let d = addDummy(lastNode, [], obj);
						if(isAct){
							lastNode.forEach(ln => { if(visited[ln] && visited[ln] != 'failed') visited[d] = true;});
						}
						obj.children[obj.children.length-1].properties.choice = true;

						let l1 = graph(fsm, state.Then, "pass_"+id, obj, [d], "y");
						let l2 = graph(fsm, state.Else, "pass_"+id, obj, [d], "n");	

						lastNode = l2.concat(l1);

					}
					else{
						// length == 0 --> would that ever happen?
						// copy the old method 
						obj.children.push(drawNode(name, "yes/no?"));	

						lastNode.forEach(ln => obj.edges.push(drawEdge(ln, nodeName, obj)));
						if(isAct){
							lastNode.forEach(ln => { if(visited[ln] && visited[ln] != 'failed') visited[nodeName] = true;});
						}
						lastNode = [nodeName];

						let l1 = graph(fsm, state.Then, "pass_"+id, obj, lastNode, "y");
						let l2 = graph(fsm, state.Else, "pass_"+id, obj, lastNode, "n");	

						
						lastNode = l2.concat(l1);
					}

					// some idea: condition node is wrapped by a condition compound node
					/*let pushId = "push_"+id;
					obj.children.push(drawNode(pushId, "condition", true));
					lastNode.forEach(ln => obj.edges.push(drawEdge(ln, pushId, obj)));
					let pushCompoundNode = obj.children[obj.children.length-1];
					graph(fsm, fsm.States[pushId].Next, name, pushCompoundNode);*/

					// old: Choice node
					/*obj.children.push(drawNode(name, "yes/no?"));	

					lastNode.forEach(ln => obj.edges.push(drawEdge(ln, nodeName, obj)));
					lastNode = [nodeName];

					let l1 = graph(fsm, state.Then, "pass_"+id, obj, lastNode, "y");
					let l2 = graph(fsm, state.Else, "pass_"+id, obj, lastNode, "n");	

					
					lastNode = l2.concat(l1);*/
					//lastNode = l1.concat(l2);
				}
				
				
				next = fsm.States["pass_"+id].Next;	

			}					
			else if(Type == "Try"){
						
				let id = name.substring("try_".length), passName = "pass_"+id, handlerName = "handler_"+id, catchName = "catch_"+id, tryCatchName = "try_catch_"+id;
				// first, the try_catch block
				let tryLabel = "Try-Catch";
				if(state.count){
					if(state.count != 1)
						tryLabel += ": Retry up to "+state.count+" times when failed"
					else
						tryLabel += ": Retry up to "+state.count+" time when failed"
				}
				obj.children.push(drawNode(tryCatchName, tryLabel, true, {direction:"RIGHT", 'org.eclipse.elk.direction': 'RIGHT'}));
				// the edge from lastNode to tryCatch
				//if(lastNode) obj.edges.push(drawEdge(lastNode, tryCatchName, obj));		
				lastNode.forEach(ln => obj.edges.push(drawEdge(ln, tryCatchName, obj)));
				if(isAct){
					lastNode.forEach(ln => { if(visited[ln] && visited[ln] != 'failed') visited[tryCatchName] = true;});					
				}


				let tryCatchNode = obj.children[obj.children.length-1];

				// insert node try and catch in tryCatch
				tryCatchNode.children.push(drawNode(name, "try", true));				

				tryCatchNode.children.push(drawNode(handlerName, "handler", true));				

				// edge between try and catch
				tryCatchNode.edges.push(drawEdge(name, handlerName, tryCatchNode));

				let tryNode = tryCatchNode.children[0], 
					handlerNode = tryCatchNode.children[1];

				// highlight the first visited 
				if(isAct){
					if(visited[tryCatchName]){
						visited[tryNode.id] = true;
						visited[state.Next] = true;	
					}
				}

				// draw try branch in try
				graph(fsm, state.Next, catchName, tryNode);		

				if(isAct){
					let isHandler = false;
					tryNode.children.forEach(n => {if(visited[n.id] && visited[n.id] == 'failed') isHandler = true;});
					if(isHandler){
						visited[handlerNode.id] = true;						
						visited[state.Handler] = true;						
					}
				}

				//console.log(tryNode);
				// draw handler branch in handler
				graph(fsm, state.Handler, passName, handlerNode);
				//console.log(handlerNode);


				lastNode = [tryCatchName];
				next = fsm.States[passName].Next;
			}
			else if(Type == "Task"){
				if(state.Action)
					obj.children.push(drawNode(name, state.Action));
				else if(state.Function)
					obj.children.push(drawNode(name, state.Function));
				else if(state.Value){
					let label = "Value = "+JSON.stringify(state.Value);
					/*if(label.length>30)
						label = label.substring(0, 27)+"...";*/
					obj.children.push(drawNode(name, label));
				}
				else
					obj.children.push(drawNode(name));

				//if(lastNode) obj.edges.push(drawEdge(lastNode, name, obj));
				lastNode.forEach(ln => obj.edges.push(drawEdge(ln, name, obj)));
				lastNode = [name]; 

				if(state.Value){
					if(isAct){
						lastNode.forEach(ln => {if(visited[ln] && visited[ln] != 'failed') visited[name] = true;});
					}
				}
				else if(isAct && state.act && state.act.length>0){
					if(state.act[state.act.length-1].response && state.act[state.act.length-1].response.success)
						visited[name] = 'success';
					else
						visited[name] = 'failed';
				}

			}
			else if(Type == "Let"){
				let label = state.Symbol+" = "+state.Value;
				obj.children.push(drawNode(name, label));
				//if(lastNode) obj.edges.push(drawEdge(lastNode, name, obj));
				lastNode.forEach(ln => obj.edges.push(drawEdge(ln, name, obj)));
				if(isAct){
					lastNode.forEach(ln => {if(visited[ln] && visited[ln] != 'failed') visited[name] = true;});
				}
				lastNode = [name]; 
			}
			else if(Type == "Pop"){
				obj.children.push(drawNode(name));
				//if(lastNode) obj.edges.push(drawEdge(lastNode, name, obj));
				lastNode.forEach(ln => obj.edges.push(drawEdge(ln, name, obj)));
				let id = name.substring("pop_".length);
				if(fsm.States["push_"+id]){
					// build an extra edge from push to pop
					obj.edges.push(drawEdge("push_"+id, name, obj, "EAST"));
				}
				if(isAct){
					lastNode.forEach(ln => {if(visited[ln] && visited[ln] != 'failed') visited[name] = true;});
					// the forwarding wont start if lastnodes are failed or not executed 
					//if(fsm.States["push_"+id] && visited["push_"+id])
					//	visited[name] = true;
				}
				lastNode = [name];				
			}
			else if(Type == "Push"){
				if(state.choice){
					// delay everything to the choice node. pass to choice
					//next = state.choice;
				}
				else{
					obj.children.push(drawNode(name));					
					lastNode.forEach(ln => obj.edges.push(drawEdge(ln, name, obj)));
					if(isAct){
						lastNode.forEach(ln => {if(visited[ln] && visited[ln] != 'failed') visited[name] = true;});
					}
					lastNode = [name]; 
				}
			}
			else{
				if(name.indexOf("value") == 0) console.log(name, state);
				obj.children.push(drawNode(name));
				//if(lastNode) obj.edges.push(drawEdge(lastNode, name, obj));
				lastNode.forEach(ln => obj.edges.push(drawEdge(ln, name, obj)));

				if(isAct){
					lastNode.forEach(ln => {if(visited[ln] && visited[ln] != 'failed') visited[name] = true;});
				}
				lastNode = [name]; 
			}
			
		}
		else{
			// ignore - just do nothing
			if(state.Type == "Choice"){

				// the only time a choice state is ignored is the retry branch. go to the Else state
				next = state.Else;
			}
		}
		
		
		if(name == endName){
			break;
		}
		else if(endName.indexOf("catch_") == 0 && name.indexOf("catch_") == 0){
			// retry probably has bug. now for retry's try branch we stop as long as we see a catchk
			break;
		}
		else if(next != undefined){
			name = next;
		}
		else{
			name = state.Next;
		}
	}

	return lastNode;
}


function fsm2graph(fsm, containerId, w, h, activations){
	dummyCount = 0
	fsmData = {};
	graphData = {
		id: "root",
		label: "root",
		children: [],
		edges: []
	};

	$(".wskflowWarning").remove();

	if(fsm == undefined){
		console.log("obj == undefined");
		return;
	}		
	else if(fsm.States == undefined){
		console.log("obj is not a fsm");
		return;
	}

	if(activations){
		isAct = true;
		visited = {};
	}
	else
		isAct = false;

	console.log("[wskflow] add fsm annotations");
	fsm = processNodes(fsm, activations);
	if(!fsm){		
		console.log(fsm);
		console.log("print msg");
		$(containerId).html("<div class='wskflowWarning' style='margin:20px;'>This session was generated by an older version of the app. <br/><br/>We currently cannot visualize previous versions of apps, sorry. </div>");
		return;
	}
	
	fsmData = fsm;
	
	//console.log(JSON.stringify(fsm, null, 4));
	console.log("[wskflow] generating graph model");
	graph(fsm, "Entry", "Exit", graphData);

	if(isAct)
		console.log('[wskflow] visited nodes:', visited);
	//console.log(JSON.stringify(graphData, null, 4));
	console.log("[wskflow] inserting DOM, calling graph2doms");

	if(isAct)
		graph2doms(graphData, containerId, w, h, fsm, visited);
	else
		graph2doms(graphData, containerId, w, h, fsm);
	//console.log(graphData);
	//console.log(JSON.stringify(graphData, null, 4));
	//return "Done";
}

//fsm2graph(data);

module.exports = fsm2graph;
