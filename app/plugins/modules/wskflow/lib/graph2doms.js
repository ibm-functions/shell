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
function graph2doms(JSONgraph, containerId, width, height, activations){

	let zoom = d3.behavior.zoom()
	    .on("zoom", redraw);
	
	$("#wskflowContainer").remove();
	$(containerId).append("<div id='wskflowContainer'></div>");	

	$("#wskflowContainer").css({
		"display": "none",
		"flex-direction": "column",
		"align-items": "center",
		"margin": "0 auto",
		"flex": "1",
		"font-weight": 400,
		"position": "relative",
    	"overflow": "hidden", // we'll do pan and zoom ourselves
		"-webkit-app-region": "no-drag",
		"width": '100%',
		"height": '100%'
	});
    $("#wskflowContainer").addClass('grabbable') // we want to use grab/grabbing cursor

	
	let ssvg = d3.select("#wskflowContainer")        
	    .append("svg")
	    .attr("id", "wskflowSVG")
	    .style('width', '100%')	// svg width and height changes with the size of the container 
	    .style('height', '100%')
	    .style("flex", "1")
	    .call(zoom);

	let container = ssvg.append('g')		
        .on("dblclick.zoom", null);

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


	if(activations){
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
	let elkData;
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
   			elkData = data;           

   			// by default, the graph resizes to fit the size of the container i.e. zoom-to-fit, showing the entire graph. This solves #582. 
			resizeToFit(width, height);

			console.log(`[wskflow] svg canvas width=${width}, height=${height}`);


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
					className += " leaf clickable";

				if(d.type != undefined){
					className += " "+d.type;
				}
				else{
					className += " "+d.label;
				}

                                // for tests, it is helpful to have a single css discriminant for functions and actions
                                if (d.type === "action" || d.type === "function") {
                                        className += " Task"
                                }

			        if(d.retryCount || d.repeatCount)
					className += " repeat";

				return className;
			})
			.attr("id", function(d){return d.id})
  		        .attr("data-task-index", d => d.taskIndex) // add a data-task-index for every task. taskIndex is maintained at the graph model level
		        .attr("data-name", function(d){
                            // make sure we obey the `/namespace/name` format
			    return d.label.charAt(0) !== '/' ? `/_/${d.label}` : d.label;
			})
			.attr("data-deployed", function(d){
				if(activations){
					
				}
				else{
					// only for preview graphs, not for session graphs
					if(d.type == "action"){
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

		box = node.append("rect")
			.attr("class", "atom")
			.attr("width", 0)
			.attr("height", 0)
			.attr("rx", function(d){
				if(d.children)
					return 0;
				else
					return 2;
			})
			.attr("ry", function(d){
				if(d.children)
					return 0;
				else
					return 2;
			})
			.style("fill", function(d){
				if(d.children){
					return "transparent"
				}
				else{
					if(activations){
						// session
						if(d.visited){
							let failed = true;	// assumption: all fail is fail. if one succes, we count it as success
							d.visited.forEach(i => {
								if(activations[i].response.success)
									failed = false;
							});
							if(failed){
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

					}
					else{
						// app
						if(d.type == "let" || d.type == "literal"){					
							//return "#4E387E";
							return wfColor.Value.normal;
						}
						else if(d.type == "Exit" || d.type == "Entry"){
							return wfColor.EE.normal;
						}
						else if(d.type === 'retain' || d.type === 'Dummy'){
							return 'black';
						}
						else{
							return wfColor.EE.normal;
						}

					}
				}
				
			})
			.style("stroke", function(d){					
				if(d.children){
					if(d.type == "try_catch") return wfColor.try_catch.normal;
					else if(d.type == "try") return wfColor.Try.normal;
					else if(d.type == "handler") return wfColor.handler.normal;
					else if(d.id !== 'root') return 'black';
					else return 'transparent';
				}
				else{
					if(activations && d.visited == undefined)
						return wfColorAct.inactiveBorder;
					else
						return 'black';
				}				
			})
			.style("stroke-width", function(d){
				if(d.children) return 1;
			})
			.style("stroke-dasharray", function(d){
				if(d.children) return 3;
			})		
			.style("x", function(d){
				if(d.type === 'retain') return 1;
				if(d.type === 'Dummy') return 1;
			})		
			.style("cursor", function(d){
				if(activations){
					if(d.visited && d.type === 'action')
						return 'pointer';
					else
						return 'normal';
				}
				else{
					if(d.type === 'action')
						return 'pointer';
					else
						return 'normal';
				}
			})
			.on("mouseover", function(d, i){
				let qtipText = "";
				
				if(activations){
					if(d.children === undefined && d.visited && $("#actList").css("display") != "block"){					
						if($(this).attr("failed")){
							$(this).css("fill", wfColorAct.failedHovered);
						}
						else{
							$(this).css("fill", wfColorAct.activeHovered);
						}
						
					    if(d.type == "action"){					
							// first, describe # activations if # > 1
							if(d.visited.length>1)
								qtipText += ("<div style='padding-bottom:2px;'>"+act.length+" activations</div>");

							let date;
							d.visited.forEach(i => {										
								// first part: time
								let a = activations[i],
									start = new Date(a.start),
									timeString = "";		

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
						//else if(d.type == "Exit" || d.type == 'Entry'){
						else if(d.type === 'Exit'){
							let act = activations[d.visited[0]];
							let start = new Date(act.start), timeString = (start.getMonth()+1)+"/"+start.getDate()+" ";		
							timeString += start.toLocaleTimeString(undefined, { hour12: false });
							let result = JSON.stringify(act.response.result)								
							if(result.length > 40)
								result = result.substring(0, 40) + "... ";

							qtipText += `<div style='padding-bottom:2px'>${d.type} <span style='color:${wfColorAct.active}'>${timeString}</span></div>${result}`							
							
						}

					}			
				}
				else{
					if(d.children){
						if(d.type == "try"){
							$(this).css("stroke", wfColor.Try.hovered);
							qtipText = "<span style='color: "+wfColor.Try.normal+"'>Try Block</span>"
						}
						else if(d.type == "handler"){
							$(this).css("stroke", wfColor.handler.hovered);
							qtipText = "<span style='color: "+wfColor.handler.normal+"'>Handler Block</span>"
						}
						else if(d.type == "try_catch"){
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
					else if(d.type == "action" && $('#'+d.id).attr('data-deployed') == 'not-deployed'){
						qtipText = "This action has not yet been deployed";
					}
					else if(d.type == "action" || d.type === 'function'){
						qtipText = `<span style="color:${wfColor.Task.normal}; padding-right:5px; ">${d.type} |</span> ${d.label}`;						
					}
					else if(d.type == "retain"){
					    let edgeId;
                                            const isOrigin = d.id.indexOf('__origin') > -1 ? true : false;
                                            const expectedSrc = isOrigin ? d.id : d.id.replace(/__terminus/,'__origin'),
                                                  expectedTerminus = isOrigin ? d.id.replace(/__origin/,'__terminus') : d.id
					    for(var i=0; i<links.length; i++){
						if(links[i].source === expectedSrc
                                                   && links[i].target === expectedTerminus){
								edgeId = links[i].id;
								break;
							}
						}

						if(edgeId){
							if(isOrigin)
								qtipText = "<span style='color: #85C1E9'>Retain: Data forwarding</span>";
							else
								qtipText = "<span style='color: #85C1E9'>Retain: Data merging</span>";

							$(".link[id='"+edgeId+"']").css("stroke", wfColor.Edges.forwarding).addClass("hover forwarding-edge");
						}
					}
					else if(d.type == "Entry" || d.type == "Exit"){
						qtipText = d.type;
					}
					else if(d.type == "let" || d.type == "literal"){					
						qtipText = d.label;
					}

					if(d.properties && d.properties.choice){
						if(qtipText.length != 0)
								qtipText += "<break></break>"
						//qtipText += "<span style='color: orange;'>yes</span> / <span style='color: #DC7633;'>no</span>?";						

						// also highlight the edges
						$(".link[source='"+(d.id+"_ptrue")+"']").css("stroke", wfColor.reOrCon.trueBranch).addClass("hover true-branch");
						$(".link[source='"+(d.id+"_pfalse")+"']").css("stroke", wfColor.reOrCon.falseBranch).addClass("hover false-branch");
					}				

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
				if(activations){
					if(d.children == undefined && d.visited && $("#actList").css("display") != "block"){
						if($(this).attr("failed")){
							$(this).css("fill", wfColorAct.failed);			
						}
						else{
							$(this).css("fill", wfColorAct.active);			
						}								
					}
				}
				else{
					if(d.children){
						if(d.type == "try") $(this).css("stroke", wfColor.Try.normal);
						else if(d.type == "handler") $(this).css("stroke", wfColor.handler.normal);
						else if(d.type == "try_catch") $(this).css("stroke", wfColor.try_catch.normal);
					}					
					else if(d.type == "action" && $('#'+d.id).attr('data-deployed') !== 'not-deployed'){
						$(this).css("fill", wfColor.Task.normal);					
					}
					$(".link").not(".forwardingLink").css("stroke", "grey");
				}					
				
				$(".link").removeClass("hover");
				$("#qtip").removeClass("visible");
				
			}).on("click", function(d, i){
				if(activations){
					if(d.visited){
						if($("#actList").css("display") != "block"){
							$("#listClose").click();
						}

						//if(d.type == "Exit" || d.type == 'Entry'){
						if(d.type === 'Exit'){
							//console.log(fsm.States[d.id].act[0]);
							ui.pictureInPicture(() => ui.showEntity(activations[d.visited[0]]),
	                                    d3.event.currentTarget.parentNode, // highlight this node
	                                    $("#wskflowContainer")[0],
	                                    'App Visualization'          // container to pip
	                                    )(d3.event)
							/*ui.pictureInPicture(() => repl.exec(`wsk activation get ${id}`, {echo: true}),
	                                    d3.event.currentTarget.parentNode, // highlight this node
	                                    $("#wskflowContainer")[0],
	                                    'App Visualization'          // container to pip
	                                    )(d3.event)               // pass along the raw dom event							
	                        */
						}
						else if(d.type == "action"){
							if($(this).attr("failed")){
								$(this).css("fill", wfColorAct.failed);
							}
							else{
								$(this).css("fill", wfColorAct.active);
							}
							
							$("#qtip").removeClass("visible");
							
							if(d.visited.length == 1){
								//repl.exec(`wsk action get "${d.name}"`, {sidecarPrevious: 'get myApp', echo: true});
								//let id = fsm.States[d.id].act[0].activationId;

								ui.pictureInPicture(() => ui.showEntity(activations[d.visited[0]]),
		                                    d3.event.currentTarget.parentNode, // highlight this node
		                                    $("#wskflowContainer")[0],
		                                    'App Visualization'          // container to pip		                                 
		                                    )(d3.event)               // pass along the raw dom event
							}
							else{
								//let act = fsm.States[d.id].act;
								let actListContent = "<div style='padding-bottom:5px'>Click on an activation here to view details</div>";
								actListContent += `<div>${d.label}<break</break>${d.visited.length} activations, ordered by start time: </div>`; 
								actListContent += "<ol style='padding-left: 15px;'>";
								let date;
								d.visited.forEach((n, i) => {										
									// first part: time
									let a = activations[n];
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

									lis += `<span class='actItem' style='color:${c}; text-decoration:underline; cursor: pointer;' aid='${a.activationId}' index=${n}>${timeString}</span> (${duration+unit})<break></break>`;
									
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
									//repl.exec(`wsk action get "${d.name}"`, {sidecarPrevious: 'get myApp', echo: true});
									let id = $(this).attr("aid"), index = $(this).attr('index');

									//ui.pictureInPicture(() => repl.exec(`wsk activation get ${id}`, {echo: true}),
									ui.pictureInPicture(() => ui.showEntity(activations[index]),
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
				}
				else{
					if(d.type == "action" && $('#'+d.id).attr('data-deployed') == 'deployed'){
						if(d.name){
							//repl.exec(`wsk action get "${d.name}"`, {sidecarPrevious: 'get myApp', echo: true});
							ui.pictureInPicture(() => repl.exec(`wsk action get "${d.name}"`, {sidecarPrevious: 'get myApp', echo: true}),
	                                    d3.event.currentTarget.parentNode, // highlight this node
	                                    $("#wskflowContainer")[0],
	                                    'App Visualization'          // container to pip	                                    
	                                    )(d3.event)               // pass along the raw dom event
						}
						else{

							console.log(`[wskflow] clicking on an inline function: ${d.label}`);
						}
					}
				}				
			});
		
		// add node labels
		node.append("text")
			.attr("x", function(d){
				//if(d.type == "try_catch" || d.type == "try" || d.type == "handler")
				if(d.children)
					return 4;
				else
					return d.width/2;
				
			})
			.attr("y", function(d){
				//if(d.type == "try_catch" || d.type == "try" || d.type == "handler")
				if(d.children)
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
				if(d.type == "retain" || d.type == "Dummy"){
					return "";
				}
				else if(d.id == "root"){
					return "";
				}				
				else if(d.type == "try"){
					return "Try";
				}
				else if(d.type == "handler"){
					return "Error Handler";
				}
				//else if(d.type == "try_catch" || d.type === 'retry'){
				else if(d.children){
					//return "Try Catch";
					return d.label;
				}
				/*else if(d.type == "if"){
					return d.label;					
				}	*/			
			    else if(d.type == "let" || d.type == "literal"){
					if(d.label.length>30)
						return d.label.substring(0, 27)+"...";
					else
						return d.label;
				}
				else if(d.type == "action" || d.type === 'function'){					
					return d.label					
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
			if(d.visited){
				return "url(#greenEnd)";
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
	                if(d.source.indexOf("__origin") >= 0 && d.target.indexOf("__terminus") >= 0){
				s += " forwardingLink";
			}
			//else if(d.)
			return s;
		})
		.attr("source", function(d){return d.sourcePort})
		.style("stroke", function(d){			
			if(activations){
				if(d.visited)
					return wfColorAct.active;
				else
					return wfColorAct.edgeInactive;
			}
			else{
 			        if(d.source.indexOf("__origin") >= 0 && d.target.indexOf("__terminus") >= 0){
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

 	// check if transition is complete. from https://stackoverflow.com/questions/10692100/invoke-a-callback-at-the-end-of-a-transition
	function endall(transition, callback) { 
	    if (typeof callback !== "function") throw new Error("Wrong callback in endall");
	    if (transition.size() === 0) { callback() }
	    var n = 0; 
	    transition 
	        .each(function() { ++n; }) 
	        .each("end", function() { if (!--n) callback.apply(this, arguments); }); 
	 }	

	/*
		After many tests, this is the right way to manually adjust values for `transform` without introducing unwanted behavior when zooming by mouse scrolling using d3's zoom feature.
		We have to set d3's zoom variable to have the same values as the values we'd like for `transform`. So when d3 calculates the values for event.translate/scale, it takes our manual adjustments into account. 		
	*/

	let applyAutoScale = true;	// if resizing the window will resize the graph. true by default. 
	
	function resizeToFit(w, h){	// resizeToFit implements a zoom-to-fit behavior. 
		width = w;
		height = h;
		let initScale = Math.min(width/elkData.width, height/elkData.height, 2),
			initTransX = Math.max(width/2 - elkData.width*initScale/2, 0),
			initTransY = 0;
		zoom.translate([initTransX, initTransY]); 
		zoom.scale(initScale);
		container.attr('transform', `matrix(${initScale}, 0, 0, ${initScale}, ${initTransX}, ${initTransY})`);		
	}

	function pan(w, h){			// pan implements a behavior that zooms in the graph by 2x. 
		width = w;
		height = h;
		let initScale = 2,
			initTransX = width/2 - elkData.width*initScale/2,
			initTransY = 0; 
		zoom.translate([initTransX, initTransY]); 
		zoom.scale(initScale);
		container.attr('transform', `matrix(${initScale}, 0, 0, ${initScale}, ${initTransX}, ${initTransY})`);
	}

 	/* 
 		from https://github.com/OpenKieler/klayjs-d3/blob/master/examples/interactive/index.js 	
 		redraw is called by d3. d3.event.translate and d3.event.scale handle moving the graph and zooming. Note that when zooming, both event.translate and event.scale change to let the zoom center be the mouse cursor. Adding ohter values to event.translate and event.scale is likely to cause unwanted behaviors. 
 	*/
	function redraw() {		
		if(applyAutoScale){	// exit zoom-to-fit mode when the user uses the mouse to move or zoom the graph 
			applyAutoScale = false;
			$('#zoomToFitButton').css('color', 'lightgrey');	
		}
     	$("#qtip").removeClass("visible") 
        container.attr('transform', `translate(${d3.event.translate}) scale(${d3.event.scale})`);
	}	

	// add a zoom-to-fit button. #422
	$('#wskflowContainer').append('<div id="zoomToFitButton" style="width:35px; height: 35px; border: solid 1px black; border-radius: 5px; padding: 4px; position:absolute; top: 10px; right: 10px; background-color:var(--color-stripe-02); color:mediumspringgreen; cursor:pointer;"><i class="fas fa-expand-arrows-alt" style="width: 100%; height:100%;"></i></div>');

	// zoom-to-fit button behavior
	$('#zoomToFitButton').click(() => {
		applyAutoScale = !applyAutoScale;	// toggle applyAotuScale
		if(applyAutoScale){
			// when clicking to switch from inactive to active, it resizes the graph to fit the window. #422
			$('#zoomToFitButton').css('color', 'mediumspringgreen');
			resizeToFit($('#wskflowSVG').width(), $('#wskflowSVG').height());
		}
		else{
			// when clicking to switch from active to inactive, it resizes the graph to zoom in at graph entry by 2x. 
			$('#zoomToFitButton').css('color', 'lightgrey');
			pan($('#wskflowSVG').width(), $('#wskflowSVG').height());
		}
	});

	// when zoom-to-fit is active, the graph resizes as the window resizes. #422
	$(window).unbind('resize').resize(() => {
	 	// auto-resize with window size works when the user haven't adjusted the zooming manually with scrolling. 
	 	if(applyAutoScale){
	 		resizeToFit($('#wskflowSVG').width(), $('#wskflowSVG').height());
	 	}	 	
	 	
	});
	
		 
}



module.exports = graph2doms;
