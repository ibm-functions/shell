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
      expandHomeDir = require('expand-home-dir'),
      openwhiskComposer = require('@ibm-functions/composer'),
      { isValidFSM } = require('./composer')

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

const patterns = {
    require: /(const [^\s]+)\s*=\s*require\('@ibm-functions\/composer'\)/,
    constAppEquals: /.*const ([^\s]+)\s*=\s+composer(.*)/,
    return: /^return\s+/
}

/** override values in A with those from B, returning any overwritten values */
const save = (A, B) => {
    const overwritten = {}
    for (let key in B) {
        overwritten[key] = A[key]
        A[key] = B[key]
    }
    return overwritten
}

/** restore values to A using values from B */
const restore = (A, B) => {
    for (let key in B) {
        if (B[key]) {
            A[key] = B[key]
        }
    }
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

                let errorMessage = '',
                    logMessage = ''     // TODO this isn't flowing through, yet
                const errors = []
                const compile = code => {
                    errorMessage = ''
                    logMessage = ''
                    try {
                        const doExit = () => reject({
                            fsm: errorMessage,
                            code: originalCode
                        })

                        const my = {
                            process: Object.assign(process, {
                                env: Object.assign({}, process.env, opts.env), // merge -e from the command line
                                exit: doExit                                   // override process.exit()
                            }),
                            console: {
                                error: msg => errorMessage += msg + '\n',
                                log: msg => logMessage += msg + '\n'
                            },
                            require: m => {
                                if (m === '@ibm-functions/composer') {
                                    return openwhiskComposer
                                } else {
                                    return require(path.resolve(dir, m))
                                    
                                }
                            }
                        }

                        const module = {
                            exports: {}
                        }
                        const sandbox = {
                            module,
                            exports: module.exports,
                            filename,
                            lineOffset,
                            console: my.console,
                            process: my.process,
                            require: my.require
                        }
                        const sandboxWithComposer = Object.assign(sandbox, { composer: openwhiskComposer })

                        let res = vm.runInNewContext(code, sandboxWithComposer)
                        debug('res', typeof res, res)

                        if (typeof res === 'function') {
                            res = res()
                        }

                        if (isValidFSM(res)) {
                            return res

                        } else {
                            let err = ''
                            try {
                                // maybe the code did a console.log?
                                const maybe = openwhiskComposer.deserialize(JSON.parse(logMessage))
                                if (isValidFSM(maybe)) {
                                    return maybe
                                }
                            } catch (e) {
                                err = e
                            }

                            throw new Error(`Unable to compile your composition
${err}
${errorMessage}`)
                        }
                    } catch (err) {
                        const junkMatch = err.stack.match(/\s+at Object\.exports\.runInNewContext/)
                              || err.stack.match(/\s+at Object\.runInNewContext/)
                              || err.stack.match(/\s+at fs\.readFile/),
                              _message = err.message.indexOf('Invalid argument to compile') >= 0? 'Your source code did not produce a valid app.' : (!junkMatch ? e.stack : err.stack.substring(0, junkMatch.index).replace(/\s+.*create-from-source([^\n])*/g, '\n').replace(/(evalmachine.<anonymous>)/g, filename).replace(/\s+at createScript([^\n])*/g, '\n').trim()),
                              message = _message
                              .replace(/\s+\(.*plugins\/modules\/composer\/node_modules\/@ibm-functions\/composer\/composer\.js:[^\s]*/, '')
                              .replace(/\s+at ContextifyScript[^\n]*/g, '')


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
