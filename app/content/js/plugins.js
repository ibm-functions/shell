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

const debug = require('debug')('plugins')
debug('loading')

const fs = require('fs'),
      path = require('path'),
      commandTree = require('./command-tree')

debug('modules loaded')

const pluginRoot = path.join(__dirname, '..', '..', 'plugins'),   // filesystem path for the plugins
      commandToPlugin = {},                                       // map from command to plugin that defines it
      isSubtreeSynonym = {},
      isSynonym = {},
      topological = {},                                           // topological sort of the plugins (order they resolved)
      overrides = {},                                             // some plugins override the behavior of others
      usage = {},                                                 // as we scan for plugins, we'll memoize their usage models
      flat = [],
      registrar = {}                                              // this is the registrar for plugins

debug('globals initialized')

/**
 * when in live (not scanning) mode, this will store the result of a
 * previous plugin scan
*/
let prescan

/**
 * Generic filesystem scanning routine
 *     Note that, when scanning for plugins, we ignore subdirectories named "helpers"
 *
 */
const readDirRecursively = dir => {
    if (path.basename(dir) !== 'helpers'
        && path.basename(dir) !== 'modules'
        && path.basename(dir) !== 'node_modules'
        && fs.statSync(dir).isDirectory()) {
        return Array.prototype.concat(...fs.readdirSync(dir).map(f => readDirRecursively(path.join(dir, f))))
    } else {
        return dir
    }
}

/**
 * Scan the given directory, recursively, for javascript files, each of which will be treated as a plugin
 *
 */
const scanForPlugins = dir => readDirRecursively(dir).filter(s => s.endsWith('.js'))
exports.scanForPlugins = scanForPlugins

/**
 * Scan for plugins incorporated via app/plugins/package.json
 *
 */
const scanForModules = dir => {
    debug('scanForModules')

    try {
        const plugins = {}

        const doScan = ({modules, moduleDir}) => {
            modules.forEach(module => {
                const modulePath = path.join(moduleDir, module)

                if (module.charAt(0) === '@') {
                    // support for @owner/repo style modules; see shell issue #260
                    return doScan({ modules: fs.readdirSync(modulePath), moduleDir: modulePath })
                }

                const pluginPath = path.join(moduleDir, module, 'plugin.js')
                if (fs.existsSync(pluginPath)) {
                    console.log(`Found module ${path.basename(module)}`)
                    plugins[module] = pluginPath
                } else {
                    const backupPluginPath = path.join(modulePath, 'plugin', 'plugin.js')
                    if (fs.existsSync(backupPluginPath)) {
                        console.log(`Found module ${path.basename(module)}`)
                        plugins[module] = backupPluginPath
                    } else {
                        //console.error('Skipping plugin, because it does not have a plugin.js', module)
                    }
                }
            })
        }

        // scan the app/plugins/modules directory
        const moduleDir = path.join(dir, 'modules')
        debug('moduleDir', moduleDir)
        doScan({ modules: fs.readdirSync(moduleDir), moduleDir })

        // scan any modules in package.json
        const packageJsonPath = path.join(dir, 'package.json')
        if (fs.existsSync(packageJsonPath)) {
            const packageJsonDeps = require(packageJsonPath).dependencies,
                  packageJsonDepsArray = []
            for (let module in packageJsonDeps) {
                if (module.startsWith('shell-')) {
                    packageJsonDepsArray.push(module)
                    
                }
            }
            doScan({ modules: packageJsonDepsArray, moduleDir: path.join(dir, 'node_modules') })
        }

        return plugins
    } catch (e) {
        console.error('Error scanning for external plugins', e)
    }
}

/**
 * Allow one plugin to require another
 *
 */
const prequire = module => {
    debug('prequire %s', module)

    if (registrar.hasOwnProperty(module)) return registrar[module]
    else throw new Error('Module not found: ' + module)
}

/**
 * Turn a map {k1:true, k2:true} into an array of the keys
 *
 */
const toArray = M => {
    const A = []
    for (let key in M) {
        A.push(key)
    }
    return A
}

/**
 * Load one plugin for the given plugin route, located in the given pluginPath on the local filesystem
 *
 */
const loadPlugin = (route, pluginPath) => {
    debug('loadPlugin %s', route)

    const deps = {}

    // for assembly mode, override prequire
    const preq = module => {
        deps[module] = true
        return prequire(module)
    }

    // and override commandTree.listen
    const cmdToPlugin = {}
    const ctree = commandTree.proxy(route)
    const listen = ctree.listen,
          intention = ctree.intention,
          synonym = ctree.synonym,
          subtree = ctree.subtree,
          subtreeSynonym = ctree.subtreeSynonym

    ctree.subtreeSynonym = function(route, master) {
        if (route !== master.route) {
            isSubtreeSynonym[route] = true
            isSubtreeSynonym[master.route] = true
            return subtreeSynonym(route, master)
        }
    }
    ctree.listen = function(commandRoute) {
        cmdToPlugin[commandRoute] = route
        return listen.apply(undefined, arguments)
    }
    ctree.subtree = function(route, options) {
        return subtree(route, Object.assign({ listen: ctree.listen }, options))
    }
    ctree.intention = function(commandRoute) {
        cmdToPlugin[commandRoute] = route
        return intention.apply(undefined, arguments)
    }
    ctree.synonym = function(commandRoute) {
        cmdToPlugin[commandRoute] = route
        isSynonym[commandRoute] = true
        return synonym.apply(undefined, arguments)
    }

    const pluginLoader = require(pluginPath)
    if (typeof pluginLoader === 'function') {
        // invoke the plugin loader
        registrar[route] = pluginLoader(ctree, preq)

        // turn the deps map, which is a canonicalization map from
        // module=>true (i.e. we use it to remove duplicates), into an
        // array of the non-duplicate modules
        const adeps = toArray(deps)
        if (adeps.length > 0) {
            topological[route] = adeps
        }

        // generate a mapping from commands (e.g. /wsk/action/invoke)
        // to plugin (e.g. /ui/commands/openwhisk-core, which services
        // the /wsk/action/invoke command)
        for (let k in cmdToPlugin) {
            if (commandToPlugin[k]) {
                overrides[k] = cmdToPlugin[k]
            }
            commandToPlugin[k] = cmdToPlugin[k]
        }
    }
}

/**
 * Attempt to load the plugins
 *
 */
const resolve = (opts, pluginPaths, iter) => {
    debug('resolve')
    if (iter >= 100) {
        debug('unable to resolve plugins')
        throw new Error('Unable to resolve plugins')
    }

    let nUnresolved = 0
    for (var route in pluginPaths) {
        debug('resolving %s', route)
        try {
            // commandTree.proxy(route): we do this to help with remembering from which plugin command registrations emanate
            //if (!opts || !opts.quiet) console.log(`Resolving ${route}`)

            const module = { route: route, path: pluginPaths[route] }
            loadPlugin(route, pluginPaths[route], opts)
            flat.push(module)
            delete pluginPaths[route]
        } catch (e) {
            //if (!opts || !opts.quiet) console.log(`Unresolved ${route}`)
            if (e.message.indexOf('Module not found') < 0) {
                console.error(e)
            }
            nUnresolved++
        }
    }

    if (nUnresolved > 0) {
        resolve(opts, pluginPaths, iter + 1)
    } else {
        debug('resolve done')
    }
}

/**
 * Look for plugins by scanning the local filesystem
 *
 */
const resolveFromLocalFilesystem = (opts={}) => {
    debug('resolveFromLocalFilesystem')

    // first, we enumerate the plugins; don't scan internal plugins if given a root dir
    // if we *are* given a root dir, we only want to scan that dir
    const internalPlugins = opts.externalOnly ? {} : scanForPlugins(pluginRoot)
        .reduce((M, pluginPath) => {
            //
            // - route is the /a/b/c path that consumers will use to require a plugin
            // - pluginPath is the filesystem path to the plugin
            //
            // note: the last replace bit is for windows, where filesystem paths have backslash separators
            //
            const route = pluginPath.replace(pluginRoot, '').replace(/\.js$/,'').replace(/\\/g, '/')
            M[route] = pluginPath
            return M
        }, {})

    const externalPlugins = opts && opts.noExternalPlugins ? {} : scanForModules(opts.pluginRoot || pluginRoot)

    const availablePlugins = Object.assign({}, internalPlugins, externalPlugins)

    debug('internalPlugins %s', JSON.stringify(internalPlugins))
    debug('externalPlugins %s', JSON.stringify(externalPlugins))

    // then, we load the plugins
    resolve(opts, availablePlugins, 0)

    // this is all synchronous
    return Promise.resolve()
}

/**
 * Load the prescan model, in preparation for loading the shell
 *
 */
exports.init = ({app = require('electron').remote.app}={}) => {
    debug('init')

    // first try loading the prescan from the userData directory
    return loadPrescan(pluginRoot)
        .then(builtins => loadPrescan(path.join(app.getPath('userData'), 'plugins'))
              .catch(err => {
                  debug('no user-installed plugins, due to %s', err)
                  return {}
              })
              .then(unify(builtins))  // merge builtin plugins with user-installed plugins
              .then(_ => prescan = _) // global variable, ugh
              .then(makeResolver)
              .then(commandTree.setPluginResolver))
}

/**
 * Load the prescan model, in preparation for loading the shell
 *
 */
const loadPrescan = userDataDir => {
    const prescanned = path.join(userDataDir, '.pre-scanned')
    debug('loading prescan %s', prescanned)

    return new Promise((resolve, reject) => {
        fs.readFile(prescanned, (err, _data) => {
            debug('read done, any errors in the read? %s', !!err)

            if (err) {
                reject(err)
            } else {
                const data = _data.toString()
                if (data.trim().length === 0) {
                    // it was empty
                    resolve({})
                } else {
                    resolve(JSON.parse(data))
                }
            }
        })
    })
}

/**
 * Unify two prescan models
 *
 */
const unify = m1 => m2 => {
    debug('unify')

    const { isArray } = require('util')
    const unified = {}

    for (let key in m1) {
        const v1 = m1[key],
              v2 = m2[key]

        unified[key] = v1

        if (v2) {
            debug('unifying user-installed model for %s', key)
            if (isArray(v1)) {
                unified[key] = v1.concat(v2)
            } else {
                for (let kk in v2) {
                    v1[kk] = v2[kk]
                }
            }
        }
    }

    return unified
}

/**
 * Make a plugin resolver from a given prescan model
 *
 */
const makeResolver = prescan => {
    debug('makeResolver')

    /** memoize resolved plugins */
    const isResolved = {}

    /** resolve one given plugin */
    const resolveOne = plugin => {
        if (!plugin || isResolved[plugin]) {
            return
        }
        isResolved[plugin] = true
        const prereqs = prescan.topological[plugin]
        if (prereqs) {
            prereqs.forEach(exports.require)
        }
        exports.require(plugin)
    }

    /** a plugin resolver impl */
    const resolver = {
        isOverridden: route => prescan.overrides[route],

        disambiguate: command => {
            debug('attempting to disambiguate command', command)
            return prescan.disambiguator[command]
        },

        /** given a partial command, do we have a disambiguation of it? e.g. "gr" => "grid" */
        disambiguatePartial: partial => {
            debug('attempting to disambiguate partial', partial)
            const matches = []
            if (prescan.disambiguator) {
                for (let command in prescan.disambiguator) {
                    if (command.indexOf(partial) === 0) {
                        const { route, plugin } = prescan.disambiguator[command]
                        matches.push(command)
                    }
                }
            }

            debug('disambiguate partial', partial, matches)
            return matches
        },

        /** load any plugins required by the given command */
        resolve: (command, {subtree=false}={}) => { // subpath if we are looking for plugins for a subtree, e.g. for cd /auth
            let plugin, matchLen
            for (let route in prescan.commandToPlugin) {
                if (subtree ? route.indexOf(command) === 0 : command.indexOf(route) === 0) {
                    if (!matchLen || route.length > matchLen) {
                        plugin = prescan.commandToPlugin[route]
                        matchLen = route.length
                    }
                }
            }
            if (plugin) {
                resolveOne(plugin)
            }
        }
    }

    return resolver
}

/**
 * Generate a prescan model
 *
 */
exports.scan = opts => {
    debug('scan', opts)

    const state = opts.externalOnly && commandTree.startScan()

    return resolveFromLocalFilesystem(opts).then(() => {
        const disambiguator = {}
        for (let route in commandToPlugin) {
            const A = route.split('/')
            for (let idx = 1; idx < A.length; idx++) {
                const cmd = `/${A.slice(idx).join('/')}`
                if (!disambiguator[cmd]) {
                    // this is, so far, an unambiguous resolution
                    disambiguator[cmd] = route
                    commandToPlugin[cmd] = commandToPlugin[route]
                } else {
                    // a conflict. is it a subtree-synonym conflcit? if so ignore the conflict
                    const subtree = route.substring(0, route.lastIndexOf('/'))
                    if (!isSubtreeSynonym[subtree]) {
                        if (disambiguator[cmd] === cmd) {
                            // rule in favor of what we ahve
                        } else if (route === cmd) {
                            // rule in favor of the new one
                            disambiguator[cmd] = route
                            commandToPlugin[cmd] = commandToPlugin[route]
                        } else {
                            // collision, remove the previous disambiguator
                            disambiguator[cmd] = true
                            delete commandToPlugin[cmd]
                        }
                    }
                }
            }
        }

        return { commandToPlugin, topological, flat, overrides, usage, disambiguator: commandTree.endScan(state) }
    })
}

/**
 * Assemble the plugins for faster loading
 *
 */
exports.assemble = opts => exports.scan(Object.assign({ quiet: true, assembly: true }, opts))

/** export the prequire function */
exports.require = (route, options) => {
    debug('prequire %s', route)

    if (!registrar.hasOwnProperty(route)) {
        const module = prescan.flat.find(_ => _.route === route)
        if (module) {
            const location = path.join(__dirname, '..', '..', 'plugins', module.path)
            // console.log(`Loading ${route}`)
            registrar[route] = require(location)(commandTree.proxy(route), exports.require,
                                                 Object.assign({ usage: prescan.usage, docs: prescan.docs }, options))
            debug('prequire success %s', route)
        }
    }
    return registrar[route]
}

/** print to the javascript console the registered plugins */
exports.debug = () => console.log('Installed plugins', registrar)
