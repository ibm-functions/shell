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
 
const d3 = require('d3'),
	//klay = require('./lib/klayjs-d3.js'),
	$ = require('jquery'),
	maxLabelLength = 10,
	ELK = require('elkjs'),
	elk = new ELK();


const wfColor = {
	Task: {
		normal: "#90CAF9",
		undeployed: "lightgrey",
		hovered: "#42A5F5"	// old node color
	},
	EE: {
		//normal: "#ABB2B9"
		//normal: "lightgrey"
		normal: 'transparent'
	},
	Try: {
		//normal: "#82E0AA",
		//hovered: "#4CAF50"
		normal: "#90CAF9",
		hovered: "#42A5F5"	// old node color
	},
	handler: {
		normal: "#FE8A92",
		hovered: "#E91E63"
	},
	try_catch: {
		normal: "grey",
		hovered: "grey"
	},
	reOrCon: {
		normal: "#f9ac1d",
		trueBranch: "orange",
		falseBranch: "#DC7633"
	},
	Value: {
		normal: "#BB8FCE"
	},
	Dummy: {
		normal: "grey"
	},
	Edges: {
		normal: "grey",
		forwarding: "#3498DB"
	},
	qtipBackground: {
		normal: "#2E4053"
	}
}

const wfColorAct = {
	active: "#81C784",
	failed: "#EC7063",
	activeHovered: "#33a02c",
	failedHovered: "red",
	inactive: "lightgrey",
	edgeInactive: "grey",
	inactiveBorder: "grey"
}

// need to fix center
function graph2doms(JSONgraph, containerId, width, height, fsm, visited){

	let zoom = d3.behavior.zoom()
	    .on("zoom", redraw);

	$("#wskflowContainer").remove();
	$(containerId).append("<div id='wskflowContainer'></div>");	

	$("#wskflowContainer").css({
		"display": "none",
		"flex-direction": "column",
		"align-items": "center",
		"flex": "1",
		"font-family": "Roboto",
		"position": "relative",
		"-webkit-app-region": "no-drag",
		"width": "100%",
		"height": "100%"
	});

	
	let ssvg = d3.select("#wskflowContainer")
	    .append("svg")
	    .attr("id", "wskflowSVG")	   
	    .style("width", "100%")
	    .style("height", "100%")
	    .style("flex", "1");

	let container = ssvg.append('g')		
        .call(zoom)
        .on("dblclick.zoom", null);        
   
    container.append('rect')
    	.attr('width', width)
    	.attr('height', height)
    	.style('fill', 'none')
    	.style("pointer-events", "all");

	let svg = container
		.append("g")
	    .attr("id", "wskflowMainG");
	    
	// define an arrow head
	svg.append("svg:defs")
	     .append("svg:marker")
	      .attr("id", "end")
	      .attr("viewBox", "0 -5 10 10")
	      .attr("markerUnits", "userSpaceOnUse")
	      .attr("refX", 13)
	      .attr("refY", 0)
	      .attr("markerWidth", 3)        // marker settings
	      .attr("markerHeight", 5)
	      .attr("orient", "auto")
	      .style("fill", "#999")
	      .style("stroke-opacity", 0.6)  // arrowhead color
	     .append("svg:path")
	     .attr("d", "M0,-10L15,0L0,10");
	      //.attr("d", "M0,-5L10,0L0,5");

	svg.append("svg:defs")
		.append("svg:marker")
		.attr("id", "greenEnd")
		.attr("viewBox", "0 -5 10 10")
		.attr("markerUnits", "userSpaceOnUse")
		.attr("refX", 13)
		.attr("refY", 0)
		.attr("markerWidth", 3)        // marker settings
		.attr("markerHeight", 5)
		.attr("orient", "auto")
		.style("fill", wfColorAct.active)
		.style("stroke-opacity", 0.6)  // arrowhead color
		.append("svg:path")
		.attr("d", "M0,-10L15,0L0,10");

	svg.append("svg:defs")
		.append("svg:marker")
		.attr("id", "forwardingEnd")
		.attr("viewBox", "0 -5 10 10")
		.attr("markerUnits", "userSpaceOnUse")
		.attr("refX", 13)
		.attr("refY", 0)
		.attr("markerWidth", 3)        // marker settings
		.attr("markerHeight", 5)
		.attr("orient", "auto")
		.style("fill", wfColor.Edges.forwarding)
		.style("stroke-opacity", 0.6)  // arrowhead color
		.append("svg:path")
		.attr("d", "M0,-10L15,0L0,10");

	svg.append("svg:defs")
		.append("svg:marker")
		.attr("id", "trueEnd")
		.attr("viewBox", "0 -5 10 10")
		.attr("markerUnits", "userSpaceOnUse")
		.attr("refX", 13)
		.attr("refY", 0)
		.attr("markerWidth", 3)        // marker settings
		.attr("markerHeight", 5)
		.attr("orient", "auto")
		.style("fill", wfColor.reOrCon.trueBranch)
		.style("stroke-opacity", 0.6)  // arrowhead color
		.append("svg:path")
		.attr("d", "M0,-10L15,0L0,10");

	svg.append("svg:defs")
		.append("svg:marker")
		.attr("id", "falseEnd")
		.attr("viewBox", "0 -5 10 10")
		.attr("markerUnits", "userSpaceOnUse")
		.attr("refX", 13)
		.attr("refY", 0)
		.attr("markerWidth", 3)        // marker settings
		.attr("markerHeight", 5)
		.attr("orient", "auto")
		.style("fill", wfColor.reOrCon.falseBranch)
		.style("stroke-opacity", 0.6)  // arrowhead color
		.append("svg:path")
		.attr("d", "M0,-10L15,0L0,10");
    
	svg.append("svg:defs")
		.append("svg:marker")
		.attr("id", "greenEnd")
		.attr("viewBox", "0 -5 10 10")
		.attr("refX", 13)
		.attr("refY", 0)
		.attr("markerWidth", 3)        // marker settings
		.attr("markerHeight", 5)
		.attr("orient", "auto")
		.style("fill", wfColorAct.active)
		.style("stroke-opacity", 0.6)  // arrowhead color
		.append("svg:path")
		.attr("d", "M0,-10L15,0L0,10");

	svg.append("svg:defs")
	     .append("svg:g")
	      .attr("id", "retryIconNormal")	      
	      .attr("transform", "scale(0.02) rotate(90)")	       
	      .style("fill", wfColor.reOrCon.normal)
	     .append("svg:path")
	      .attr("d", "M852.8,558.8c0,194.5-158.2,352.8-352.8,352.8c-194.5,0-352.8-158.3-352.8-352.8c0-190.8,152.4-346.7,341.8-352.5v117.4l176.4-156.9L489,10v118C256.3,133.8,68.8,324.8,68.8,558.8C68.8,796.6,262.2,990,500,990c237.8,0,431.2-193.4,431.2-431.2H852.8z");
	
	$("#wskflowContainer").append("<div id='qtip'><span id='qtipArrow'>&#9668</span><div id='qtipContent'></div></div>");


	if(visited){
		$("#wskflowContainer").append("<div id='actList' style='position: absolute; display:none; background-color: rgba(0, 0, 0, 0.8); color: white; font-size: 0.75em; padding: 1ex; width:225px; right: 5px; top: 5px;'></div>");		
	}
	$("#qtip").css({
		"position": "absolute",
		"align-items": "center",
		"pointer-events": "none",
	});
	$("#qtipArrow").css({
		"position": "relative",
		"left": "3px",
		"top": "1px",
		"color": "#2E4053"
	});
	$("#qtipContent").css({
		"background-color": wfColor.qtipBackground.normal,
		"color": "white", 
		"font-size": "0.75em",		
		"padding": "1ex",
		"display": "flex",
		"flex-wrap": "wrap",
		"margin": "0px",
		"max-width": "30ex",
		"word-wrap": "break-word",
		
	})

	
	var root = svg.append("g");

	elk.layout(JSONgraph,
		{	
			layoutOptions:{
				'elk.algorithm': 'org.eclipse.elk.layered',
				'org.eclipse.elk.direction': 'DOWN',
				'org.eclipse.elk.edgeRouting': "ORTHOGONAL",
				'org.eclipse.elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
				'org.eclipse.elk.layered.cycleBreaking.strategy': "DEPTH_FIRST",				
				'org.eclipse.elk.insideSelfLoops.activate': true
			}				
		})
   		.then(data => {

			// scale to fit but no zooming in more than 2
			let initScale = Math.min(width/data.width, height/data.height, 2);

			// initial translate - only X, y stays at 0
			let initTransX = Math.max(width/2 - data.width*initScale/2, 0);		
			let initTransY = 0; 

			container.attr('transform', `matrix(${initScale}, 0, 0, ${initScale}, ${initTransX}, ${initTransY})`);

			console.log(`[wskflow] svg canvas width=${width}, height=${height}`);
			console.log(`[wskflow] initial scaling and translate: matrix(${initScale}, 0, 0, ${initScale}, ${initTransX}, ${initTransY}`);


		    let getNodes = function(graph) {
		        var queue = [graph],
		            nodes = [],
		            parent;
		        // note that svg z-index is document order, literally
		        while ((parent = queue.pop()) != null) {
		          nodes.push(parent);
		          
		          (parent.children || []).forEach(function(c) {
		          	c.x += parent.x; c.y+=parent.y;
		          	if(c.edges){
		          		for(var i=0; i<c.edges.length; i++){
			          		c.edges[i].sections[0].startPoint.x += c.x;
			          		c.edges[i].sections[0].startPoint.y += c.y;
			          		c.edges[i].sections[0].endPoint.x += c.x;
			          		c.edges[i].sections[0].endPoint.y += c.y;

			          		if(c.edges[i].sections[0].bendPoints){
			          			for(var j=0; j<c.edges[i].sections[0].bendPoints.length; j++){
			          				c.edges[i].sections[0].bendPoints[j].x += c.x;
			          				c.edges[i].sections[0].bendPoints[j].y += c.y;
			          			}
			          		}
			          	}        
		          	}

		            queue.push(c);
		          });
		        }
		        return nodes;
		      };



		    let getLinks = function(nodes) {
		        return d3.merge(nodes.map(function(n) {
		          return n.edges || [];
		        }));
		      };
		    let nodes = getNodes(data), links = getLinks(nodes);
		    let edges = [];
		    links.forEach(link => {
		    	// convert new elk edge format into old klay edge format to work with the d3 drawing code
		    	// TODO: update the d3 drawing code to work with the elk edge format
		    	// new format doc: http://www.eclipse.org/elk/documentation/tooldevelopers/graphdatastructure/jsonformat.html
		    	let o = {
		    		id: link.id,
		    		source: link.source,
		    		sourcePort: link.sourcePort,
		    		target: link.target,
		    		targetPort: link.targetPort,
		    		sourcePoint: {
		    			x: link.sections[0].startPoint.x,
		    			y: link.sections[0].startPoint.y
		    		}, 
		    		targetPoint: {
		    			x: link.sections[0].endPoint.x,
		    			y: link.sections[0].endPoint.y
		    		},
		    		bendPoints: []
		    	}

		    	if(link.sections[0].bendPoints){
		    		link.sections[0].bendPoints.forEach(bp => o.bendPoints.push(bp));
		    	}

		    	edges.push(o);
		    });

		    //console.log(nodes);
		    //console.log(links);
		    //console.log(edges);
		    drawGraph(nodes, edges);
			

   		})
   		.catch(err => {
   			console.log('[wskflow] error: ', err);
   		})


	function drawGraph(nodes, links){
		console.log("[wskflow] in drawGraph in graph2doms")
		
		// #1 add the nodes' groups
		var nodeData = root.selectAll(".node")
		.data(nodes,  function(d) { return d.id; });
		
		var node = nodeData.enter()
		.append("g")
			.attr("class", function(d) {
				//console.log(d);
				let className = "node";

				if (d.children)
					className += " compound";
				else
					className += " leaf";

				if(d.Type != undefined){
					className += " "+d.Type;
				}
				else{
					className += " "+d.label;
				}

				if(d.label.indexOf("Try-Catch:") != -1 || d.label.indexOf("Repeat ") != -1)
					className += " repeat";

				return className;
			})
			.attr("id", function(d){return d.id})
			.attr("data-name", function(d){
				if(d.Type == "Task"){
					return d.label;
				}				
			})
			.attr("data-deployed", function(d){
				if(visited){
					
				}
				else{
					// only for preview graphs, not for session graphs
					if(d.Type == "Task"){
						if(d.undeployed){
							return "not-deployed";
						}
						else{
							return "deployed";
						}
					}
				}
				
			});


		// add representing boxes for nodes
		let box;
		if(visited){		
			console.log("[wskflow] draw session graph");
			box = node.append("rect")
				.attr("class", "atom")
				.attr("width", 0)
				.attr("height", 0)
				.attr("rx", function(d){
					if(d.Type == "try_catch" || d.Type == "Try" || d.Type == "handler")
						return 0;
					else
						return 2;
				})
				.attr("ry", function(d){
					if(d.Type == "try_catch" || d.Type == "Try" || d.Type == "handler")
						return 0;
					else
						return 2;
				})
				.style("fill", function(d){
					if(d.children){
						return "transparent"
					}
					else if(visited[d.id]){
						if(visited[d.id] == 'failed'){
							$(this).attr("failed", true);
							$(`#${d.id}`).attr('data-status', 'failed');
							return wfColorAct.failed;
						}
						else{
							$(`#${d.id}`).attr('data-status', 'success');
							return wfColorAct.active;
						}
					}					
					else{
						$(`#${d.id}`).attr('data-status', 'not-run');
						return wfColorAct.inactive;
					}
					
				})
				.style("stroke", function(d){					
					if(d.children){
						if(d.Type == "try_catch") return wfColor.try_catch.normal;
						else if(d.Type == "Try") return wfColor.Try.normal;
						else if(d.Type == "handler") return wfColor.handler.normal;
					}
					else if(d.Type == "Task" || d.Type == "Entry" || d.Type == "Exit" || d.Type == "Value" || d.Type == "Push" || d.Type == "Pop" || d.Type == "Dummy"){
						if(visited[d.id])
							return "black";
						else
							return wfColorAct.inactiveBorder;
					}					
					else{
						return "transparent";
					}
				})
				.style("stroke-width", function(d){
					if(d.children) return 1;
				})
				.style("stroke-dasharray", function(d){
					if(d.children) return 3;
				})		
				.style("x", function(d){
					//if(d.Type == "Dummy") return 1;
				})		
				.style("cursor", function(d){
					if(visited[d.id]){
						if(d.Type == "Task" && fsm.States[d.id].Function == undefined){
							return "pointer";
						}
						else{
							return "normal";
						}
					}
				})
				.on("mouseover", function(d, i){
					let qtipText = "";
					
					if(fsm.States[d.id] && fsm.States[d.id].act && $("#actList").css("display") != "block" && fsm.States[d.id].Function == undefined){					
						if($(this).attr("failed")){
							$(this).css("fill", wfColorAct.failedHovered);
						}
						else{
							$(this).css("fill", wfColorAct.activeHovered);
						}
						
						if(d.Type == "Task" && fsm.States[d.id].Action){							
							let act = fsm.States[d.id].act;
							// first, describe # activations if # > 1
							if(act.length>1)
								qtipText += ("<div style='padding-bottom:2px;'>"+act.length+" activations</div>");
							let date;
							act.forEach(a => {										
								// first part: time
								let start = new Date(a.start), timeString = "";		
								if(date == undefined || date != (start.getMonth()+1)+"/"+start.getDate()){
									date = (start.getMonth()+1)+"/"+start.getDate();
									timeString += date + " ";
								}
								
								timeString += start.toLocaleTimeString(undefined, { hour12: false });
								
								let duration = a.duration, unit = "ms";
								if(duration > 1000){
									duration = (duration/1000).toFixed(2);
									unit = "s";
								}								
								let c;
								if(a.response.success)
									c = wfColorAct.active;
								else
									c = wfColorAct.failed;
								qtipText += "<span style='color:"+c+"'>"+timeString+"</span> ("+duration+unit+")<break></break>";
								let result = JSON.stringify(a.response.result)								
								if(result.length > 40)
									result = result.substring(0, 40) + "... ";
								qtipText += result;

								qtipText = "<div style='padding-bottom:2px;'>"+qtipText+"</div>";


							});	

						}
						else if(d.Type == "Exit"){
							let act = fsm.States[d.id].act[0];
							let start = new Date(act.start), timeString = (start.getMonth()+1)+"/"+start.getDate()+" ";		
							timeString += start.toLocaleTimeString(undefined, { hour12: false });
							qtipText += "<div style='padding-bottom:2px'>Exit <span style='color:"+wfColorAct.active+"'>"+timeString+"</span></div>"
							qtipText += "Final output: <break></break>";
							let result = JSON.stringify(act.response.result)								
							if(result.length > 40)
								result = result.substring(0, 40) + "... ";
							qtipText += result;
						}

					}
					else{

					}
										

					if(d.properties && d.properties.choice){
						/*if(qtipText.length != 0)
								qtipText += "<break></break>"
						qtipText += "<span style='color: orange;'>yes</span> / <span style='color: #DC7633;'>no</span>?";						
						*/
						// also highlight the edges
						//$(".link[source='"+(d.id+"_ptrue")+"']").css("stroke", wfColor.reOrCon.trueBranch).css("stroke-width", 2);
						//$(".link[source='"+(d.id+"_pfalse")+"']").css("stroke", wfColor.reOrCon.falseBranch).css("stroke-width", 2);
					}				

					if(qtipText.length != 0){
						$("#qtipContent").html(qtipText);

						$("#qtip").addClass("visible");

						let qtipX = $(this).offset().left+$(this)[0].getBoundingClientRect().width - $("#wskflowContainer").offset().left;
						let qtipY = $(this).offset().top+$(this)[0].getBoundingClientRect().height/2-$("#qtip").height()/2 - $("#wskflowContainer").offset().top
						if($("#wskflowContainer").hasClass("picture-in-picture")){
							// currentScale: 0.25
							let scaleString = $("#wskflowContainer").css("transform"), scale;
							try{
								scale = parseFloat(scaleString.substring("matrix(".length, scaleString.indexOf(",")));
							}
							catch(e){
								console.log(e);
								console.log(scaleString);
								scale = 0.25
							}												

							qtipX /= scale;
							qtipY = $(this).offset().top+$(this)[0].getBoundingClientRect().height/2-$("#qtip").height()/2*scale - $("#wskflowContainer").offset().top;
							qtipY /= scale;
						}
						$("#qtip").css({						
							"left": qtipX,
							"top": qtipY,
						});
					}
					
				}).on("mouseout", function(d, i){
					if(fsm.States[d.id] && fsm.States[d.id].act && $("#actList").css("display") != "block" && fsm.States[d.id].Function == undefined){
						if($(this).attr("failed")){
							$(this).css("fill", wfColorAct.failed);			
						}
						else{
							$(this).css("fill", wfColorAct.active);			
						}
									
					}
					else{

					}
					
					//$(".link").not(".forwardingLink").css("stroke", "grey");
					$(".link").removeClass("hover");
					$("#qtip").removeClass("visible");
					//$("use").attr("xlink:href", "#retryIconNormal").attr("href", "#retryIconNormal");
					
				}).on("click", function(d, i){
					if(fsm.States[d.id] && fsm.States[d.id].act && fsm.States[d.id].Function == undefined && d.Type != "Exit"){
						if($("#actList").css("display") != "block"){
							$("#listClose").click();
						}



						//if(d.Type == "Task" || d.Type == "Exit"){
						if(d.Type == "Task"){
							if($(this).attr("failed")){
								$(this).css("fill", wfColorAct.failed);
							}
							else{
								$(this).css("fill", wfColorAct.active);
							}
							
							$("#qtip").removeClass("visible");

							/*if(d.Type == "Exit"){
								//repl.exec(`wsk action get ${d.name}`, {sidecarPrevious: 'get myApp', echo: true});
								let id = fsm.States["Exit"].act[0].activationId;
								ui.pictureInPicture(() => repl.exec(`wsk activation get ${id}`, {echo: true}),
		                                    d3.event.currentTarget.parentNode, // highlight this node
		                                    $("#wskflowContainer")[0],
		                                    'App Visualization'          // container to pip
		                                    )(d3.event)               // pass along the raw dom event							

							}*/
							// in the new design, Exit is not clickable
							if(fsm.States[d.id].act.length == 1){
								//repl.exec(`wsk action get ${d.name}`, {sidecarPrevious: 'get myApp', echo: true});
								let id = fsm.States[d.id].act[0].activationId;
								ui.pictureInPicture(() => repl.exec(`wsk activation get ${id}`, {echo: true}),
		                                    d3.event.currentTarget.parentNode, // highlight this node
		                                    $("#wskflowContainer")[0],
		                                    'App Visualization'          // container to pip		                                 
		                                    )(d3.event)               // pass along the raw dom event
							}
							else{
								let act = fsm.States[d.id].act;
								let actListContent = "<div style='padding-bottom:5px'>Click on an activation here to view details</div>";
								actListContent += `<div>${d.label}<break</break>${act.length} activations, ordered by start time: </div>`; 
								actListContent += "<ol style='padding-left: 15px;'>";
								let date;
								act.forEach(a => {										
									// first part: time
									let start = new Date(a.start), timeString = "", lis = "";		
									if(date == undefined || date != (start.getMonth()+1)+"/"+start.getDate()){
										date = (start.getMonth()+1)+"/"+start.getDate();
										timeString += date + " ";
									}
									
									timeString += start.toLocaleTimeString(undefined, { hour12: false });
									
									let duration = a.duration, unit = "ms";
									if(duration > 1000){
										duration = (duration/1000).toFixed(2);
										unit = "s";
									}								
									let c;
									if(a.response.success)
										c = wfColorAct.active;
									else
										c = wfColorAct.failed;
									lis += "<span class='actItem' style='color:"+c+"; text-decoration:underline; cursor: pointer;' aid='"+a.activationId+"'>"+timeString+"</span> ("+duration+unit+")<break></break>";
									let result = JSON.stringify(a.response.result);							
									if(result.length > 40)
										result = result.substring(0, 40) + "... ";
									lis += result;

									actListContent += "<li>"+lis+"</li>";

								});	

								actListContent += "</ol>";

								actListContent = "<div id='listClose' style='font-size:14px; color:lightgrey; display:inline-block; float:right; cursor:pointer; padding-right:5px;'>✖</div>"+actListContent;

								$("#actList").html(actListContent).css("display", "block");

								$(".actItem").hover(function(e){
									$(this).css("text-decoration", "none");
								}, function(e){
									$(this).css("text-decoration", "underline");
								}).click(function(e){
									//repl.exec(`wsk action get ${d.name}`, {sidecarPrevious: 'get myApp', echo: true});
									let id = $(this).attr("aid");

									ui.pictureInPicture(() => repl.exec(`wsk activation get ${id}`, {echo: true}),
			                                    $(this).parent()[0], // highlight this node
			                                    $("#wskflowContainer")[0],
			                                    'App Visualization'          // container to pip			                                    
			                                    )(e)               // pass along the raw dom event
								})

								$("#listClose").click(function(e){
									$("#actList").css("display", "none");
									$("#"+d.id).children("rect").css("fill", wfColorAct.active);
									$(this).css("fill", wfColorAct.activeHovered);
								});

								$("#qtip").removeClass("visible");


							}
						}

					}


					
				});

		}
		// static
		else{
			console.log("[wskflow] draw app graph")
			box = node.append("rect")
				.attr("class", "atom")
				.attr("width", 0)
				.attr("height", 0)
				.attr("rx", function(d){
					if(d.Type == "try_catch" || d.Type == "Try" || d.Type == "handler")
						return 0;
					else
						return 2;
				})
				.attr("ry", function(d){
					if(d.Type == "try_catch" || d.Type == "Try" || d.Type == "handler")
						return 0;
					else
						return 2;
				})
				.style("fill", function(d){				
					if(d.children){
						return "transparent"
					}
					/*else if(d.Type == "Choice")
						return "orange";*/
					else if(d.Type == "Value"){					
						//return "#4E387E";
						return wfColor.Value.normal;
					}
					else if(d.Type == "Task"){
						//return "#3498DB";
						if($('#'+d.id).attr('data-deployed') === 'not-deployed'){
							return wfColor.Task.undeployed;
						}
						else{
							return wfColor.Task.normal;
						}
						
					}
					else if(d.Type == "Exit" || d.Type == "Entry"){
						return wfColor.EE.normal;
					}
				})
				.style("stroke", function(d){
					if(d.children){
						if(d.Type == "try_catch") return wfColor.try_catch.normal;
						else if(d.Type == "Try") return wfColor.Try.normal;
						else if(d.Type == "handler") return wfColor.handler.normal;
					}
					else if(d.Type == "Task" || d.Type == "Entry" || d.Type == "Exit" || d.Type == "Value"){
						return "black";
					}
					else if(d.Type == "Push" || d.Type == "Pop" || d.Type == "Dummy"){
						return wfColor.Edges.normal;
					}
					else{
						return "transparent";
					}
				})
				.style("stroke-width", function(d){
					if(d.children) return 1;
				})
				.style("stroke-dasharray", function(d){
					if(d.children) return 3;
				})
				.style("x", function(d){
					//if(d.Type == "Dummy") return 1;
				})	
				.on("mouseover", function(d, i){
					let qtipText = "";

					if(d.children){
						if(d.Type == "Try"){
							$(this).css("stroke", wfColor.Try.hovered);
							qtipText = "<span style='color: "+wfColor.Try.normal+"'>Try Block</span>"
						}
						else if(d.Type == "handler"){
							$(this).css("stroke", wfColor.handler.hovered);
							qtipText = "<span style='color: "+wfColor.handler.normal+"'>Handler Block</span>"
						}
						else if(d.Type == "try_catch"){
							$(this).css("stroke", wfColor.try_catch.hovered);
							if(d.label.indexOf(":") != -1){						
								qtipText = "Try-Catch:<span style='color: orange'>"+d.label.substring(d.label.indexOf(":")+1)+"</span>";						
								//$(this).siblings("use").attr("xlink:href", "#retryIconOrange").attr("href", "#retryIconOrange");
							}
							else if(d.label.indexOf("Repeat") != -1){
								let num = d.label.split(" ")[1];
								qtipText = "Repeat "+"<span style='color: orange'>"+num+" times</span> then continue";									
								//$(this).siblings("use").attr("xlink:href", "#retryIconOrange").attr("href", "#retryIconOrange");
							}
							else{
								//qtipText = "<span style='color: #E5E8E8'>"+d.label+"</span>"
								qtipText = d.label;
							}
							
						}

					}
					else if(d.Type == "Task" && $('#'+d.id).attr('data-deployed') == 'not-deployed'){
						qtipText = "This action has not yet been deployed";
					}
					else if(d.Type == "Task"){
						$(this).css({
							"fill": wfColor.Task.hovered,
							"cursor": "pointer"
						});
						qtipText = "<span style='color: "+wfColor.Task.normal+"; padding-right:5px'>action |</span> "+d.label;							
					}
					else if(d.Type == "Push" || d.Type == "Pop"){
						let id, edgeId;
						if(d.Type == "Push"){
							id = d.id.substring("push_".length);
						}
						else{
							id = d.id.substring("pop_".length);
						}
						for(var i=0; i<links.length; i++){
							if(links[i].source == "push_"+id && links[i].target == "pop_"+id){
								edgeId = links[i].id;
								break;
							}
						}
						if(edgeId){
							if(d.Type == "Push")
								qtipText = "<span style='color: #85C1E9'>Retain: Data forwarding</span>";
							else
								qtipText = "<span style='color: #85C1E9'>Retain: Data merging</span>";

							$(".link[id='"+edgeId+"']").css("stroke", wfColor.Edges.forwarding).addClass("hover forwarding-edge");
						}
					}
					else if(d.Type == "Entry" || d.Type == "Exit"){
						qtipText = d.Type;
					}
					else if(d.Type == "Value"){					
						qtipText = d.label;
					}

					if(d.properties && d.properties.choice){
						if(qtipText.length != 0)
								qtipText += "<break></break>"
						qtipText += "<span style='color: orange;'>yes</span> / <span style='color: #DC7633;'>no</span>?";						

						// also highlight the edges
						$(".link[source='"+(d.id+"_ptrue")+"']").css("stroke", wfColor.reOrCon.trueBranch).addClass("hover true-branch");
						$(".link[source='"+(d.id+"_pfalse")+"']").css("stroke", wfColor.reOrCon.falseBranch).addClass("hover false-branch");
					}				

					if(qtipText.length != 0){
						$("#qtipContent").html(qtipText);

						$("#qtip").addClass("visible");

						let qtipX = $(this).offset().left+$(this)[0].getBoundingClientRect().width - $("#wskflowContainer").offset().left;
						let qtipY = $(this).offset().top+$(this)[0].getBoundingClientRect().height/2-$("#qtip").height()/2 - $("#wskflowContainer").offset().top
						if($("#wskflowContainer").hasClass("picture-in-picture")){
							// currentScale: 0.25
							let scaleString = $("#wskflowContainer").css("transform"), scale;
							try{
								scale = parseFloat(scaleString.substring("matrix(".length, scaleString.indexOf(",")));
							}
							catch(e){
								console.log(e);
								console.log(scaleString);
								scale = 0.25
							}												

							qtipX /= scale;
							qtipY = $(this).offset().top+$(this)[0].getBoundingClientRect().height/2-$("#qtip").height()/2*scale - $("#wskflowContainer").offset().top;
							qtipY /= scale;
						}
						$("#qtip").css({						
							"left": qtipX,
							"top": qtipY,
						});
					}
					
				}).on("mouseout", function(d, i){
					if(d.children){
						if(d.Type == "Try") $(this).css("stroke", wfColor.Try.normal);
						else if(d.Type == "handler") $(this).css("stroke", wfColor.handler.normal);
						else if(d.Type == "try_catch") $(this).css("stroke", wfColor.try_catch.normal);
					}
					else if(d.Type == "Task" && $('#'+d.id).attr('data-deployed') == 'deployed'){
						$(this).css("fill", wfColor.Task.normal);					
					}
					
					$(".link").not(".forwardingLink").css("stroke", "grey");
					$(".link").removeClass("hover");
					$("#qtip").removeClass("visible");
					//$("use").attr("xlink:href", "#retryIconNormal").attr("href", "#retryIconNormal");
					
				}).on("click", function(d, i){
					if(d.Type == "Task" && $('#'+d.id).attr('data-deployed') == 'deployed'){
						if(d.name){
							//repl.exec(`wsk action get ${d.name}`, {sidecarPrevious: 'get myApp', echo: true});
							ui.pictureInPicture(() => repl.exec(`wsk action get ${d.name}`, {sidecarPrevious: 'get myApp', echo: true}),
	                                    d3.event.currentTarget.parentNode, // highlight this node
	                                    $("#wskflowContainer")[0],
	                                    'App Visualization'          // container to pip	                                    
	                                    )(d3.event)               // pass along the raw dom event
						}
						else{

							console.log(`[wskflow] clicking on an inline function: ${d.label}`);
						}
					}
				});


		}

		// add node labels
		node.append("text")
			.attr("x", function(d){
				if(d.Type == "try_catch" || d.Type == "Try" || d.Type == "handler")
					return 4;
				else
					return d.width/2;
				
			})
			.attr("y", function(d){
				if(d.Type == "try_catch" || d.Type == "Try" || d.Type == "handler")
					return 8;
				else
					return d.height/2+2.5;
			})
			.attr("font-size", function(d){
				if(d.children)
					return "6px";
				else
					return "8px";
			})
			.style("fill", function(d){
				/*if(d.children) return "black";
				else return "white";*/
				if(d.children){
					if($("body").hasClass("theme-dark"))
						return "white";
					else
						return "black";
				}
				else{
					return "black";
				}
				
			})
			.style("text-anchor", function(d){
				if(!d.children)
					return "middle";
			})
			.style("pointer-events", "none")
			.text(function(d){
				if(d.Type == "Push" || d.Type == "Pop" || d.Type == "Dummy"){
					return "";
				}
				else if(d.id == "root"){
					return "";
				}
				else if(d.Type == "try_catch"){
					//return "Try Catch";
					return d.label;
				}
				else if(d.Type == "Try"){
					return "Try";
				}
				else if(d.Type == "handler"){
					return "Error Handler";
				}
				/*else if(d.Type == "Choice"){
					return d.label;					
				}	*/			
				else if(d.Type == "Value"){
					if(d.label.length>30)
						return d.label.substring(0, 27)+"...";
					else
						return d.label;
				}
				else if(d.Type == "Task"){
					// new code here to hide namespace and handle multi-line functions
					if(fsm.States[d.id]){
						if(fsm.States[d.id].Action){
							// action node, cut down namespace 
							if(fsm.States[d.id].Action.lastIndexOf("/") != -1 && fsm.States[d.id].Action.lastIndexOf("/") < fsm.States[d.id].Action.length-1){
								return fsm.States[d.id].Action.substring(fsm.States[d.id].Action.lastIndexOf("/")+1);
							}
							else{
								return fsm.States[d.id].Action;
							}
						}
						else if(fsm.States[d.id].Function){
							let s = fsm.States[d.id].Function;
							s = s.replace(/\s\s+/g, ' ');
							if(s.length > 40)
								return s.substring(0, 40)+"...";
							else
								return s;
						}

					}
					/*if(d.label.length>40){
						return d.label.substring(0, 37)+"...";
					}
					else
						return d.label;*/
				}
				else{
					let t = d.label;
					if(t == undefined)
						t = d.id;

					if(t.length > maxLabelLength){
						return t.substring(0, maxLabelLength-1)+"..."
					}
					else
						return t;

				}								
			});

		d3.select(".repeat").append("use")
		.attr("xlink:href", "#retryIconNormal").attr("href", "#retryIconNormal").attr("x", 10).attr("y", -14);
		
		// #2 add paths with arrows for the edges
		var linkData = root.selectAll(".link")
		.data(links, function(d) { return d.id; });

		var link = linkData.enter()
		.append("path")
		.attr("id", function(d){return d.id;})
		.attr("d", "M0 0")
		.attr("marker-end", function(d){
			if(visited){
				if(visited[d.source] && visited[d.target])
					return "url(#greenEnd)";
				else
					return "url(#end)";
			}
			else{
				return "url(#end)";
			}			
				
		})
		.attr("class", function(d){
			let s = "link";
			if(d.source.indexOf("try_") == 0 && d.target.indexOf("handler_") == 0){
				s += " TryCatchEdge";
			}
			if(d.source.indexOf("push_") == 0 && d.target.indexOf("pop_") == 0 && d.source.substring("push_".length) == d.target.substring("pop_".length)){
				s += " forwardingLink";
			}
			//else if(d.)
			return s;
		})
		.attr("source", function(d){return d.sourcePort})
		.style("stroke", function(d){
			if(visited){
				if(visited[d.source] && visited[d.target])
					return wfColorAct.active;
				else
					return wfColorAct.edgeInactive;
			}
			else{
				if(d.source.indexOf("push_") == 0 && d.target.indexOf("pop_") == 0 && d.source.substring("push_".length) == d.target.substring("pop_".length)){
					return wfColor.Edges.forwarding;
				}
				else{
					return wfColor.Edges.normal;
				}
			}
		})				
		.style({
			"fill": "transparent",
			"pointer-events": "none"
		})
		.attr("data-from-name", function(d){
			let fromId = d.source, isName = $("#"+fromId).attr("data-name");
			if(isName){
				return isName;
			}
		})
		.attr("data-to-name", function(d){
			let toId = d.target, isName = $("#"+toId).attr("data-name");
			if(isName){
				return isName;
			}
		});



		// #3 update positions of all elements
		let trans = 0;
		// node positions
		nodeData.transition().call(endall, function() { trans++; if(trans == 3) graphDoneCallback(); })
		.attr("transform", function(d) {
			return "translate(" + (d.x || 0) + " " + (d.y || 0) + ")";
		});
		// node sizes
		nodeData.select(".atom")
		.transition().call(endall, function() { trans++; if(trans == 3) graphDoneCallback(); })
		.attr("width", function(d) { return d.width; })
		.attr("height", function(d) { return d.height; });
		

		// edge routes
		linkData.transition().call(endall, function() { trans++; if(trans == 3) graphDoneCallback(); })
		.attr("d", function(d) {
			var path = "";
			if (d.sourcePoint && d.targetPoint) {
				path += "M" + d.sourcePoint.x + " " + d.sourcePoint.y + " ";
				(d.bendPoints || []).forEach(function(bp, i) {
					path += "L" + bp.x + " " + bp.y + " ";
				});
				path += "L" + d.targetPoint.x + " " + d.targetPoint.y + " ";
			}
			return path;
		});




		// edge labels
		links.forEach(edge => {			
			if(edge.sourcePort && (edge.sourcePort.indexOf("_ptrue") != -1 || edge.sourcePort.indexOf("_pfalse") != -1)){
				let t, d, x, y, reverse;					

				if(edge.sourcePort.indexOf("_ptrue") != -1){
					// add a text label next to its 
					t = "Y";						
				}	
				else if(edge.sourcePort.indexOf("_pfalse") != -1){
					t = "N";
				}
				
				if(t != undefined){
					for(var i=0; i<nodes.length; i++){
						if(nodes[i].id == edge.source){
							let tx, fx;
							for(var j=0; j<nodes[i].ports.length; j++){
								if(nodes[i].ports[j].id == edge.sourcePort){
									d = nodes[i].ports[j].properties.portSide;
									x = nodes[i].ports[j].x;
									y = nodes[i].ports[j].y;
									//break;
								}
								if(nodes[i].ports[j].id.indexOf("_ptrue") != -1){
									tx = nodes[i].ports[j].x;
								}
								if(nodes[i].ports[j].id.indexOf("_pfalse") != -1){
									fx = nodes[i].ports[j].x;
								}
							}
							
							if(tx && fx){
								if(tx > fx){
									reverse = true;
								}
							}

							break;

						}
					}
				}
				if(t != undefined && d != undefined){
					// add label
					if(d == "WEST") {x -= 7; y -= 3;}
					else if(d == "EAST") {x += 7; y -= 3;}
					else if(d == "NORTH") {
						y -= 7; 
						if(reverse){
							if(t == "N")
								x -= 7;
							else
								x += 3;
						}
						else{
							if(t == "Y")
								x -= 7;
							else
								x += 3;
						}
					}
					else if(d == "SOUTH") {
						y += 7;
						if(reverse){
							if(t == "N")
								x -= 7;
							else
								x += 3;
						}
						else{
							if(t == "Y")
								x -= 7;
							else
								x += 3;
						}
						
					}
					

					d3.select("#"+edge.source).append("text").attr("x", x).attr("y", y).text(t).
					style({
						"font-size":"6px",
						"fill": wfColor.reOrCon.normal,
						"font-weight": "bold"
					});	
					
				}
			}						
		});
	}


	function graphDoneCallback(){	
		// show graph 
   		$("#wskflowContainer").css("display", "flex");
 	} 		


 	// handle redraw and resetting layout. from https://github.com/OpenKieler/klayjs-d3/blob/master/examples/interactive/index.js
	function redraw() {
		$("#qtip").removeClass("visible")
        svg.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
	}		

	// check if transition is complete. from https://stackoverflow.com/questions/10692100/invoke-a-callback-at-the-end-of-a-transition
	function endall(transition, callback) { 
	    if (typeof callback !== "function") throw new Error("Wrong callback in endall");
	    if (transition.size() === 0) { callback() }
	    var n = 0; 
	    transition 
	        .each(function() { ++n; }) 
	        .each("end", function() { if (!--n) callback.apply(this, arguments); }); 
	 }	

		 
}



module.exports = graph2doms;
