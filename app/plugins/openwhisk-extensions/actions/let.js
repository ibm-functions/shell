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

/**
 * This plugin adds a /wsk/actions/let command, to enrich the creation process.
 *
 *    let foo = ~/foo.js
 *    let foo.json = ~/foo.js   <-- web-exported, with a JSON mime type
 *    let foo.http = ~/foo.js   <-- ibid, but with an HTTP web action type
 *    let foo.zip = ~/myaction  <-- create a zip action from a directory
 *    let seq = a -> b -> c     <-- sequence
 *    let foo = x=>x            <-- inline functions (an echo action, in this example)
 *    let seq = a-> x=>x -> c   <-- sequence with inline function
 *    let foo = ~/foo.html      <-- make a web page
 *    let foo = ~/foo.svg       <-- icons
 *    let foo = ~/foo.png       <-- icons!
 *    let api/foo = ~/foo.js    <-- auto-creates package, if one doesn't exist
 *
 */

const debug = require('debug')('let')
debug('loading')

const minimist = require('yargs-parser'),
      fs = require('fs'),
      path = require('path'),
      url = require('url'),
      tmp = require('tmp'),
      { ANON_KEY, ANON_KEY_FQN, ANON_CODE, isAnonymousLet } = require('./let-core')(),
      base_rp = require('request-promise'),
      withRetry = require('promise-retry'),
      expandHomeDir = require('expand-home-dir'),
      beautify = require('js-beautify').js_beautify,
      baseName = process.env.BASE_NAME || 'anon'

debug('finished loading modules')

/**
 * Mimic the request-promise functionality, but with retry
 *
 */
const rp = opts => {
    return withRetry((retry, iter) => {
        return base_rp(Object.assign({ timeout: 10000 }, typeof opts === 'string' ? { url: opts } : opts))
            .catch(err => {
                const isNormalError = err && (err.statusCode === 400 || err.statusCode === 404 || err.statusCode === 409)
                if (!isNormalError && (iter < 10)) {
                    console.error(err)
                    retry()
                } else {
                    console.error(`Error in rp with opts=${JSON.stringify(opts)}`)
                    throw err
                }
            })
    })
}


/**
 * Take the output of url.parse, and determine whether it refers to a remote resource
 *
 */
const isRemote = url => url.protocol && url.hostname

/**
 * Resolve the given url to a local file, even if it is remote.
 *
 */
const fetchRemote = (location, mimeType) => new Promise((resolve, reject) => {
    const locationWithoutQuotes = location.replace(patterns.quotes, '')
    debug(`fetchRemote? ${locationWithoutQuotes}`)

    const parsedUrl = url.parse(locationWithoutQuotes)
    if (isRemote(parsedUrl)) {
        // then fetch it
        debug('fetching remote')
        return rp(locationWithoutQuotes).then(data => {
            debug(`fetchRemote done`)
            const extension = mimeType || parsedUrl.pathname.substring(parsedUrl.pathname.lastIndexOf('.'))
            tmp.tmpName({ postfix: extension }, (err, tmpFilePath) => {
                if (err) {
                    reject(err)
                } else {
                    fs.writeFile(tmpFilePath, data, err => {
                        if (err) {
                            reject(err)
                        } else {
                            resolve({ location: tmpFilePath, removeWhenDone: true })
                        }
                    })
                }
            })
        })
    } else {
        fs.exists(ui.findFile(expandHomeDir(locationWithoutQuotes)), doesExist => {
            if (doesExist) {
                // nothing to fetch, it's local!
                resolve({ location: locationWithoutQuotes })
            } else {
                // we can't determine how to access the given url
                reject(`Unable to locate the given resource location ${locationWithoutQuotes}`)
            }
        })
    }
})

const patterns = {
    action: {
        expr: {
            inline: /\s*([^=]+)\s*=>\s*(.+)/,
            full: /^.*(const|let)\s+([^\.=]+)(\.[^=]+)?\s*=\s*([^=]+\s*=>\s*.+)/,
            fromFileWithExtension: /^.*(const|let)\s+([^=]+)(\.\w+)\s*=\s*(.*)/,
            fromFile: /^.*(const|let)\s+([^=]+)(\.\w+)?\s*=\s*(.*)/
        }
    },
    intention: {
        inline: /\s*\|([^\|]+)\|\s*/,
        full: /^.*(const|let)\s+([^\.=]+)(\.[^=]+)?\s*=\s*\|([^\|]+)\|\s*/,
    },
    sequence: {
        expr: /^.*(const|let)\s+([^\.=]+)(\.[^=]+)?\s*=\s*(.*)/,
        components: /\s*->\s*/
    },
    annotations: { // -a foo bar at the end of a let
        suffix: /(\s+(-(a|p)\s+.*\s+.*))+/
    },
    quotes: /"/g,
    trailingWhitespace: /\s+$/g
}

const extensionToKind = {
    '.js': 'nodejs:default',
    '.py': 'python:default',
    '.swift': 'swift:default'
}

/** annotations */
const annotations = options => {
    if (!options.annotations) {
        options.annotations = []
    }
    return options.annotations
}
const boolean = key => options => annotations(options).push({ key: key, value: true })
const string = (key,value) => options => annotations(options).push({ key: key, value: value })
const web = extension => [ boolean('web-export'), string('content-type-extension', extension) ]
const annotators = {
    'const': [ boolean('final') ],
    '.json': web('json'),
    '.http': web('http'),
    '.css': web('http'),
    '.ico': web('http'),
    '.webjs': web('http'),
    '.png': web('http'),
    '.jpg': web('http'),
    '.jpeg': web('http'),
    '.svg': web('svg'),
    '.html': web('html')
}

/** maps from: "   hello    "   to: "   hello" */
const cutTrailingWhitespace = str => str && str.replace(patterns.trailingWhitespace, '')

const quotes = /^"(.*)"$/g
const trim = str => str.trim().replace(quotes, '$1')

/** is the given extension (with dot) a valid one? */
const isValidExtension = extension => !!annotators[extension] || extension === '.zip'

/** is it foo.bar or foo with a .jpg mime type? */
const figureName = (baseName, possibleMimeType = '') => {
    return trim(isValidExtension(possibleMimeType) ? baseName : `${baseName}${possibleMimeType}`)
}

/** is this a wskng managed asset? */
const isManagedAsset = action => action.annotations && action.annotations.find(kv => kv.key === 'wskng.combinators')

/** is this a web asset, or managed web asset? */
const isWebAsset = action => action.annotations && action.annotations.find(kv => kv.key === 'web-export')
const isManagedWebAsset = action => isWebAsset(action) && isManagedAsset(action)

/**
* Create a zip action, given the location of a zip file
*
*/
const makeZipActionFromZipFile = (wsk, name, location, options, commandTree, preflight, execOptions) => new Promise((resolve, reject) => {
    try {
        debug('makeZipActionFromZipFile', name, location, options)

        fs.exists(location, exists => {
            if (!exists) {
                reject(`I think you asked to create a zip action, but the specified zip file does not exist: ${location}`)
            } else {
                fs.readFile(location, (err, data) => {
                    if (err) {
                        reject(err)
                    } else {
                        const action = {
                            exec: {
                                kind: options.kind || 'nodejs:default',
                                code: data.toString('base64'),
                            },
                            annotations: (options.action && options.action.annotations || []),
                            parameters: options.action && options.action.parameters || [],
                            limits: options.action && options.action.limits || {}
                        }
                        debug('body', action)
                        
                        const owOpts = wsk.owOpts({ name,
                                                    // options.action may be defined, if the command has e.g. -a or -p
                                                    action
                                                  })

                        // location on local filesystem
                        owOpts.action.annotations.push({ key: 'file', value: expandHomeDir(location) })

                        // add an annotation to indicate that this is a managed action
                        owOpts.action.annotations.push({ key: 'wskng.combinators', value: [{
                            type: 'action.kind',
                            role: 'replacement',
                            badge: 'zip'
                        }]})

                        // broadcast that this is a binary action
                        owOpts.action.annotations.push({ key: 'binary', value: true })

                        preflight('update', owOpts)
                            .then(owOpts => wsk.ow.actions.update(owOpts)) // dangit, the openwhisk npm uses classes, so we have to do this
                            .then(wsk.addPrettyType('actions', 'update', name))
                            .then(action => resolve(execOptions && execOptions.nested ? action : commandTree.changeContext(`/wsk/actions`, name)(action)))
                            .catch(reject)
                    }
                })
            }
        })
    } catch (err) {
        console.error(err)
        reject('Internal error')
    }
})

/**
 * Execute `npm install` in the given directory
 *
 */
const doNpmInstall = dir => new Promise((resolve, reject) => {
    require('child_process').exec('npm install', { cwd: dir },             // the command
                                  err => err && reject(err) || resolve())  // the callback
})

/**
 * Create a zip action, given location, which is a directory
 * containing (at least) an index.js.  If the directory also contains
 * a package.json, and the directory does not contain a node_modules
 * subdirectory, then `npm install` will executed prior to zipping up
 * the directory
 *
 */
const makeZipAction = (wsk, name, location, options, commandTree, preflight, execOptions) => new Promise((resolve, reject) => {
    try {
        debug('makeZipAction', location)
        fs.lstat(location, (err, stats) => {
            if (err) {
                reject(err)
            } else if (!stats.isDirectory()) {
                reject('I think you asked to create a zip action, but the specified location is not a directory.')
            } else {
                const needsNpmInstall = fs.existsSync(path.join(location, 'package.json')) && !fs.existsSync(path.join(location, 'node_modules')),
                      npmInstallTask = !needsNpmInstall ? Promise.resolve() : doNpmInstall(location)

                npmInstallTask.then(() => {
                    const archiver = require('archiver'),
                          tmp = require('tmp'),
                          archive = archiver('zip')

                    tmp.tmpName((err, path) => {
                        if (err) {
                            reject(err)
                        } else {
                            const output = fs.createWriteStream(path)

                            // when the zip archiver completes, and closes the output file...
                            output.on('close', () => {
                                makeZipActionFromZipFile(wsk, name, path, options, commandTree, preflight, execOptions)
                                    .then(resolve, reject)
                            })

                            // create the zip
                            archive.pipe(output)
                            archive.directory(location, '')
                            archive.finalize()
                        }
                    })
                })
            }
        })
    } catch (err) {
        console.error(err)
        reject('Internal error')
    }
})

/**
 * Create a managed web asset
 *
 */
const webAssetTransformer = (location, text, extension) => {
    let headers = '',
        extensionWithoutDot = extension.substring(1),
        content_type = extensionWithoutDot

    // any base64 or whatever
    let identity = x=>x,
        base64 = x=>new Buffer(x).toString('base64'),
        xform = identity

    if (extension === '.css') {
	headers = 'headers: { "content-type": "text/css" },'
	content_type = 'body'
    } else if (extension === '.webjs') {
	headers = 'headers: { "content-type": "application/javascript" },'
	content_type = 'body'
    } else if (extension === '.png') {
	headers = 'headers: { "content-type": "image/png" },'
	content_type = 'body'
        xform = base64
    } else if (extension === '.ico') {
	headers = 'headers: { "content-type": "image/x-icon" },'
	content_type = 'body'
        xform = base64
    } else if (extension === '.jpg' || extension === '.jpeg') {
	headers = 'headers: { "content-type": "image/jpeg" },'
	content_type = 'body'
        xform = base64
    }

    return "const stripSlash = s => s.substring(0, s.lastIndexOf('/'))\n"
        + "const getHostRelativeRoot = () => `/api/v1/web${stripSlash(stripSlash(process.env.__OW_ACTION_NAME))}`\n"
        + 'const getReferer = hostRelativeRoot => `${process.env.__OW_API_HOST}${hostRelativeRoot}\`\n'
        + `function main(params) { const hostRelativeRoot = getHostRelativeRoot(); const referer = getReferer(hostRelativeRoot); const getParams = () => { delete params.__ow_headers; delete params.__ow_path; delete params.__ow_method; return params; }; return { ${headers} ${content_type}: \``
        + xform(text || fs.readFileSync(expandHomeDir(location)))
        + "\`} }"
}
                                 

/**
 * Create an HTML, CSS, script-js, etc. action
 *
 */
const makeWebAsset = (wsk, name, extension, location, text, options, commandTree, preflight, execOptions) => {
    const extensionWithoutDot = extension.substring(1)
    const action = Object.assign({}, options.action, {
        exec: { kind: 'nodejs:default' }
    });

    // add annotations
    if (!action.annotations) action.annotations = [];
    (annotators[extension] || []).forEach(annotator => annotator(action))
    action.annotations.push({ key: 'file', value: expandHomeDir(location) })

    // add an annotation to indicate that this is a managed action
    action.annotations.push({ key: 'wskng.combinators', value: [{
        type: 'web',
        role: 'replacement',
        badge: 'web',
        contentType: extensionWithoutDot
    }]})

    action.exec.code = webAssetTransformer(location, text, extension)

    const owOpts = wsk.owOpts({ name, action })
    return preflight('update', owOpts)
        .then(owOpts => wsk.ow.actions.update(owOpts)) // dangit, the openwhisk npm uses classes, so we have to do this
        .then(wsk.addPrettyType('actions', 'update', name))
        .then(action => execOptions && execOptions.nested ? action : commandTree.changeContext(`/wsk/actions`, name)(action))
}

/** here is the module */
module.exports = (commandTree, prequire) => {
    const wsk = prequire('/ui/commands/openwhisk-core'),
          preflight = prequire('/code/validation/preflight').preflight

    /**
     * Create an OpenWhisk action from a given file
     *
     * @param letType let or const?
     *
     */
    const createFromFile = (name, mimeType, location, letType, options, execOptions) => {
        const extension = location.substring(location.lastIndexOf('.')),
              kind = extensionToKind[extension]

        if (extension === '.zip') {
            return makeZipActionFromZipFile(wsk, name, location, options, commandTree, preflight, execOptions)

        } else if (mimeType === '.zip') {
            return makeZipAction(wsk, name, location, options, commandTree, preflight, execOptions)

        } else if (kind && mimeType !== '.webjs') {
            //
            // then this is a built-in type
            //
            //const annotationArgs = (options.annotations || []).map(kv => `-a ${kv.key} ${kv.value}`).join(' ')
            return repl.qexec(`wsk action update "${name}" "${location}"`)
                .then(action => {
                    (annotators[letType] || []).forEach(annotator => annotator(action))
                    if (mimeType) (annotators[mimeType] || []).forEach(annotator => annotator(action))
                    if (options.action) {
                        action.annotations = action.annotations.concat(options.action.annotations || [])
                        action.parameters = options.action.parameters
                        action.limits = options.action.limits
                    }
                    const owOpts = wsk.owOpts({
                        name: name,
                        action: action
                    })
                    return preflight('update', owOpts)
                        .then(owOpts => wsk.ow.actions.update(owOpts)) // dangit, the openwhisk npm uses classes, so we have to do this
                })
                .then(wsk.addPrettyType('actions', 'update', name))
                .then(action => execOptions && execOptions.nested ? action : commandTree.changeContext(`/wsk/actions`, name)(action))

        } else {
            //
            // otherwise, assume this is a web action for now
            //
             const extra = mimeType === '.html' || extension === '.html'
                   ? require('./_html')().deploy(location)
                   : Promise.resolve({ location })
            return extra.then(({location, text}) => {
                return makeWebAsset(wsk, name, mimeType || extension, location, text,
                                    options, commandTree, preflight, execOptions)
            })
        }
    }

    let currentIter = 0 // optimization
    const createWithRetryOnName = (code, parentActionName, idx, iter, desiredName) => wsk.ow.actions.create(wsk.owOpts({
        name: desiredName || `${baseName}-${idx}-${iter}`,
        action: {
            exec: {
                kind: 'nodejs:default',
                code: code
            },
            annotations: [{ key: ANON_KEY_FQN, value: `/${namespace.current()}/${parentActionName}` },
                          { key: ANON_KEY, value: parentActionName },
                          { key: ANON_CODE, value: code.replace(/^let main = /,'') }] // .*\s*=>\s*
        },
    })).then(action => {
        currentIter++ // optimization
        return action
    }).catch(err => {
        if (err.statusCode === 409) {
            // name conflict
            if (!desiredName) currentIter++ // optimization
            return createWithRetryOnName(code, parentActionName, idx, desiredName ? iter : iter + 1)
        } else {
            throw err
        }
    });

    const doCreate = (retryOK, _2, fullArgv, modules, fullCommand, execOptions) => {
        const update = execOptions.createOnly ? 'create' : 'update'

        /**
         * If the create failed, maybe this is because the package does not exist?
         *
         */
        const packageAutoCreate = name => err => {
            if (err.statusCode === 404 && retryOK) {
                // create failure with 404, maybe package not found?
                const path = name.split('/'),
                      packageName = path.length === 2 ? path[0] : path.length === 3 ? path[1] : undefined
                if (packageName) {
                    return repl.qexec(`wsk package update "${packageName}"`)
                        .then(() => doCreate(false, _2, fullArgv, modules, fullCommand, execOptions))
                }
            }

            // otherwise, it wasn't a package existence issue
            throw err
        }
                
        const maybeComponentIsFile = (name, mimeType, location, letType = 'let', options = {}, execOptions = {}) => {
            return fetchRemote(location, mimeType)
                .then(location => {
                    return createFromFile(name, mimeType, location.location, letType, options, execOptions)
                          .catch(packageAutoCreate(name))
                          .then(resource => {
                              if (location.removeWhenDone) {
                                  // we were asked to clean up when we finished with the location
                                  debug('cleaning up', location.location)
                                  fs.unlink(location.location, err => {
                                      if (err) {
                                          console.error(err)
                                      }
                                  })
                              }

                              return resource
                          })
                })
        }
    
        /**
         * Take an expression of a component and wrap, if it is an interior inline function
         *
         */
        const furlSequenceComponent = parentActionName => (component, idx) => {
            const intentionMatch = component.match(patterns.intention.inline)
            const match = component.match(patterns.action.expr.inline)

            if (!intentionMatch && match && match.length === 3) {
                // then this component is an inline function
                debug('sequence component is inline function', match[0])
                const body = beautify(`let main = ${match[0]}`),
                      candidateName = `${parentActionName}-${idx + 1}`
                return createWithRetryOnName(body, parentActionName, idx, currentIter, candidateName)

            } else {
                if (intentionMatch) {
                    debug('sequence component is intention', intentionMatch[1])
                    const intention = intentionMatch[1] // e.g. |save to cloudant|
                    return repl.iexec(intention)        // this will return the name of the action that services the intent

                } else if (fs.existsSync(expandHomeDir(component))) {
                    debug('sequence component is local file', component)
                    // then we assume that the component identifies a local file
                    //    note: the first step reserves a name
                    return createWithRetryOnName('let main=x=>x', parentActionName, idx, currentIter, path.basename(component.replace(/\..*$/, '')))
                        .then(reservedAction => reservedAction.name)
                        .then(reservedName => maybeComponentIsFile(reservedName, undefined, component, 'let', {}, { nested: true }))

                } else {
                    debug('sequence component is named action', component)
                    // then we assume, for now, that `component` is a named action
                    return Promise.resolve(component)
                }
            }
        }
        const furl = (components, parentActionName) => Promise.all(components.map(furlSequenceComponent(parentActionName)))

        const argvWithOptions = fullArgv,
              pair = wsk.parseOptions(argvWithOptions.slice(), 'action'),
              regularOptions = minimist(pair.argv, { configuration: { 'camel-case-expansion': false } }),
              options = Object.assign({}, regularOptions, pair.kvOptions),
              argv = options._

        // remove the minimist bits
        delete options._

        //debug('args', options, fullCommand)

        const actionMatch = fullCommand.match(patterns.action.expr.full),
              intentionMatch = fullCommand.match(patterns.intention.full),
              sequenceMatch = fullCommand.match(patterns.sequence.expr),
              components = sequenceMatch && sequenceMatch[4].split(patterns.sequence.components),
              isSequenceMatch = sequenceMatch && components.length > 1

        if (intentionMatch && !isSequenceMatch) {
            debug('intentionMatch', intentionMatch)
            const letType = intentionMatch[1],
                  mimeType = cutTrailingWhitespace(intentionMatch[3]),
                  name = figureName(intentionMatch[2], mimeType),
                  intention = intentionMatch[4]               // e.g. |save to cloudant|

            return repl.iexec(`${intention} --name ${name}`)  // this will return the name of the action that services the intent
                .then(action => {
                    (annotators[letType] || []).forEach(annotator => annotator(action))
                    if (mimeType) (annotators[mimeType] || []).forEach(annotator => annotator(action))
                    if (options.action) {
                        action.annotations = action.annotations.concat(options.action.annotations || [])
                        action.parameters = options.action.parameters
                        action.limits = options.action.limits
                    }

                    const owOpts = wsk.owOpts({
                        name: action.name,
                        namespace: action.namespace,
                        action: action
                    })
                    return preflight(update, owOpts)
                        .then(owOpts => wsk.ow.actions[update](owOpts)) // dangit, the openwhisk npm uses classes, so we have to do this
                        .then(wsk.addPrettyType('actions', 'update'))
                        .then(action => execOptions && execOptions.nested ? action : commandTree.changeContext(`/wsk/actions`, action.name)(action))
                })
                .catch(packageAutoCreate(name))

        } else if (actionMatch && !isSequenceMatch) {
            //
            // then this is an anonymous action-creating let
            //
            const letType = actionMatch[1],                         // let or const?
                  mimeType = cutTrailingWhitespace(actionMatch[3]), // did the user specify a content type?
                  extension = mimeType || '.js',                    // for now, we assume that the inline code is nodejs
                  kind = extensionToKind[extension] || 'nodejs:default',
                  name = figureName(actionMatch[2], extensionToKind[extension] ? '' : mimeType),  // name of action
                  annoMatch = actionMatch[4].match(patterns.annotations.suffix)   // the code might've captured the -a and -p arguments

            if (annoMatch) {
                actionMatch[4] = actionMatch[4].replace(patterns.annotations.suffix, '')
            }
            const code = beautify(`let main = ${actionMatch[4]}`)

            /*if (!kind) {
                throw new Error('Please use a name with an extension of .js, .py, or .swift')
            }*/

            const action = options.action || {}
            action.exec = {
                kind: kind,
                code: code
            };

            // add any annotations
            (annotators[letType] || []).forEach(annotator => annotator(action))
            if (annotators[extension]) annotators[extension].forEach(annotator => annotator(action))

            debug('inline-function::create', name)
            return repl.qexec(`wsk action update "${name}"`, undefined, undefined, { entity: { action } })
                .catch(packageAutoCreate(name))

        } else {
            // maybe a sequence?
            debug('sequenceMatch', sequenceMatch, components)
            if (sequenceMatch) {
                // maybe it is a sequence!
                const letType = sequenceMatch[1],
                      mimeType = cutTrailingWhitespace(sequenceMatch[3]),
                      name = figureName(sequenceMatch[2].trim(), mimeType)

                if (components.length >= 2) {

                    //
                    // the last component might have grabbed the annotations
                    //
                    const last = components[components.length - 1],
                          annoMatch = last.match(patterns.annotations.suffix)
                    if (annoMatch) {
                        components[components.length - 1] = last.replace(patterns.annotations.suffix, '')
                    }

                    return furl(components, name)
                        .then(componentEntities => {
                            let extraArgs = '',
                                last = componentEntities[componentEntities.length - 1],
                                components = componentEntities.map(C => C.name ? '/' + C.namespace + '/' + C.name : C) // array of names, versus array of entities

                            if (execOptions.dryRun) {
                                // caller is just asking for the details, not for us to create something
                                const action = options.action || {}
                                return { name, components, componentEntities,
                                         annotations: action.annotations, parameters: action.parameters }
                            }

                            if (isWebAsset(last)) {
                                // if the last element in the sequence is a web action, then make the sequence a web action
                                extraArgs = '--web'
                                const contentType = last.annotations && last.annotations.find(kv => kv.key === 'content-type-extension')
                                if (contentType) {
                                    extraArgs += ` --content-type ${contentType.value}`
                                }
                            }

                            debug('creating sequence', extraArgs, name, components)
                            return repl.qexec(`wsk action update --sequence ${extraArgs} "${name}" ${components.join(',')}`)
                                .then(action => {
                                    (annotators[letType] || []).forEach(annotator => annotator(action))
                                    if (mimeType) {
                                        (annotators[mimeType] || []).forEach(annotator => annotator(action))

                                        // make sure this appears as a sequence
                                        //    for the case where the entity was first created e.g. with let s=|request|
                                        //    then later the user added a second element, turning the action into a sequence
                                        action.annotations = action.annotations.filter(kv => kv.key !== 'wskng.combinators')
                                    }
                                    if (options.action) {
                                        action.annotations = action.annotations.concat(options.action.annotations || [])
                                        action.parameters = options.action.parameters
                                        action.limits = options.action.limits
                                    }

                                    if (annoMatch) {
                                        // e.g. let seq = a->b (-a foo bar)   <-- the parenthesized last part
                                        const commandLineOptions = wsk.parseOptions(annoMatch[2].split(/\s+/), 'action')
                                        if (commandLineOptions && commandLineOptions.action) {
                                            if (commandLineOptions.action.annotations) {
                                                action.annotations = action.annotations.concat(commandLineOptions.action.annotations)
                                            }
                                            if (commandLineOptions.action.parameters) {
                                                action.parameters = action.parameters.concat(commandLineOptions.action.parameters)
                                            }
                                        }
                                    }

                                    const owOpts = wsk.owOpts({
                                        name: action.name,
                                        namespace: action.namespace,
                                        action: action
                                    })
                                    return preflight(update, owOpts)
                                        .then(owOpts => wsk.ow.actions[update](owOpts)) // dangit, the openwhisk npm uses classes, so we have to do this
                                        .then(wsk.addPrettyType('actions', 'update'))
                                        .then(action => execOptions && execOptions.nested ? action : commandTree.changeContext(`/wsk/actions`, action.name)(action))
                                })
                        })
                        .catch(packageAutoCreate(name))
                } else {
                    // maybe from a file
                    const command = argv.join(' ')
                    const actionFromFileMatch = command.match(patterns.action.expr.fromFileWithExtension) || command.match(patterns.action.expr.fromFile)
                    debug('fileMatch', actionFromFileMatch, command)

                    if (actionFromFileMatch) {
                        const letType = actionFromFileMatch[1],
                              mimeType = cutTrailingWhitespace(actionFromFileMatch[3]),
                              name = figureName(actionFromFileMatch[2], mimeType),
                              location = actionFromFileMatch[4]

                        return maybeComponentIsFile(name, mimeType, location, letType, options, execOptions)
                    } else {
                        throw new Error('Unable to parse your command')
                    }
                }
            } else {
                throw new Error('Unable to parse your command')
            }
        }
    } /* doCreate */

    // Install the routes
    wsk.synonyms('actions').forEach(syn => {
        const cmd = commandTree.listen(`/wsk/${syn}/let`, doCreate, { docs: 'Create an OpenWhisk action' })
        commandTree.synonym(`/wsk/${syn}/const`, doCreate, cmd)

        try {
            const createCmd = commandTree.find(`/wsk/${syn}/create`),
                  updateCmd = commandTree.find(`/wsk/${syn}/update`)
            if (createCmd && createCmd.options) createCmd.options.hide = true
            if (updateCmd && updateCmd.options) updateCmd.options.hide = true
        } catch (e) {
            console.error(e)
        }
    })

    return {
        /** is the given action the result of an anonymous let */
        isAnonymousLetFor: (action, parent) => {
            const annotation = action.annotations && action.annotations.find(kv => kv.key === ANON_KEY),
                  annotationFQN = action.annotations && action.annotations.find(kv => kv.key === ANON_KEY_FQN)
            return (annotation && annotation.value === parent)
                || (annotationFQN && annotationFQN.value === parent)
        },
        isAnonymousLet,

        // resolve the given expression to an action
        //   e.g. is "a" the name of an action, or the name of a file
        resolve: (expr, parentActionName, idx) => repl.qexec(`wsk actions get ${expr}`, undefined, undefined, { noRetry: true })
            .catch(err => {
                if (err.statusCode === 404 || err.statusCode === 400) {
                    // then this isn't an action (yet)

                    const commandFn = (iter, baseName = parentActionName) => `let ${baseName}-anon${iter === 0 ? '' : '-' + iter} = ${expr}`,
                          command = commandFn(0),
                          actionMatch = command.match(patterns.action.expr.full),
                          intentionMatch = command.match(patterns.intention.full),
                          sequenceMatch = command.match(patterns.sequence.expr),
                          components = sequenceMatch && sequenceMatch[4].split(patterns.sequence.components),
                          isSequenceMatch = sequenceMatch && components.length > 1

                    if (!intentionMatch && !isSequenceMatch && actionMatch) {
                        // then this is an inline anonymous function
                        debug('resolve::inline')
                        return createWithRetryOnName(`let main = ${expr}`, parentActionName, idx, 0)
                        
                    } else if (intentionMatch) {
                        const baseName = intentionMatch[4].substring(1, intentionMatch[4].indexOf(' '))
                        return repl.iexec(`${intentionMatch[4]} --name ${baseName}-anon-${idx}`)

                    } else {
                        const actionFromFileMatch = command.match(patterns.action.expr.fromFile)
                        let baseName
        
                        if (actionFromFileMatch) {
                            // try to pull an action name from the file name
                            baseName = path.basename(actionFromFileMatch[4])
                        }

                        const once = iter => repl.qexec(commandFn(iter, baseName), undefined, undefined, { createOnly: true })
                              .catch(err => {
                                  if (err.statusCode === 409) {
                                      return once(iter + 1)
                                  }
                              });
                        debug('resolve::via let', baseName, parentActionName)
                        return once(0)
                    }

                } else {
                    throw err
                }
            })
    }
}
