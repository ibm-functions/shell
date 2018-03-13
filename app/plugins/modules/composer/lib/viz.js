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

const { isValidFSM, vizAndfsmViewModes, codeViewMode, handleError } = require('./composer'),
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
     const render = (input, options) => new Promise((resolve, reject) => {
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
             fsmPromise = compileToFSM(input, { code: true })
             extraModes.push(codeViewMode)
             
         } else {
             reject(messages.unknownInput)
         }

         // create a fake action/entity record
         const formatForUser = defaultMode => ({fsm,code}) => {            
             resolve({
                 verb: 'get',
                 type: 'actions',
                 prettyType: viewName,
                 name: path.basename(input),
                 show: (options.fsm || defaultMode === 'fsm') && 'fsm',
                 fsm,
                 source: code,
                 exec: {
                     kind: 'source'
                 },
                 modes: vizAndfsmViewModes(defaultMode).concat(extraModes),
                 annotations: [
                     { key: 'wskng.combinators',
                       value: [{ role: 'replacement', type: 'composition', badge: type } ]
                     },
                     { key: 'fsm', value: fsm },
                     { key: 'code', value: code },
                     { key: 'file', value: input }
                 ]
             })
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

             // render now
             render(input, options).then(resolve, reject)

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
