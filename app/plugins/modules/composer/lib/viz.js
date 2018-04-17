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

const debug = require('debug')('app preview')
debug('loading')

const { isValidFSM, wskflow, zoomToFitButtons, vizAndfsmViewModes, codeViewMode, handleError } = require('./composer'),
      badges = require('./badges'),
      { readFSMFromDisk, compileToFSM } = require('./create-from-source'),
      messages = require('./messages'),
      sampleInputs = require('./sample-inputs'),
      { preview:usage } = require('./usage'),
      fs = require('fs'),
      path = require('path'),
      expandHomeDir = require('expand-home-dir'),
      chokidar = require('chokidar')

const viewName = 'preview',               // for back button and sidecar header labels
      viewNameLong = 'App Visualization', //    ... long form
      defaultMode = 'visualization'       // on open, which view mode should be selected?

/**
 * Here is the app kill entry point. Here we register command
 * handlers.
 *
 */
module.exports = (commandTree, prequire) => {
    const render = (input, options, execOptions) => new Promise((resolve, reject) => {
         debug('options', options)         
         let fsmPromise, type, extraModes=[]

         if (input.endsWith('.fsm') || input.endsWith('.json')) {
             const fsm = readFSMFromDisk(input)
             if (!isValidFSM(fsm)) {
                 // some basic validation of the fsm
                 reject(messages.invalidFSM)
             } else {
                 type = badges.fsm
                 fsmPromise = Promise.resolve({fsm})
             }
         } else if (input.endsWith('.js')) {
             type = badges.composerLib
             fsmPromise = compileToFSM(input, Object.assign({ code: true }, options))
             extraModes.push(codeViewMode)
             
         } else {
             reject(messages.unknownInput)
         }

         const name = path.basename(input)

         // create a fake action/entity record
         const formatForUser = defaultMode => ({fsm,code}) => {
             // pass through cli options for the wskflow renderer
             const viewOptions = { }

             if (options.functions) {
                 // note we must be careful not to pass false; only undefined
                 viewOptions.renderFunctionsInView = options.functions // render all inline functions directly in the view?
             }

             if (execOptions.container) {
                 // if we're rendering this inside of a given viewport, then don't modify the sidecar header
                 viewOptions.noHeader = true
             }

             const {visualize} = prequire('wskflow')
             const { view, controller } = wskflow(visualize, viewName, { fsm, input, name, viewOptions, container: execOptions.container })
             extraModes = extraModes.concat(zoomToFitButtons(controller))

             const entity = {
                 isEntity: true,
                 type: 'custom',
                 prettyType: viewName,
                 name,
                 fsm,
                 input,
                 content: view,
                 source: code,
                 exec: {
                     kind: 'source'
                 },
                 modes: vizAndfsmViewModes(visualize, viewName, defaultMode, options).concat(extraModes),
                 annotations: [
                     { key: 'wskng.combinators',
                       value: [{ role: 'replacement', type: 'composition', badge: type } ]
                     },
                     { key: 'fsm', value: fsm },
                     { key: 'code', value: code },
                     { key: 'file', value: input }
                 ]
             }
             
             if (options.fsm || defaultMode === 'fsm') {
                 // then the user asked to see the fsm
                 entity.verb = 'get'
                 entity.show = 'fsm'
                 entity.type = 'actions'
             }
             
             if(options.alreadyWatching && entity.type === 'custom'){  
                // in filewatch mode (alreadyWatching), command echo is set to false
                // calling ui.showCustom as the main repl does not do anything for custom type entity when echo is false 
                ui.showCustom(entity);
             }
             else{
                resolve(entity);
             }             
             
         }
         fsmPromise.then(formatForUser(defaultMode))
             .catch(err => {
                 if (err.type === 'EMPTY_FILE') {
                     // start rendering an empty JSON
                     formatForUser(defaultMode)({})

                 } else if (options.alreadyWatching) {
                     // we already have the sidecar open to this file,
                     // so we can report the error in the sidecar

                     // createFromSource returns error as either an object that's {fsm:errMsg, code:originalCode}, or just the errMsg string
                     // here we check the error format and send the correct input to formatForUser/handleError
                     // in sidecar, error message shows in the fsm (JSON) tab. code tab shows the user's js code (if existed). 
                     
                     if(err.fsm)
                      formatForUser('fsm')(err);
                     else
                      formatForUser('fsm')({fsm: err});       
                     
                 } else {
                     // otherwise, report the error in the REPL
                    if(err.fsm)              
                      handleError(err.fsm, reject)
                    else
                      handleError(err, reject)
                 }
             })
     })

     /** command handler */
     const doIt = cmd => (_1, _2, fullArgv, { errors }, _4, execOptions, args, options) => new Promise((resolve, reject) => {
         const idx = args.indexOf(cmd),
               inputFile = args[idx + 1]

         let input = ui.findFile(args[idx + 1])

         fs.exists(expandHomeDir(input), exists => { 
             if (!exists) {
                 reject('The specified file does not exist')
             }

             if (options.env) {
                 debug('parsing environment variables from command line', options.env)

                 const environment = {}
                 for (let idx = 0; idx < options.env.length; idx += 2) {
                     const key = options.env[idx],
                           value = options.env[idx + 1]
                     environment[key] = value
                 }

                 options.env = environment
                 delete options.e

                 debug('environment', environment)
             }

             if(execOptions.alreadyWatching){
                options.alreadyWatching = execOptions.alreadyWatching;
             }             
            
             render(input, options, execOptions).then(resolve, reject)
                          
             // and set up a file watcher to re-render upon change of the file
             if (!execOptions || !execOptions.alreadyWatching) {
                 chokidar.watch(expandHomeDir(input)).on('change', path => {
                     repl.pexec(`preview ${path}`, { echo: false, alreadyWatching: true })                     
                 })
             }
         })
     })

     const vizCmd = commandTree.listen(`/wsk/app/preview`, doIt('preview'), { usage: usage('preview'),
                                                                              needsUI: true,
                                                                              viewName: viewNameLong,
                                                                              fullscreen: true, width: 800, height: 600,
                                                                              clearREPLOnLoad: true,
                                                                              noAuthOk: true,
                                                                              placeholder: 'Loading visualization ...'})
     commandTree.synonym(`/wsk/app/viz`, doIt('viz'), vizCmd, { usage: usage('viz') })
}
