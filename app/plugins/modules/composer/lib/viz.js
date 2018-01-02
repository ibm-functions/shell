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
      fs = require('fs'),
      path = require('path'),
      minimist = require('minimist'),
      expandHomeDir = require('expand-home-dir'),
      chokidar = require('chokidar')

const MAX_HISTORY = 10,                  // maximum number of items in the "drag here" selector history
      viewName = 'preview',              // for back button and sidecar header labels
      viewNameLong = 'App Visualization',//    ... long form
      defaultMode = 'visualization',     // on open, which view mode should be selected?
      lsKeys = {
          recent: 'wsk.wskflow.viz.recent'
      }

/**
 * Usage string
 *
 */
const usage = cmd => {
    return `Usage: app ${cmd} </path/to/file.[js|json]>`
}

/**
 * Open the visualization to the specified path on the local filesystem
 *
 */
const show = path => {
    document.body.classList.remove('no-sidecar-header')
    document.querySelector('.wskflow-drag-area').classList.add('dragover')
    document.querySelector('.wskflow-drag-area-text').style.display = 'none'
    setTimeout(() => repl.pexec(`wsk app viz ${path}`), 150)
}

/**
 * Return the model of recently "app viz'd" files: a list of {name,path}
 *
 */
const getRecentItems = () => {
    const list = localStorage.getItem(lsKeys.recent)
    if (!list) {
        return []
    } else {
        try {
            return JSON.parse(list)
        } catch (e) {
            console.error(e)
            return []
        }
    }
}

/**
 * Add a recently "app viz'd" path to the persistence model. The input
 * is a {name,path} structure.
 *
 */
const addRecentItem = file => {
    const listStr = localStorage.getItem(lsKeys.recent),
          list = !listStr ? [] : JSON.parse(listStr)

    // add a date stamp (marking when we added this entry to the
    // model), and push to the list model
    file.addedOn = Date.now()
    list.push(file)

    // prune to MAX_HISTORY
    list.sort((a,b) => b.addedOn - a.addedOn) // sort with most recently added first
    if (list.length > MAX_HISTORY) {
        localStorage.setItem(JSON.stringify(list.slice(0, MAX_HISTORY)))
    } else {
        localStorage.setItem(lsKeys.recent, JSON.stringify(list))
    }

    return path
}

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
                     { key: 'fsm', value: fsm }
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

     /**
      * Create a div and optionally attach it to a given parent
      *
      */
     const div = (css,parent,text) => {
         const element = document.createElement('div')
         element.className = css
         if (parent) parent.appendChild(element)
         if (text) element.innerText = text
         return element
     }

     /**
      * Render the file selector (drag and drop) widget
      *
      */
     const renderSelect = () => {
         ui.injectCSS(path.join(__dirname, '..', 'web', 'css', 'viz.css'))

         const selector = div('wskflow-file-selector fullsize'),
               dragArea = div('wskflow-drag-area fullsize', selector),
               dragIcon = div('wskflow-drag-area-icon fullsize ok-text-on-dragover oops-text-on-oops', dragArea),
               dragIcon1 = div('wskflow-drag-area-icon-1', dragIcon),
               dragIcon2 = div('wskflow-drag-area-icon-2', dragIcon),
               dragText = div('wskflow-drag-area-text', dragArea, 'Drag a source or FSM file'),
               recentItems = div('wskflow-recent-items', selector)

         getRecentItems().forEach(({name,path}, idx) => {
             if (idx < 5) {
                 const recentItem = div('wskflow-recent-item', recentItems),
                       icon = div('wskflow-recent-item-icon', recentItem),
                       label = div('wskflow-recent-item-label deemphasize', recentItem, name)

                 recentItem.onclick = () => show(path)
             }
         })

         dragArea.addEventListener('dragover', event => {
             dragArea.classList.add('dragover')
         })
         dragArea.addEventListener('dragleave', event => {
             dragArea.classList.remove('dragover')
         })
         dragArea.addEventListener('drop', event => {
             event.preventDefault()

             for (let f of event.dataTransfer.files) {
                  if (! (f.path.endsWith('.js') || f.path.endsWith('.json') || f.path.endsWith('.fsm'))) {
                      dragArea.classList.remove('dragover')
                      dragArea.classList.add('oops')

                      const curText = dragText.innerText
                      dragText.innerText = 'Unsupported format'
                      setTimeout(() => {
                          dragText.innerText = curText
                          dragArea.classList.remove('oops')
                      }, 4000)
                  } else {
                      addRecentItem({name: f.name, path: f.path})
                      show(f.path)
                      break
                  }
              }
         })

         return Promise.resolve({
             type: 'custom',
             content: selector,
             sidecarHeader: false
         })
     }

     /** command handler */
     const doIt = cmd => (_1, _2, fullArgv, _3, _4, execOptions, _5, _options) => new Promise((resolve, reject) => {
         const options = Object.assign({}, execOptions, _options, minimist(fullArgv, { boolean: [ 'fsm', 'select' ], alias: { f: 'fsm', s: 'select' } })),
               args = options._,
               idx = args.indexOf(cmd),
               inputFile = args[idx + 1]

         if (options.help || (!options.select && !inputFile)) {
             // either the user asked for help, or we weren't asked to
             // render the file selector, or we weren't given a file
             // to render
             return reject(usage(cmd))
         }

         let input = ui.findFile(args[idx + 1])

         if (options.select || !input) {
             // render the file selector
             return renderSelect().then(resolve, reject)
         }

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

     const vizCmd = commandTree.listen(`/wsk/app/preview`, doIt('preview'), { docs: 'Visualize a Composer source file',
                                                                              needsUI: true,
                                                                              viewName: viewNameLong,
                                                                              fullscreen: true, width: 800, height: 600,
                                                                              clearREPLOnLoad: true,
                                                                              noAuthOk: true,
                                                                              placeholder: 'Loading visualization ...'})
     commandTree.synonym(`/wsk/app/viz`, doIt('viz'), vizCmd)
}
