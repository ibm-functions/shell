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

/** flatten an array of arrays */
const flatten = arrays => [].concat.apply([], arrays)

/** remove duplicates from an array */
const removeDuplicates = A => new Set(A)

/**
 * Turn an activation log entry "Entering state [0-9]+ at path ..."
 * into the encoded form that we use for node ids in the graph.
 *
 */
const logEntry2StateRegex = /Entering state .* at path (.*)$/
const logEntry2State = logEntry => {
    const match = logEntry.match(logEntry2StateRegex)

    // see the Node Visitor path encoding discussion in
    // composition2fsm.js
    return match && match[1].replace(/\[([0-9])+\]/g, '_$1').replace(/\./g, '__')
}

/*
function Process takes a fsm and outputs an annotated fsm that markes the states that are not printed out or printed out as smaller, non-action nodes. 


*/

function annotateNodes(fsm, activations){
        // does this composition have no nodes?
        const isEmptyComposition = !fsm.composition || fsm.composition.length === 0

        // initialize: adding an Entry state and an Exit state (for viuslaizations).
        fsm.Entry = 'Entry'
        fsm.Exit = 'Exit'
        fsm.States.Entry = {'type' : 'Entry'};
        fsm.States.Exit = {'type': 'Exit'};
        fsm.States[fsm.Exit].Next = 'Exit';

        // wire up Entry to the first node of the composition; we will wire up to Exit in fsm2Graph
        if (!isEmptyComposition) {
            fsm.States.Entry.Next = fsm.composition[0].id
        }

	let retry_2 = [], tryStates = [], repeat_1 = [], action2State = {}, nullStates = [];;
	
	// adding a Pre object for each state to allow backtracking

	Object.keys(fsm.States).forEach(name => {
		// init every state with a Pre array
		fsm.States[name].Pre = [];
		fsm.States[name].stored = undefined;
		fsm.States[name].act = undefined;
		fsm.States[name].display = undefined;
		
		if(activations){
			if(fsm.States[name].name){
				let n = fsm.States[name].name;
				if(n.indexOf("/") !== -1)
					n = n.substring(n.lastIndexOf("/")+1);
				action2State[n] = name;
			}
		}
	});

	Object.keys(fsm.States).forEach(name => {
		let state = fsm.States[name], type = state.Type;
		
		if(state.Next){
			fsm.States[state.Next].Pre.push({"name": name, "class": type});
		}
		if(type === "try"){
			fsm.States[state.Handler].Pre.push({"name": name, "class": type});
			tryStates.push(name);
		}		
		else if(type === "if"){
			if(state.Then) fsm.States[state.Then].Pre.push({name: name, class: type});
			if(state.Else) fsm.States[state.Else].Pre.push({name: name, class: type});
			// new: not to merge choice state with previous action states - will have error if condition is a sequence. 		
		}	

                const helper = state.options && state.options.helper
		if(typeof helper === "string" && helper.indexOf("retry_2") === 0){
			retry_2.push(name);
		}		
		else if(typeof helper === "string" && helper.indexOf("repeat_1") === 0){
			repeat_1.push(name);
		}	
		else if(typeof helper === "string" && helper.indexOf("null") === 0){
			nullStates.push(name);
		}	


	});	
	nullStates.forEach(nullName => {
		let state = fsm.States[nullName];
		state.Pre.forEach(p => {
			console.log(p)
			if(p.class === 'if' && fsm.States[p.name].Else == nullName){
				console.log(nullName, state);
				state.display = 'ignore';
			}
			
		});
	});


	//retry helper - some rerouting BROKEN
        false&&retry_2.forEach(retry2Name => {
		// ignore everything after the still try condition
		fsm.States[retry2Name].display = "ignore";
		let nextPushName = fsm.States[retry2Name].Next, pushId = nextPushName.substring("push_".length);
		fsm.States[nextPushName].display = "ignore";
		fsm.States["pop_"+pushId].display = "ignore";
		let nextTryName = fsm.States[nextPushName].Next;
		fsm.States[nextTryName].display = "ignore";
		let tryId = nextTryName.substring("try_".length);
		// ignore the catch, pass, and the try body and handler body
		fsm.States["catch_"+tryId].display = "ignore";
		fsm.States["pass_"+tryId].display = "ignore";
		Object.keys(fsm.States).forEach(name => {
			if(fsm.States[name].block && (fsm.States[name].block == "try_"+tryId || fsm.States[name].block == "catch_"+tryId)){
				fsm.States[name].display = "ignore";
			}
		});
		// reroute still try condition true branch to top of the first try
		let preCondName = fsm.States[retry2Name].Pre[0].name, retry1Name = fsm.States[preCondName].Pre[0].name,
		prePushName = fsm.States[retry1Name].Pre[0].name;

		let thePopName;
		fsm.States[prePushName].Pre.forEach(retain2 => {			
			let n = fsm.States[retain2.name].Pre[0].name;
			if(fsm.States[n].display == undefined)
				thePopName = n;
			
			/*if(fsm.States[p.name].display == undefined)
				retain2Name = p.name;*/
		})
		
		//let thePopName = fsm.States[retain2Name].Pre[0].name;


		//console.log(preCondName, retry1Name, prePushName, thePopName);


		// found the pop that's doing the first retain, which retain the try body. rerount cond to the pop's push
		let popId = thePopName.substring("pop_".length), rerountPushName = "push_"+popId;
		// the rerount condition is now called "trueBranch"
		fsm.States[preCondName].trueBranch = rerountPushName;
		// done
		let letStateName = fsm.States[rerountPushName].Pre[0].name;
		fsm.States[preCondName].count = fsm.States[letStateName].Value;

		// new design - mark everything in retry besides the actual try-catch body to display: ignore
		fsm.States[preCondName].display = "ignore";
		fsm.States[thePopName].display = "ignore";
		fsm.States[rerountPushName].display = "ignore";
		fsm.States[letStateName].display = "ignore";
		// put count to the try block, so we know it's a retry block
		let mainTryName = fsm.States[rerountPushName].Next;
		fsm.States[mainTryName].count = fsm.States[letStateName].Value;



	});

	// repeat helper. repeat_1 is the while condition
	repeat_1.forEach(repeat1Name => {
		// first, get the repeat constant number
		let prePushName = fsm.States[repeat1Name].Pre[0].name, choiceName = fsm.States[repeat1Name].Next, valueName;
		fsm.States[prePushName].Pre.forEach(p => {
			if(p.class == "Let")
				valueName = p.name;
		});

		let count = fsm.States[valueName].Value;

		// set the prePush and Value to be ignored 
		fsm.States[prePushName].display = "ignore"; fsm.States[valueName].display = "ignore";
		fsm.States[repeat1Name].display = "ignore";
		fsm.States[choiceName].repeat = count;

	});

	// adding 'Helper: true' to a state to identify it has a helper state - not print out
	Object.keys(fsm.States).forEach(name => {
		let state = fsm.States[name], type = state.Type;
		
		if(type == "pass"){
			// hide pass state except when it is used in try catch. 
			if(fsm.States["catch_"+name.substring("pass_".length)] !== undefined){
				fsm.States["catch_"+name.substring("pass_".length)].compound = true;
			}
			/*else if(state.Next == "Exit"){
				state.display = "ignore";
			}*/

			state.display = "ignore";
		}
		else if(type == "if"){
			state.display = "ignore";
		}
		else if(type == "end"){
			state.display = "ignore";
		}
		else if(type == "push"){
			// add this - if this push only has one prev
			/*f(state.Pre.length == 1 && fsm.States["pop_"+name.substring("push_".length)] == undefined){
				state.display = "ignore";
			}*/
			// ok so the only time i observed a push to be ignore is if there's a corresponding choice

			// new: if it's a push that's paird to a choice, set choice property to the choice's id
			if(fsm.States["choice_"+name.substring("push_".length)] !== undefined){
				//state.display = "ignore";
				state.choice = "choice_"+name.substring("push_".length);
			}
		}
		else if(type == "let"){
			if(fsm.States[state.Next].Type == "push"){

			}
		}
		else if(state.options && state.options.helper){
			//if(state.Helper == "retain_1"){
				// retain_2 is the end of retain. retain_3 is when there's error (handler, but it goes merges to pass)
                        const helper = state.options && state.options.helper
			if(helper === "retain_1" || helper === "retain_2" || helper.indexOf("retry_") === 0 || helper === 'echo'){
				state.display = "ignore";			
			}
		}
	});

	// new - for activations
        if(activations){
  	        activations.sort((a, b) => {
			return a.start - b.start;
		});		

                /**
                 * Record the given activation as contributing to the
                 * activity of the given node id ("name")
                 *
                 */
	         const addActivationToNode = (activations, idx) => name => {
                     const node = fsm.States[name]
                           
                     // the conductor executes functions inline, so
                     // the current activation services the activity
                     const activation = node.type === 'function' ? activations[idx] : activations[idx + 1]

                     if (activation) {
			 if(fsm.States[name].act === undefined)
			     fsm.States[name].act = [];
		         fsm.States[name].act.push(activation);
                     }
		 }

                 // map the activations to nodes.
                 //
                 // Note that the logs have entries such as "Entering state x at path
                 // fsm[0].test[0]"; we turn these into a set of visited nodes,
                 // using the node id encoding from composition2fsm.js
                 //
	         activations.forEach((activation, idx) => {
                     activation.logs.map(logEntry2State).filter(x=>x)
                         .map(addActivationToNode(activations, idx))
                 })


		    /*activations.forEach((a, i) => {
                    
		    if(a.name === 'conductor'){

				// special case for first conductor: if log-input, first state will be an echo
				if(i==0 && fsm.States.Entry.Next && fsm.States.Entry.Next.indexOf('echo_') !== -1 && i+1<activations.length && activations[i+1].name == 'echo'){
					addAct('Entry', activations[i+1]);
				}
				else{
					// looking at conductor logs for activations
					a.logs.forEach((log, j) => {					
						if(log.indexOf('Entering function') !== -1){
							// in logging mode, next state will be an echo state, next activation will be the echo activation
							// if next is echo, put echo act in the function state's act. 
							// otherwise, put the conductor's act in the function state's act. 
							let state = log.substring(log.lastIndexOf(" ")+1);
							if(fsm.States[state].Next && fsm.States[state].Next.indexOf('echo_') !== -1 && i+1<activations.length && activations[i+1].name == 'echo'){
								addAct(state, activations[i+1]);
								fsm.States[state].debug = true;
							}
							else
								addAct(state, a);

						}						
						else if(log.indexOf('Entering state') !== -1){
							let state = log.substring(log.lastIndexOf(" ")+1);
							if(fsm.States[state].name){
								let n = fsm.States[state].name;
								if(n.lastIndexOf("/") !== -1 && n.lastIndexOf("/") < n.length-1)
									n = n.substring(n.lastIndexOf("/")+1);
								if(i+1<activations.length && activations[i+1].name == n)
									addAct(state, activations[i+1]);	
								else
									console.log(state, i, activations);						
							}							
						}					
					});
				}

			}			
						
		});*/
		

		// see if exit state is visited 
		let exitState = fsm.Exit, lastAct = activations[activations.length-1], isExitSuccess = false;
		if(lastAct.logs && lastAct.logs.length > 0){
			let isExit = false, isFinal = false;
			lastAct.logs.forEach(log => {
				if(log.indexOf("Entering final state") !== -1)
					isFinal = true;
				if(log.indexOf("Entering "+exitState) !== -1)
					isExit = true;
			});
			if(isFinal && isExit && lastAct.response.success){	// Exit state is not an action, all done here
				isExitSuccess = true;
			}
			else if(isFinal){
				// if it's only the final state - previous act must be the action. check if it's succesful 
				let lastActionAct = activations[activations.length-2];
				let lastActionName = fsm.States[exitState].name;
				if(lastActionName){
					if(lastActionName.lastIndexOf("/") !== -1 && lastActionName.lastIndexOf("/") < lastActionName.length-1)
						lastActionName = lastActionName.substring(lastActionName.lastIndexOf("/")+1);
					if(lastActionAct.name == lastActionName && lastActionAct.response.success){
						isExitSuccess = true;
					}
				}
				
			}
		}

		if(isExitSuccess){
			fsm.States["Exit"].act = [];
			fsm.States["Exit"].act.push(lastAct);
		}
		
		return fsm;
	}
	// new - for undeployed actions
	else{
		
		return fsm;
	}

}
module.exports = annotateNodes;




//console.log(JSON.stringify(annotateNodes(data), null, 4));




