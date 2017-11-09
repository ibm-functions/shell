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
 * The command tree module
 *
 */
const util = require('util'),
      root = () => undefined,      // this will trigger a re-parse using Context.current as the path prefix
      interior = () => undefined,   // this will trigger a re-parse using Context.current as the path prefix
      newTree = () => ({ $: root(), key: '/', route: '/', children: {}}),
      model = newTree(),    // this is the model of registered listeners, a tree
      intentions = newTree(),    // this is the model of registered intentional listeners
      disambiguator = {}    // map from command name to disambiguations

/** shallow array equality */
const sameArray = (A, B) => A.length === B.length && A.every((element, idx) => element === B[idx])

const messages = {
    noSuchContext: 'No such context'
}

/**
 * Plugin registry
 *
 */
let resolver
exports.setPluginResolver = _ => resolver = _

/** module for change directory; TODO move this to a plugin */
const CDHelpers = {
    /** interpret any . or .. in the path array */
    stripDots: A => {
        for (let idx = 0; idx < A.length; idx++) {
            if (A[idx] === '.') {
                // delete single dots, as they refer to this directory
                A[idx] = undefined
                idx++
            } else if (A[idx] === '..') {
                // squash
                for (let ii = idx - 1; ii >= 0; ii--) {
                    if (A[ii]) {
                        A[ii] = undefined
                        break
                    }
                }
                A[idx] = undefined
            }
        }
        return A.filter(x=>x)
    },

    /** cd given an absolute path (as array) A */
    cdAbsolute: (AwithDots, noRetry=false) => {
        const A = CDHelpers.stripDots(AwithDots),
              route = `/${A.join('/')}`,
              m = match(A, true)           // make sure the context exists

        if (!m || !m.children || (m.route !== route && !m.children[A[A.length - 1]])) {
            // maybe we need to load a plugin?
            if (!noRetry) {
                resolver.resolve(route, { subtree: true })
                return CDHelpers.cdAbsolute(AwithDots, true)
            } else {
                // then the desiredContext does not exist; the caller will handle error reporting
                return false
            }
        } else {
            // if the user expressed a synonym, use the main name
            if (m.options && m.options.synonymFor) {
                return exports.changeContext(m.options.synonymFor.route)()
            } else {
                return exports.changeContext(route)()
            }
        }
    },

    /** this is the repl command impl */
    cd: (_1,_2, fullArgv, _4, _5, _6, argv) => { // argv is fullArgv with --options removed
        const desiredContext = argv[argv.indexOf('cd') + 1] || `/${Context.HOME_DIR}`
        const A = desiredContext.split('/').filter(x => x) // remove empty strings

        // is the desiredContext specified as an absolute path, or as a relative path?
        if (desiredContext.charAt(0) !== '/') {
            // then this is a relative path; make it absolute, then use cdAbsolute
            A.splice(0, 0, ...Context.current)
        }

        return CDHelpers.cdAbsolute(A) || ui.oops(_1, _2)({ error: `${messages.noSuchContext}: ${desiredContext}` })
    }
} /* CDHelpers */


/** these routines deal with pushing and popping context, and responding to the REPL module */
const Context = {
    // the current implicit context in the model
    current: ['wsk', 'actions'],

    // tell the world that we're switching context
    contextChangeEvent: (ctx, selection, response) => {
        const newContextString = ctx || Context.current.join('/') || '/'
        return {
            context: newContextString,
            selection: selection,
            message: response || `Switching context to ${newContextString}`
        }
    },

    set: context => {
        if (!sameArray(Context.current, context)) {
            Context.current = context
            return Context.contextChangeEvent()
        }
    },

    /**
     * Pop the implicit context
     *   e.g. /wsk/action -> /wsk
     *
     */
    pop: () => {
        if (Context.current.length >= 1) {
            Context.current.pop()
            return Context.contextChangeEvent()
        } else {
            // we're at the top of the stack
            return true
        }
    },

    /** change context using a cd-style command */
    cd: CDHelpers.cd

} /* end of Context */
Context.HOME_DIR = Context.current.join('/')
exports.currentContext = () => `/${Context.current.join('/')}`
exports.popContext = Context.pop
exports.changeContext = (ctx, _selection) => response => {
    const previous = `/${Context.current.join('/')}`,
          selection = _selection || (_selection !== false && ui.currentSelection()) // false means we really want no selection

    // async notification of context change
    setTimeout(() => eventBus.emit('/context/change', {
        ctx: ctx,
        selection: selection,
        previous: previous
    }), 0)

    // tell the repl about the context change as the return value of the command
    Context.current = ctx.split('/').slice(1).filter(x=>x)
    return Context.contextChangeEvent(ctx, selection, response)
}
exports.cdToHome = exports.changeContext(`/${Context.HOME_DIR}`)
exports.clearSelection = response => {
    ui.clearSelection()
    return exports.changeContext(exports.currentContext(), false)(response) // false means no selection please!
}

/**
 * Navigate the given tree model, following the given path as [n1,n2,n3]
 *
 */
const treeMatch = (model, path, readonly, hide, idxStart = 0, noWildcard) => {
    let parent = model, cur

    // console.log('match', 0, path[0], cur, struct)
    for (let idx = idxStart; idx < path.length; idx++) {
        cur = parent.children && parent.children[path[idx]]

        if (!cur) {
            if (readonly) {
                break;
            } else {
                //console.log('create',path[idx])
                if (!parent.children) {
                    parent.children = {}
                }
                cur = parent.children[path[idx]] = { $: interior(path, 0, idx),
                                                     parent: parent,
                                                     key: path[idx],
                                                     options: { hide: hide },
                                                     route: `${parent.route === '/' ? '' : parent.route}/${path[idx]}`
                                                   }
            }
        } else {
            // console.log('found', path[idx])
        }

        parent = cur
        cur = cur.children && cur.children[path[idx]]
        // console.log('match', idx, path[idx], cur)
    }

    if (!cur && !noWildcard) {
        // prefix match, e.g. "cleanAll !!!" should match a /cleanAll listener, as we have an implicit suffix wildcard
        // console.log('end of the line', parent)
        cur = parent
    }

    return cur
}
const match = (path, readonly) => {
    return treeMatch(model, path, readonly)
}

exports.subtree = (route, options) => {
    const path = route.split('/').splice(1)
    const leaf = match(path, false, options)

    if (leaf) {
        leaf.route = route

        if (options) {
            leaf.options = options
        }

        return leaf
    }
}
exports.subtreeSynonym = (route, master) => {
    if (route !== master.route) {
        // don't alias to yourself!
        const subtree = exports.subtree(route, { synonymFor: master })

        // reverse mapping from master to synonym
        if (!master.synonyms) master.synonyms = {}
        master.synonyms[subtree.route] = subtree
    }
}

/**
 * Register a command handler on all routes that don't yet have such a handler
 *
 */
exports.catchAll = (command, handler, options) => {
    console.error('Unsupported use of catchAll')
}

/**
 * Register a command handler on the given route
 *
 */
const _listen = (model, route, handler, options={}) => {
    const path = route.split('/').splice(1)
    const leaf = treeMatch(model, path, false, options.hide)

    if (leaf) {
        if (options) {
            leaf.options = options
        }

        if (leaf.$) {
            // then we're overriding an existing command
            if (!leaf.options) leaf.options = {}
            leaf.options.override = leaf.$
        }

        leaf.$ = handler
        leaf.route = route

        // update the disambiguator map
        if (!(options && options.synonymFor)                                               // leaf is NOT a synonym
            && !(leaf.parent && leaf.parent.options && leaf.parent.options.synonymFor)) {  // tree is NOT a synonym
            let resolutions = disambiguator[leaf.key]
            if (!resolutions) {
                resolutions = disambiguator[leaf.key] = []
            }

            if (!resolutions.find(resolution => resolution.route === leaf.route)) {
                resolutions.push(leaf)
            }
        }

        return leaf
    }
}
exports.listen = (route, handler, options) => _listen(model, route, handler, options)

/**
 * Register a command handler on the given route, as a synonym of the given master handler
 *    master is the return value of `listen`
 *
 */
exports.synonym = (route, handler, master) => {
    if (route !== master.route) {
        // don't alias to yourself!
        const node = exports.listen(route, handler, { synonymFor: master })

        // reverse mapping from master to synonym
        if (!master.synonyms)  master.synonyms = {}
        master.synonyms[node.route] = node
    }
}

/**
 * Register an intentional action
 *
 */
exports.intention = (route, handler, options) => _listen(intentions, route, handler, Object.assign({}, options, { isIntention: true }))

const withEvents = (evaluator, leaf) => {
    // let the world know we have resolved a command, and are about to evaluate it
    const event = {
        context: exports.currentContext(),
        // ANONYMIZE: namespace: namespace.current()
    }

    // if we have a command tree node, add some extra fields to the event
    if (leaf) {
        event.route = leaf.route                          // e.g. /wsk/actions/update
        event.plugin = leaf.options.plugin || 'builtin'   // e.g. /ui/commands/openwhisk-core

        if (leaf.options.isIntention) {
            // e.g. leaf represents |save to cloudant|
            event.isIntention = true
        }
    }
    
    return {
        route: leaf.route,
        eval: evaluator,
        options: leaf && leaf.options,
        success: ({type:execType, parsedOptions}) => {
            // execType is e.g. "top-level", meaning the user hit enter in the CLI,
            //               or "click-handler", meaning that the user clicked on a UI element
            //               or "nested", meaning that some evaluator uses the repl in its internal implementation
            event.execType = execType

            // any command line options that the command has blessed to pass through to the event bus
            if (parsedOptions && leaf.options && leaf.options.okOptions) {
                const opts = leaf.options.okOptions.filter(_ => parsedOptions[_])
                if (opts) {
                    event.options = opts
                }
            }

            if (leaf) eventBus.emit('/command/resolved', event)
        },
        error: err => {
            event.error = ui.oopsMessage(err)
            if (leaf) eventBus.emit('/command/resolved', event)
        }
    }
}

/**
 * Parse the given argv, and return an evaluator or throw an Error
 *
 */
const _read = (model, argv, contextRetry, originalArgv) => {
    let leaf = treeMatch(model, argv, true) // true means read-only, don't modify the context model please
    // console.log('command-tree::read', argv, contextRetry, leaf)

    const evaluator = leaf && leaf.$
    if (!evaluator) {
        resolver.resolve(`/${argv.join('/')}`)
        leaf = treeMatch(model, argv, true) // true means read-only, don't modify the context model please
    }

    if (!evaluator) {
        if (!contextRetry) {
            return false
        } else if (contextRetry.length === 0) {
            return _read(model, originalArgv, undefined, originalArgv)
        } else if (contextRetry.length > 0 && contextRetry[contextRetry.length - 1] !== originalArgv[originalArgv.length - 1]) {
            // command not found so far, look further afield.
            const maybeInContextRetry = _read(model, /*contextRetry.length === 1 ? originalArgv :*/ contextRetry.concat(originalArgv), contextRetry.slice(0, contextRetry.length - 1), originalArgv)

            if (maybeInContextRetry) {
                return maybeInContextRetry
            }

            // oof, fallback plan: look in /wsk/action
            const newContext = ['wsk','action'].concat(originalArgv).filter((elt,idx,A) => elt!==A[idx-1])
            const maybeInWskAction = _read(model, newContext, contextRetry.slice(0, contextRetry.length - 1), originalArgv)
            return maybeInWskAction

        } else {
            // if we get here, we can't find a matching command
            return false
        }
    } else {
        return withEvents(evaluator, leaf)
    }
}
/** read, with retries based on the current context */
const read = (model, argv) => {
    return _read(model, Context.current.concat(argv), Context.current.slice(0, Context.current.length - 1), argv)
}
const disambiguate = argv => {
    const resolutions = (disambiguator[argv[0]] || []).filter(isFileFilter)
    if (resolutions.length === 1) {
        const leaf = resolutions[0]
        return withEvents(leaf.$, leaf)
    }
}
const commandNotFoundMessage = 'Command not found'
const commandNotFound = argv => {
    eventBus.emit('/command/resolved', {
        // ANONYMIZE: namespace: namespace.current(),
        error: commandNotFoundMessage,
        command: argv[0],
        context: exports.currentContext()
    })

    throw Error(commandNotFoundMessage)
}

/** here, we will use implicit context resolutions */
exports.read = (argv, noRetry=false) => {
    let cmd = read(model, argv)

    if (cmd && resolver.isOverridden(cmd.route) && !noRetry) {
        resolver.resolve(cmd.route)
        return exports.read(argv, true)
    }
        
    if (!cmd) {
        if (!noRetry) {
            resolver.resolve(`/${argv.join('/')}`)
            return exports.read(argv, true)
        }
    }

    if (!cmd) {
        cmd = disambiguate(argv) || exports.readIntention(argv)
    }

    if (!cmd) {
        return commandNotFound(argv)
    } else {
        return cmd
    }
}
/** here, we don't use any implicit context resolutions */
exports.readIntention = (argv, noRetry=false) => {
    const cmd = _read(intentions, argv, undefined, argv)

    if (!cmd) {
        if (!noRetry) {
            resolver.resolve(`/${argv.join('/')}`)
            return exports.readIntention(argv, true)
        }
    }

    if (!cmd) {
        return disambiguate(argv) || commandNotFound(argv)
    } else {
        return cmd
    }
}

const filter = (M, includeFn) => {
    const filtered = []
    for (let key in M) {
        if (includeFn(M[key])) {
            filtered.push(M[key])
        }
    }
    //console.log('xxxxxxxx',M, filtered)
    return filtered
}

/** command filters */
const isAnAlias = command => command.options && command.options.synonymFor
const isDirFilter = command => command.children && !isAnAlias(command)
const isFileFilter = command => command.$ && !isAnAlias(command)

class CommandModel {
    currentPrefix() { return Context.current }
    currentRoutePrefix() { return `/${Context.current.join('/')}` }
    fullTree() { return model }
    subTree() { return match(Context.current, true) }
    match(path) { return match(path, true) }

    everythingInCurrentContext() {
        return filter(this.subTree().children, command => !isAnAlias(command))
    }
    
    /** all "subdirectories", i.e. subtrees with further commands, in the current context */
    directoriesInCurrentContext() {
        // we exclude synonyms from the list
        return filter(this.subTree().children, isDirFilter)
    }

    /** all "commands", i.e. direct commands not subtrees, in the current context */
    commandsInCurrentContext() {
        // we exclude synonyms from the list
        return filter(this.subTree().children, isFileFilter)
    }
}
/**
 * Returns the command tree model
 *
 */
exports.getModel = () => new CommandModel()

/**
 * Call the given callback function `fn` for each node in the command tree
 *
 */
const forEachNode = fn => {
    const iter = root => {
        if (root) {
            fn(root)
            if (root.children) {
                for (let cmd in root.children) {
                    iter(root.children[cmd])
                }
            }
        }
    }
    iter(model)
}

/**
 * Print the command tree to the browser console
 *   mostly helpful for debugging
 *
 */
exports.debug = () => console.log('Command Tree', model, disambiguator, intentions)

/**
 * To help with remembering from which plugin calls to listen emanate
 *
 */
exports.proxy = plugin => ({
    listen: (route, handler, options) => exports.listen(route, handler, Object.assign({}, options, { plugin: plugin })),
    intention: (route, handler, options) => exports.intention(route, handler, Object.assign({}, options, { plugin: plugin })),
    synonym: exports.synonym,
    subtree: exports.subtree,
    subtreeSynonym: exports.subtreeSynonym,
    getModel: exports.getModel,
    catchAll: exports.catchAll,
    changeContext: exports.changeContext,
    currentContext: exports.currentContext,
    cdToHome: exports.cdToHome,
    clearSelection: exports.clearSelection,
    commandNotFoundMessage: commandNotFoundMessage,
    find: route => {
        const cmd = match(route.split('/').slice(1), true)
        if (!cmd || cmd.route !== route || (resolver && resolver.isOverridden(cmd.route))) {
            if (resolver) {
                resolver.resolve(route)
            }
            return match(route.split('/').slice(1), true)
        } else {
            return cmd
        }
    }
})

/**
 * Install command listeners
 *
 */
exports.listen('/cd', Context.cd, { docs: 'Change the current command context' })
exports.listen('/context', () => exports.currentContext(), { hide: true })

