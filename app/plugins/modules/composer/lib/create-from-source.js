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

const vm = require('vm'),
      fs = require('fs'),
      path = require('path'),
      mod = require('module'),
      expandHomeDir = require('expand-home-dir'),
      openwhiskComposer = require('@ibm-functions/composer'),
      { isValidFSM, handleError } = require('./composer')

//
// just in case, block any use of wsk from within sandboxed compilations
//
const nope = {
    create: () => true,
    update: () => true,
    invoke: () => true
}
openwhiskComposer.wsk = {
    actions: nope,
    packages: nope,
    rules: nope,
    triggers: nope
}

const usage = cmd => `Usage: app ${cmd} </path/to/app-src.js>`

const patterns = {
    require: /(const [^\s]+)\s*=\s*require\('@ibm-functions\/composer'\)/,
    constAppEquals: /.*const ([^\s]+)\s*=\s+composer(.*)/,
    return: /^return\s+/
}

/**
 * Take as input a file on disk that makes use of the
 * openwhisk-composer library, and return the corresponding FSM.
 *
 */
exports.compileToFSM = (src, opts={}) => new Promise((resolve, reject) => {
    const localCodePath = expandHomeDir(src)

    fs.readFile(ui.findFile(localCodePath), (err, data) => {
        if (err) {
            reject(err)
        } else {
            try {
                const filename = path.basename(src),
                      dir = path.dirname(src),
                      sandbox = {}

                let originalCode = data.toString(),  // unadulterated original
                    lineOffset = 0                   // vm.runInNewContext will use this for line numbers in any stack traces

                if (originalCode.trim().length === 0) {
                    // no code, yet!
                    return reject({ message: 'No code to compile', type: 'EMPTY_FILE'})
                }

                /**
                 * The Composer constructor tries to initialize
                 * wsk. But we may not have a wskprops, e.g. if the
                 * user is previewing apps without any AUTH
                 * configuration. See
                 * tests/passes/07/composer-viz-no-auth.js
                 *
                 */

                // check to see if the source already requires the openwhisk-composer library
                function bootstrapWithRequire() {
                    lineOffset = 1
                    return `const composer = require('@ibm-functions/composer');` + originalCode
                }
                function bootstrapWithRequireForModule() {
                    lineOffset = 1
                    return `const composer = require('@ibm-functions/composer')const process = module.process; const console = module.console;\n` + originalCode
                }
                function bootstrapWithModuleExports() {
                    lineOffset = 0
                    return "const process = module.process; const console = module.console; module.exports=" + originalCode
                }
                function bootstrapWithModuleExportsAndRequire() {
                    lineOffset = 0
                    return `const composer = require('@ibm-functions/composer'); const process = module.process; const console = module.console; module.exports=` + originalCode
                }
                function bootstrapWithModuleExportsAndRequireAndTrim() {
                    lineOffset = 0
                    const code = originalCode.trim().replace(/^([;\s]+)/, '') // trim leading semicolons
                    return `const composer = require('@ibm-functions/composer'); const process = module.process; const console = module.console; module.exports=` + code
                }
                function bootstrapWithConstMain() {
                    lineOffset = 1
                    return "const process = module.process; const console = module.console;" + originalCode + "\n;module.exports=main"
                }
                function bootstrapWithConstMainAndRequire() {
                    lineOffset = 1
                    return `const composer = require('@ibm-functions/composer'); const process = module.process; const console = module.console;\n` + originalCode + "\n;module.exports=main"
                }

                const retryA = [bootstrapWithRequireForModule,
                                bootstrapWithModuleExports,
                                bootstrapWithModuleExportsAndRequire,
                                bootstrapWithModuleExportsAndRequireAndTrim,
                                bootstrapWithConstMain,
                                bootstrapWithConstMainAndRequire]

                let errorMessage = '',
                    logMessage = ''     // TODO this isn't flowing through, yet
                const doLog = msg => logMessage += msg + '\n',
                      doExit = () => reject({
                          fsm: errorMessage,
                          code: originalCode
                      })
                const errors = []
                const compile = (code, retries=retryA) => {
                    errorMessage = ''
                    logMessage = ''
                    try {
                        const module = { exports: {},
                                         process: { env: process.env, exit: doExit },
                                         console: { error: msg => errorMessage += msg + '\n',
                                                    log: doLog }
                                       },
                              my_require = m => {
                                  if (m === '@ibm-functions/composer') {
                                      return openwhiskComposer
                                  } else {
                                      return require(path.resolve(dir, m))

                                  }
                              }

                        const sandbox = {}
                        module.exports = {}
                        let res = vm.runInNewContext(mod.wrap(code), { filename, lineOffset, console: module.console, process: module.process })(module.exports, my_require, module, filename, dir) || module.exports.main || module.exports || res.main
                        //console.error(code)
                        if (typeof res === 'function') {
                            res = res()
                        }
                        if (isValidFSM(res)) {
                            return res
                        } else {
                            try {
                                // maybe the code did a console.log?
                                const maybe = openwhiskComposer.deserialize(JSON.parse(logMessage))
                                if (isValidFSM(maybe)) {
                                    return maybe
                                }
                            } catch (e) { }

                            throw new Error('Unable to compile your composition')
                        }
                    } catch (e) {
                         console.error(e)
                        errors.push(e)
                        if (retries.length > 0) {
                            return compile(retries.pop()(), retries)
                        }

                        const log = console.log, exit = process.exit
                        console.log = doLog
                        process.exit = doExit
                        try {
                            errorMessage = ''
                            const json = eval(originalCode)
                            if (isValidFSM(json)) {
                                return json
                            } else {
                                const maybe = json
                                console.log = log
                                process.exit = exit
                                return maybe
                            }
                        } catch (e2) {
                            console.log = log
                            process.exit = exit
                            try {
                                // maybe the user logged a compiled fsm?
                                const maybe = JSON.parse(logMessage)
                                if (isValidFSM(maybe)) {
                                    return maybe
                                }
                            } catch (e3) {
                                try {
                                    console.log = doLog
                                    process.exit = doExit
                                    errorMessage = ''
                                    const composition = eval(bootstrapWithRequire(originalCode))
                                    console.log = log
                                    process.exit = exit
                                    return composition
                                    
                                } catch (e4) {
                                    console.log = log
                                    process.exit = exit
                                    // some sort of parse or runtime error with the composer source file
                                    // note that we take care to elide our junk on any error stacks (junkMatch)
                                    //console.error(mod.wrap(code))
                                    //console.error(errorMessage)

                                    const goodMsg = e => e.message.indexOf('has already been declared') < 0
                                          && e.message.indexOf('composer is not defined') < 0
                                          && e
                                    const err = errors.find(goodMsg) || goodMsg(e2) || goodMsg(e3) || e4

                                    const junkMatch = err.stack.match(/\s+at Object\.exports\.runInNewContext/)
                                          || err.stack.match(/\s+at Object\.runInNewContext/)
                                          || err.stack.match(/\s+at fs\.readFile/),
                                          message = err.message.indexOf('Invalid argument to compile') >= 0? 'Your source code did not produce a valid app.' : (!junkMatch ? e.stack : err.stack.substring(0, junkMatch.index).replace(/\s+.*create-from-source([^\n])*/g, '\n').replace(/(evalmachine.<anonymous>)/g, filename).replace(/\s+at createScript([^\n])*/g, '\n').trim())

                                    console.error('All composer create/preview errors are here', errors)
                                    console.error('Selected error', err)
                                    console.error('Selected message', message, junkMatch)

                                    // for parse error, error message is shown in the fsm (JSON) tab, and user code in the source (code) tab
                                    // reject now returns {fsm:errMsg, code:originalCode}
                                    reject(
                                        {
                                            fsm: message,
                                            code: originalCode
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
                let fsm
                try {
                    fsm = compile(originalCode)
                } catch (err) {
                    console.error(err)
                }

                if (!isValidFSM(fsm)) {
                    // still no luck? reject
                    console.error('Error compiling app source', fsm, sandbox)
                    reject('Your code could not be composed')
                } else {
                    if (opts.code) {
                        resolve({fsm, code: originalCode, localCodePath})
                    } else {
                        resolve(fsm)
                    }
                }
            } catch (err) {
                console.error(err)
                reject('Internal error compiling your application source code')
            }
        }
    })
})


/**
 * Fetch a JSON file from the local filesystem
 *
 */
const readJSONFromDisk = location => {
    try {
        const absolute = ui.findFile(expandHomeDir(location)),
              bits = fs.readFileSync(absolute).toString()

        return JSON.parse(bits)
    } catch (e) {
        console.error(e)
        throw new Error('The specified file does not exist')
    }
}

/**
 * Deserialize an FSM
 *
 */
exports.deserializeFSM = fsm => openwhiskComposer.deserialize(fsm)

/**
 * Assemble the FSM JSON. It might be on disk, if `fsm` names a file
 * on the local filesystem.
 *
 */
exports.readFSMFromDisk = fsm => {
    if (fsm) {
        return exports.deserializeFSM(readJSONFromDisk(fsm))
    } else {
        return fsm
    }
}

/**
 * A command handler form of compileToFSM
 *
 */
/*const compileToFSMCommand = cmd => (_1, _2, _a, _3, fullCommand, execOptions, args, options) => {
    const idx = args.indexOf(cmd),
          src = args[idx + 1]

    if (!src || options.help) {
        reject(usage(cmd))
    } else {
        return exports.compileToFSM(src)
    }
}*/
    
/*commandTree.listen(`/wsk/app/compose`,
  doIt('compose'),
  { docs: 'Generate the low-level code from a source file. [Note: this is for debugging; consider using "app create" for normal use]' }))
*/
