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

const { create, isValidFSM, hasUnknownOptions } = require('./composer'),
      badges = require('./badges'),
      messages = require('./messages.json'),
      fs = require('fs'),
      { readFSMFromDisk, compileToFSM } = require('./create-from-source')

/**
 * Usage message
 *
 */
const usage = cmd => `Create an app from a given source file.

\tapp ${cmd} <name> <file.js|file.json>

Required parameters:
\tname           the name of your new app
\tfile.js        a NodeJS source file; or
\tfile.json      a pre-compiled app

Options:
\t-n|--dry-run   check the given input for validity, do not deploy it
\t--log-input    log initial input with an echo action. App may run slower 
\t--log-inline   log inline function output with echo actions. App may run slower
\t-l|--log-all   log initial input and inline function output. App may run slower
`

/**
 * Here is the app create module entry point. Here we register command
 * handlers.
 *
 */
module.exports = (commandTree, prequire) => {
    const wsk = prequire('/ui/commands/openwhisk-core')

    const doCreate = cmd => function(_1, _2, fullArgs, modules, fullCommand, execOptions, args, options) {
        const idx = args.indexOf(cmd) + 1,
              dryRun = options['dry-run'] || options.n,  // compile to check for errors, but don't create anything
              name = args[idx],                          // name of creation
              input = dryRun ? name : args[idx + 1]      // input file; if dryRun, then it's the first and only non-opt arg

        // check for unknown options
        hasUnknownOptions(options, [ 'n', 'dry-run', 'all',
                                     'h', 'help',
                                     'a', 'annotation',
                                     'p', 'parameter', 'P', 'param-file',
                                     'm', 'memory', 'l', 'logsize', 't', 'timeout',                                     
                                     'log-all', 'log-input', 'log-inline' ])    

        
        if (!name || !input || options.help) {
            throw new modules.errors.usage(usage(cmd))

        } else {
            
            let fsmPromise // our goal is to acquire an FSM, so that we can create an invokable OpenWhisk wrapper for it
            let type       // metadata to help with understanding how this FSM was created; 

            if (input.endsWith('.json') || input.endsWith('.fsm')) {
                //
                // we were given the FSM directly
                //
                const fsm = readFSMFromDisk(args[idx + 1])

                if (!isValidFSM(fsm)) {
                    // some basic validation of the fsm
                    throw new Error(messages.invalidFSM)
                } else {
                    type = badges.fsm
                    fsmPromise = Promise.resolve(fsm)
                }

            } else if (input.endsWith('.js')) {
                //
                // we were given the source code, which means we'll need to generate the FSM
                //
                type = badges.composerLib
                fsmPromise = compileToFSM(input)

                if (dryRun) {
                    return fsmPromise
                        .then(() => 'Your code compiles without error')
                        .catch(err => {
                            console.error(err)
                            if (err.fsm) {
                                throw new Error(err.fsm)
                            } else {
                                throw err
                            }
                        })
                }

            } else {
                throw new Error(messages.unknownInput)
            }

            const { kvOptions: { action: { annotations=[] }={} }={} } = wsk.parseOptions(fullArgs, 'action');

            if(options['log-input'] || options['log-inline'] || options['log-all']){
                console.log('app create logging');                
                //let index = annotations.findIndex(element => element.key == 'log'), logType;
                let logType;
                if((options['log-input'] && options['log-inline']) || options['log-all'])
                    logType = 'all';
                else if(options['log-input'])
                    logType = 'input';
                else
                    logType = 'inline';
                
                //if(index == -1) annotations.push({key: 'log', value: logType});
                //else annotations[index] = {key: 'log', value: logType};
                annotations.push({key: 'log', value: logType})

                return fsmPromise.then(fsm => {
                    
                    let count = 0;
                    let addEcho = name => {
                        let echoName = 'echo_'+count;
                        count++;
                        fsm.States[echoName] = {
                            Next: name,
                            Type: 'Task',
                            Action: '/whisk.system/utils/echo',
                            Helper: 'echo'
                        } 
                        return echoName;
                    }

                    if(logType == 'all' || logType == 'inline'){
                        Object.keys(fsm.States).forEach(name => {
                            if(name.indexOf('choice') == 0){
                                [fsm.States[fsm.States[name].Then], fsm.States[fsm.States[name].Else]].forEach(s => {
                                    if(s.Function && s.Helper == undefined){
                                        s.Next = addEcho(s.Next);
                                    }
                                });                            
                            }                        
                            else if(fsm.States[name].Next){
                                let nextState = fsm.States[fsm.States[name].Next];                        
                                if(nextState.Function && nextState.Helper == undefined){
                                    nextState.Next = addEcho(nextState.Next);
                                }

                                if(name.indexOf('try') == 0 && fsm.States[fsm.States[name].Handler].Function && fsm.States[fsm.States[name].Handler].Helper == undefined){
                                    fsm.States[fsm.States[name].Handler].Next = addEcho(fsm.States[fsm.States[name].Handler].Next);
                                }
                            }
                            
                        });
                    }

                    if(logType == 'all' || logType == 'input')
                        fsm.Entry = addEcho(fsm.Entry);

                    return create({ name, fsm, wsk, commandTree, execOptions, type, cmd, annotations });
                });


            }   
            else{                
                let index = annotations.findIndex(element => element.key == 'log');
                if(index != -1) annotations.splice(index, 1);
                else annotations.push({key: 'log', value: false});
                //console.log('app create no logging', index, annotations);
                // great, we now have a valid FSM!                    
                return fsmPromise.then(fsm => create({ name, fsm, wsk, commandTree, execOptions, type, cmd, annotations }))
            }
        }
    }

    // Install the routes
    const cmd = commandTree.listen(`/wsk/app/create`, doCreate('create'), { docs: 'Create an invokeable composer from an FSM' })
    commandTree.synonym(`/wsk/app/update`, doCreate('update'), cmd)
}
