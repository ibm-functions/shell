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
 
const d3 = require('d3'),
	$ = require('jquery'),
        { textualPropertiesOfCode } = require('./util'),
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

const containerId = 'wskflowDiv';

// need to fix center
function graph2doms(JSONgraph, ifReuseContainer, activations){
	let zoom = d3.behavior.zoom()
	    .on("zoom", redraw);

	let containerElement = $(`<div id="${containerId}" style="display: flex; flex: 1; width: 100%; height: 100%;"></div>`),
		wskflowContainer = $('<div id="wskflowContainer"></div>'),
		enterClickMode = false;	

	$(containerElement).append(wskflowContainer);	
	

	$(wskflowContainer).css({
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
    $(wskflowContainer).addClass('grabbable') // we want to use grab/grabbing cursor

	
	let ssvg = d3.select($(wskflowContainer)[0])        
	    .append("svg")
	    .attr("id", "wskflowSVG")
	    .style('width', '100%')	// svg width and height changes with the size of the container 
	    .style('height', '100%')
	    .attr("data-is-session-flow", !!activations)
	    .style("flex", "1")
	    .call(zoom);

	let container = ssvg.append('g')		
        .on("dblclick.zoom", null);

	let svg = container
		.append("g")
	    .attr("id", "wskflowMainG");


    const defs = svg.append("svg:defs")

    // a pattern mask for "not deployed"
    defs.append("svg:pattern")
        .attr('id', "pattern-stripe")
        .attr('width', 1.2)
        .attr('height', 1.2)
        .attr('patternUnits', "userSpaceOnUse")
        .attr('patternTransform', "rotate(45)")
        .append('svg:rect')
        .attr('width', 0.6)
        .attr('height', 2)
        .attr('transform', "translate(0,0)")
        .attr('fill', "#aaa") // this will be the opacity of the mask, from #fff (full masking) to #000 (no masking)
    defs.append('svg:mask')
        .attr('id', 'mask-stripe')
        .append('svg:rect')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('fill', "url(#pattern-stripe)")

        // define an arrow head
        const arrowHead = (id, color) => {
            defs.append("svg:marker")
	      .attr("id", id)
	      .attr("viewBox", "0 -5 10 10")
	      .attr("markerUnits", "userSpaceOnUse")
	      .attr("refX", 10)
	      .attr("refY", 0)
	      .attr("markerWidth", 4.2)        // marker settings
	      .attr("markerHeight", 7)
	      .attr("orient", "auto")
	      .style("fill", color)
 	      .append("svg:path")
	    .attr("d", "M0,-5L10,0L0,5");
        }

        arrowHead("end", "var(--color-text-02)")
        arrowHead("forwardingEnd", wfColor.Edges.forwarding)
        arrowHead("edgeTraversedEnd", "#2166ac")
        arrowHead("greenEnd", wfColorAct.active)
        arrowHead("trueEnd", wfColor.reOrCon.trueBranch)
        arrowHead("falseEnd", wfColor.reOrCon.falseBranch)

	defs.append("svg:g")
	      .attr("id", "retryIconNormal")	      
	      .attr("transform", "scale(0.02) rotate(90)")	       
	      .style("fill", wfColor.reOrCon.normal)
	     .append("svg:path")
	      .attr("d", "M852.8,558.8c0,194.5-158.2,352.8-352.8,352.8c-194.5,0-352.8-158.3-352.8-352.8c0-190.8,152.4-346.7,341.8-352.5v117.4l176.4-156.9L489,10v118C256.3,133.8,68.8,324.8,68.8,558.8C68.8,796.6,262.2,990,500,990c237.8,0,431.2-193.4,431.2-431.2H852.8z");

        if (!$("#qtip")[0]) {
            // add qtip to the document
	    $(document.body).append("<div id='qtip'><span id='qtipArrow'>&#9668</span><div id='qtipContent'></div></div>");
        }

	if(activations){
		$(wskflowContainer).append("<div id='actList' style='position: absolute; display:none; background-color: rgba(0, 0, 0, 0.8); color: white; font-size: 0.75em; padding: 1ex; width:225px; right: 5px; top: 5px;'></div>");		
	}

	var root = svg.append("g");
	let elkData;
	elk.layout(JSONgraph,
		{	
			layoutOptions:{
				'elk.algorithm': 'org.eclipse.elk.layered',
			        'org.eclipse.elk.direction': 'DOWN',
  			        'org.eclipse.elk.edgeRouting': "ORTHOGONAL",
      			        'org.eclipse.elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
                                'elk.layered.spacing.nodeNodeBetweenLayers': 15, // org.eclipse. prefix doesn't work (elk bug???)
			        'org.eclipse.elk.layered.cycleBreaking.strategy': "DEPTH_FIRST",
				'org.eclipse.elk.insideSelfLoops.activate': true
			}				
		})
   		.then(data => {
   			elkData = data;           

   			// by default, the graph resizes to fit the size of the container i.e. zoom-to-fit, showing the entire graph. This solves #582. 
			resizeToFit();

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
		    		labels: link.labels,
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

                                if (d.properties && d.properties.compoundNoParents) {
                                    className += ' no-parents'
                                }

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
                            const label = d.type === 'Entry' || d.type === 'Exit'
                                  ? d.type
                                  : d.multiLineLabel ? d.fullFunctionCode
                                  : d.label
			    return label && (label.charAt(0) !== '/' ? `/_/${label}` : label);
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
		        .attr("class", d => {
                            return "atom" + (d.type === 'action' ? " clickable" : '')
                        })
			.attr("width", 0)
			.attr("height", 0)
	                .attr("rx", function(d){
				if(d.type === 'Entry' || d.type === 'Exit')
					return '50%';
			})
			.attr("ry", function(d){
				if(d.type === 'Entry' || d.type === 'Exit')
					return '50%';
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
                                                    // from CSS now
						}
						else if(d.type == "Exit" || d.type == "Entry"){
                                                    // from CSS now
						}
						else if(d.type === 'retain' || d.type === 'Dummy'){
							return 'black';
						}
						else{
                                                     // from CSS now
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
                                let qtipPre = false;
				
				if(activations){
					if(d.children === undefined && d.visited && $("#actList").css("display") != "block"){					
						if($(this).attr("failed")){
							$(this).css("fill", wfColorAct.failedHovered);
						}
						else{
							$(this).css("fill", wfColorAct.activeHovered);
						}
						
					    if(d.type === "action"){					
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
						        let result = JSON.stringify(act.response.result, undefined, 4)
							if(result.length > 200)
								result = result.substring(0, 200) + "\u2026"; // horizontal ellipsis

							qtipText += `<div style='padding-bottom:2px'>${d.type} <span style='color:${wfColorAct.active}'>${timeString}</span></div>${result}`							
							
						}

					}			
				}
				else{
					if(d.children){
						if(d.type === "try"){
							$(this).css("stroke", wfColor.Try.hovered);
							qtipText = "<span style='color: "+wfColor.Try.normal+"'>Try Block</span>"
						}
						else if(d.type === "handler"){
							$(this).css("stroke", wfColor.handler.hovered);
							qtipText = "<span style='color: "+wfColor.handler.normal+"'>Handler Block</span>"
						}
						else if(d.type === "try_catch"){
						    $(this).css("stroke", wfColor.try_catch.hovered);
                                                    const label = d.label || d.tooltip || ''
						    if(label.indexOf(":") != -1){						
								qtipText = "Try-Catch:<span style='color: orange'>"+label.substring(label.indexOf(":")+1)+"</span>";						
								//$(this).siblings("use").attr("xlink:href", "#retryIconOrange").attr("href", "#retryIconOrange");
							}
							else if(label.indexOf("Repeat") != -1){
								let num = label.split(" ")[1];
								qtipText = "Repeat "+"<span style='color: orange'>"+num+" times</span> then continue";									
								//$(this).siblings("use").attr("xlink:href", "#retryIconOrange").attr("href", "#retryIconOrange");
							}
							else{
								//qtipText = "<span style='color: #E5E8E8'>"+label+"</span>"
								qtipText = label;
							}
							
						}

					}
					else if(d.type === "action" && $('#'+d.id).attr('data-deployed') === 'not-deployed'){
						qtipText = `<span class='qtip-prefix red-text'>Warning |</span> This action is not deployed`;
					}
				    else if(d.type === "action" || d.type === 'function'){
                                                if (d.type === 'function') {
                                            	    qtipPre = true; // use white-space: pre for function body
                                                }
                                                if (d.multiLineLabel) {
						    qtipText = `<span class='qtip-prefix ${d.type}'>${d.type}</span>`;
                                                } else {
						    qtipText = `<span class='qtip-prefix ${d.type}' style="padding-right:5px; ">${d.type} |</span> ${d.label||d.tooltip||d.prettyCode}`;
                                                }
					}
					else if(d.type === "retain"){
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
								qtipText = "<span class='qtip-prefix ${d.type}' style='padding-right:5px; color: #85C1E9'>Retain |</span> Data forwarding</span>";
							else
								qtipText = "<span class='qtip-prefix ${d.type}' style='padding-right:5px; color: #85C1E9'>Retain |</span> Data merging</span>";

							$(".link[id='"+edgeId+"']").css("stroke", wfColor.Edges.forwarding).addClass("hover forwarding-edge");
						}
					}
				        else if(d.type === "Entry") {
						qtipText = 'The composition starts here'
                                        } else if(d.type === "Exit"){
						qtipText = 'The composition ends here'
					}
					else if(d.type == "let" || d.type == "literal"){					
						qtipText = `<div class='qtip-prefix let' style="margin-bottom:1ex; padding-right:5px; ">${d.type}</div>${d.label||d.tooltip}`;						
					        qtipPre = true; // use white-space: pre
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
										

				if(qtipText && qtipText.length != 0){
					$("#qtipContent").html(qtipText);

				        $("#qtip").addClass("visible");

                                        if (qtipPre) $("#qtip").addClass("qtip-pre")
                                        else $("#qtip").removeClass("qtip-pre")

                                        const innerOffset = $(this).offset()
				        let qtipX = innerOffset.left+$(this)[0].getBoundingClientRect().width
					let qtipY = innerOffset.top+$(this)[0].getBoundingClientRect().height/2-$("#qtip").height()/2

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
				
			}).on('mousedown', () => {	
				enterClickMode = true;			
			}).on("click", function(d, i){
				if(!enterClickMode) return;
				enterClickMode = false;

				if(activations){
					if(d.visited){
						if($("#actList").css("display") != "block"){
							$("#listClose").click();
						}

						//if(d.type == "Exit" || d.type == 'Entry'){
						if(d.type === 'Exit'){
							//console.log(fsm.States[d.id].act[0]);
						        ui.pictureInPicture(activations[d.visited[0]],
	                                    d3.event.currentTarget.parentNode, // highlight this node
	                                    $("#wskflowContainer")[0],
	                                    'App Visualization'          // container to pip
	                                    )(d3.event)
							/*ui.pictureInPicture(`wsk activation get ${id}`, {echo: true}),
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

								ui.pictureInPicture(activations[d.visited[0]],
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

									//ui.pictureInPicture(`wsk activation get ${id}`, {echo: true}),
									ui.pictureInPicture(activations[index],
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
							ui.pictureInPicture(`wsk action get "${d.name}"`,
	                                    d3.event.currentTarget.parentNode, // highlight this node
	                                    $("#wskflowContainer")[0],
                                            'App Visualization',          // container to pip
                                            undefined, {sidecarPrevious: 'get myApp', echo: true}
	                                    )(d3.event)               // pass along the raw dom event
						}
						else{

							console.log(`[wskflow] clicking on an inline function: ${d.label}`);
						}
					}
				}				
			});
		
		// add node labels
		const textElements = node.append("text")
		      .attr("width", d => d.width)
			.attr("x", function(d){
				//if(d.type == "try_catch" || d.type == "try" || d.type == "handler")
				if(d.children)
					return 4;
      			        else if (d.multiLineLabel)
					return d.x;
                                else 
					return d.width/2;
				
			})
			.attr("y", function(d){
			    //if(d.type == "try_catch" || d.type == "try" || d.type == "handler")
				if(d.children)
					return 8;
   			        else if (d.multiLineLabel)
				    return (d.height - d.multiLineLabel.length * 6) / 2
   			        else
				    return d.height/2 + (d.type === 'Entry' || d.type === 'Exit' ? 1.5 : d.type === "let" ? 3.5 : 2);
			})
			.attr("font-size", function(d){
				if(d.children)
   				        return "6px";
                                else if (d.type === 'Entry' || d.type === 'Exit')
   				        return "6px";
				else
					return "7px";
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
				if(!d.children && !d.multiLineLabel)
					return "middle";
			})
		        .style("pointer-events", "none")
                        .attr("multi-line-label", d => d.multiLineLabel && d.multiLineLabel.join('\n'))
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
					return "Catch";
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
                                        return "{}"
					/*if(d.label.length>30)
						return d.label.substring(0, 27)+"...";
					else
						return d.label;*/
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

            for (let idx = 0; idx < textElements[0].length; idx++)  {
                const textElement = textElements[0][idx],
                      label = textElement.attributes && textElement.attributes.getNamedItem('multi-line-label'),
                      width = textElement.attributes && textElement.attributes.getNamedItem('width')

                if (label) {
                    const { nLines, maxLineLength } = textualPropertiesOfCode(label.value),
                          tabWidth = 2,
                          farLeft = (width.value - maxLineLength * 2.5) / 2

                    label.value.split(/\n/).forEach(line => {
                        const ws = /^\s+/,
                              wsMatch = line.match(ws),
                              length = line.length,
                              initialWhitespace = wsMatch ? wsMatch[0].length : 0

                        d3.select(textElement)
                            .append('tspan')
                            .text(line.replace(ws, ''))
                            .attr('x', farLeft + initialWhitespace * tabWidth)
                            .attr('dy', '1.25em')
                    })
                }
            }
            
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
	                } else if(d.source.indexOf("__origin") >= 0 && d.target.indexOf("__terminus") >= 0){
                                return "url(#forwardingEnd)";
			} else{
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

			return s;
		})
                .attr("data-visited", d => {
                    // edge was visited?
		    const sourceStatus = $('#' + d.source).attr('data-status'),
                          sourceWasVisited = sourceStatus && sourceStatus !== 'not-run',
                          targetStatus = $('#' + d.target).attr('data-status'),
                          targetWasVisited = targetStatus && targetStatus !== 'not-run'
                    if (sourceWasVisited && targetWasVisited) {
                        return true
                    } else if (activations) {
                        return false
                    }
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
		    if(edge.labels) {
                        edge.labels.forEach(({text, x, y, width, height}) => {
			    d3.select("#"+edge.source)
                                .append("text")
                                .classed("edge-label", true)
                                .attr("x", 10)
                                .attr("y", 0)
                                .text(text)
                        })
                    }
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

                                    const target = $(`#${edge.target}`),
                                          targetStatus = target && target.attr('data-status') || 'not-run',
                                          thisEdgeWasTraversed = targetStatus !== 'not-run'

				    d3.select("#"+edge.source).append("text").classed("edge-label", true).attr("x", x).attr("y", y).text(t)
                                        .classed('edge-was-traversed', thisEdgeWasTraversed)
				        .style({
						"font-size":"5px",
						"fill": wfColor.reOrCon.normal,
						"font-weight": "bold"
					});	
					
				}
			}						
		});
	}


	function graphDoneCallback(){	
		// show graph 
   		$(wskflowContainer).css("display", "flex");
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

        let applyAutoScale = true,	// if resizing the window will resize the graph. true by default.
            customZoom = false;
	
	function resizeToFit(){	
		// resizeToFit implements a zoom-to-fit behavior using viewBox. 
		// it no longer requires knowing the size of the container
		// disadventage is we cannot decide the max zoom level: it will always zoom to fit the entire container
		ssvg.attr('viewBox', `0 0 ${elkData.width} ${elkData.height}`);		
		container.attr('transform', '');
		zoom.translate([0, 0]); 
		zoom.scale(1);		
	}

	function pan(){			// pan implements a behavior that zooms in the graph by 2x. 
		let initScale = 2,
			initTransX = $('#wskflowSVG').width()/2 - elkData.width*initScale/2,
			initTransY = 0; 
		zoom.translate([initTransX, initTransY]); 
		zoom.scale(initScale);
		$('#wskflowSVG').removeAttr('viewBox');
		container.attr('transform', `matrix(${initScale}, 0, 0, ${initScale}, ${initTransX}, ${initTransY})`);
	}

        // any interested parties for zoom events
        // and notify interested parties that we entered custom mode
        const handlers = []
        const notify = () => handlers.forEach(_ =>  _( { applyAutoScale, customZoom }))

        /**
         * Zoom-to-fit button behavior
         *
         * @param useThisValue set a value, otherwise toggle the current value
         *
         */
        const zoomToFit = useThisValue => {
	        applyAutoScale = useThisValue !== undefined ? useThisValue : !applyAutoScale;	// toggle applyAutoScale
            customZoom = false
            notify()
            //console.error('ZTF', applyAutoScale, customZoom)
		if(applyAutoScale){
			// when clicking to switch from inactive to active, it resizes the graph to fit the window. #422
			resizeToFit();
		}
		else{
			// when clicking to switch from active to inactive, it resizes the graph to zoom in at graph entry by 2x. 
			pan();
		}
	}

 	/* 
 		from https://github.com/OpenKieler/klayjs-d3/blob/master/examples/interactive/index.js 	
 		redraw is called by d3. d3.event.translate and d3.event.scale handle moving the graph and zooming. Note that when zooming, both event.translate and event.scale change to let the zoom center be the mouse cursor. Adding ohter values to event.translate and event.scale is likely to cause unwanted behaviors. 
 	*/
	function redraw() {	// redraw is called when there's mouse scrolling	
		if(applyAutoScale || !customZoom){	// exit zoom-to-fit mode when the user uses the mouse to move or zoom the graph 				
			applyAutoScale = false;
			customZoom = true
            notify()   
		}
		enterClickMode = false;
		container.attr('transform', `translate(${d3.event.translate}) scale(${d3.event.scale})`);
     	$("#qtip").removeClass("visible")	
	}	
	// when zoom-to-fit is active, the graph resizes as the window resizes. #422
	$(window).unbind('resize').resize(e => {	 	

	 	if(customZoom && $('#wskflowSVG').attr('viewBox') !== undefined){
	 		// this code is called when the user is in custom zoom mode but the viewbox still exists
	 		// remove viewbox here to stop auto-resizing, 
	 		$('#wskflowSVG').removeAttr('viewBox');
	 		// adjust transform to let the graph be in the same size and location 
	 		let width = $('#wskflowSVG').width(),
	 		height = $('#wskflowSVG').height(),
	 		scale = Math.min(width/elkData.width, height/elkData.height),
	 		initScale = scale * zoom.scale(),
			initTransX = width/2 - elkData.width*scale/2 + zoom.translate()[0]*scale,
			initTransY = height/2 - elkData.height*scale/2 + zoom.translate()[1]*scale;
			zoom.translate([initTransX, initTransY]); 
			zoom.scale(initScale);
			container.attr('transform', `matrix(${initScale}, 0, 0, ${initScale}, ${initTransX}, ${initTransY})`);
	 	}
	});
	

    // exported API
    return {
    	view: $(containerElement)[0],
    	controller:{
    		register: callback => handlers.push(callback),
	        zoomToFit: () => zoomToFit(true),
	        zoom1to1: () => zoomToFit(false)
    	}        
    }
}



module.exports = graph2doms;
