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

const debug = require('debug')('openwhisk-core')
debug('starting')

/**
 * This plugin adds commands for the core OpenWhisk API.
 *
 */

const propertiesParser = require('properties-parser'),
      expandHomeDir = require('expand-home-dir'),
      openwhisk = require('openwhisk'),
      minimist = require('minimist'),
      fs = require('fs'),
      path = require('path'),
      util = require('util'),
      history = plugins.require('/ui/commands/history'),
      isLinux = require('os').type() === 'Linux'

debug('modules loaded')

let wskprops
try {
    wskprops = propertiesParser.read(process.env['WSK_CONFIG_FILE'] || expandHomeDir('~/.wskprops'))
} catch (e) {
    if (e.code === 'ENOENT') {
        console.error('Could not find wskprops')
        wskprops = {}
    } else {
        console.error(e)
    }
}

debug('wskprops loaded')

//
// Usage strings. TODO externalize
//
usage = {
    bind: 'Usage: bind <packageName> <bindName> [-p key value]...'
}

//
// docs stuff
//
const swagger = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../docs/apiv1swagger.json'))),
      verbToPath= { // any odd mappings; if it's 1-1, don't bother enumerating here
          list: type => `/namespaces/{namespace}/${type}`
      },
      verbToMethod = { // any odd verb-to-method mappings; if it's 1-1, don't bother enumerating here; e.g. get->get, delete->delete
          list: 'get',
          create: 'put',
          update: 'put',
          invoke: 'post',
          enable: 'post',
          disable: 'post',
          fire: 'post'
      },

      docsKey = (type, verb) => verbToPath[verb] ? verbToPath[verb](type) : `/namespaces/{namespace}/${type}/{${toOpenWhiskKind(type)}Name}`,
      apiDocs = (type, verb) => swagger.paths[docsKey(type, verb)] || {},
      docs = (type, verb) => {
          if (type === 'package' || type === 'packages' && verb === 'bind') {
              // oof, hack for now for package bind, as it doesn't have its own swagger entry
              return 'Create a new package binding'
          } else {
              return apiDocs(type, verb)[verbToMethod[verb] || verb]
          }
      }

// verbs where implicit name hurts; e.g. list with name will filter by name!
const noImplicitName = {
    list: true
}

// these values may change, if the user elects to do so
let localStorageKey = 'wsk.apihost',
    localStorageKeyIgnoreCerts = 'wsk.apihost.ignoreCerts',
    apiHost = process.env.__OW_API_HOST || wskprops.APIHOST || localStorage.getItem(localStorageKey) || 'https://openwhisk.ng.bluemix.net',
    auth = process.env.__OW_API_KEY || wskprops.AUTH,
    ow

let userRequestedIgnoreCerts = localStorage.getItem(localStorageKeyIgnoreCerts) !== undefined
let ignoreCerts = apiHost => userRequestedIgnoreCerts || apiHost.indexOf('localhost') >= 0 || apiHost.startsWith('192.') || apiHost.startsWith('172.') || process.env.IGNORE_CERTS || wskprops.INSECURE_SSL

/** these are the module's exported functions */
let self = {}

debug('initOW')
const initOW = () => {
    ow = self.ow = openwhisk({
        apihost: apiHost,
        api_key: auth,
        ignore_certs: ignoreCerts(apiHost)
    })
}
if (apiHost && auth) initOW()
debug('initOW done')

/** is a given entity type CRUDable? i.e. does it have get and update operations, and parameters and annotations properties? */
const isCRUDable = {
    actions: true,
    packages: true,
    rules: true,
    triggers: true
}
const crudableTypes = [] // array form of isCRUDable
for (let type in isCRUDable) crudableTypes.push(type)

// some verbs not directly exposed by the openwhisk npm (hidden in super-prototypes)
const alreadyHaveGet = { /*packages: true,*/ namespaces: true, activations: true }
const extraVerbsForAllTypes = type => alreadyHaveGet[type] ? [] : ['get']
const extraVerbsForAllCRUDableTypes = ['delete', 'update']
const extraVerbs = type => extraVerbsForAllTypes(type).concat(isCRUDable[type] ? extraVerbsForAllCRUDableTypes : [])

/** given /a/b/c, return /a/b */
const parseNamespace = fqn => fqn.substring(0, fqn.lastIndexOf('/'))
const parseName = fqn => fqn.substring(fqn.lastIndexOf('/') + 1)

const synonyms = {
    entities: {
        actions: ['a', '@', 'action'],
        packages: ['p', 'package'],
        rules: ['r', 'rule'],
        triggers: ['t', 'trigger'],
        namespaces: ['namespace', 'ns'],
        activations: ['$', 'activation']
    },
    verbs: {
        invoke: ['i', 'call', 'exec'],
        fire: ['f'],
        get: ['g', 'cat', 'show', 'open'],
        list: ['l', 'ls'],
        delete: ['d' ],
        create: ['c',
                 // these are synonyms from the openwhisk npm standpoint, but not from the openwhisk command experience standpoint
                 { nickname: 'update', name: 'update', notSynonym: true},
                 { nickname: 'bind', name: 'bind', notSynonym: true, limitTo: {packages:true} }
                ],
        update: ['up']
    }
}
const synonymsFn = (type,T) => synonyms[T || 'entities'][type].concat([type]) // T === entities, or T === verbs

const booleans = {
    actions: {
        create: ['sequence', 'copy', 'docker', 'web']
    }
}
booleans.actions.update = booleans.actions.create

const aliases = {
    create: {
        m: 'memory',
        t: 'timeout',
        p: 'param',
        a: 'annotation',
        f: 'feed'
    },
    invoke: {
        b: 'blocking',
        r: 'result',
        p: 'param'
    },
    list: {
        l: 'limit',
        s: 'skip'
    }
}

/** turn a key-value map into an array of {key:, value:} objects */
const toArray = map => {
    const A = []
    for (var key in map) {
        A.push({ key: key, value: map[key] })
    }
    return A
}

/** update the parameter mapping M.params with the mapping stored in a given file */
const paramFile = (M, idx, argv, type) => {
    if (!M[type]) M[type] = {}
    if (!M[type].parameters) {
        M[type].parameters = []
    }

    const file = argv[++idx]
    const params = JSON.parse(require('fs').readFileSync(expandHomeDir(file)).toString())
    M[type].parameters = M[type].parameters.concat(toArray(params))

    return idx
}

const isBinary = {
    svg: true, // not JSON friendly
    xml: true, // not JSON friendly
    png: true,
    jpg: true,
    jpeg: true,
    tiff: true,
    pdf: true,
    zip: true,
    gz: true,
    bz2: true,
    aiff: true,
    wav: true,
    ogg: true,
    mov: true,
    mp4: true
}

const handleKeyValuePairAsArray = key => (M, idx, argv, type) => {
    if (!argv[idx + 1] || !argv[idx + 2]) {
        return idx + 1
    }

    if (!M[type]) M[type] = {}
    if (!M[type][key]) {
        M[type][key] = []
    }

    if (argv[idx + 1].charAt(0) === '-') {
        try {
            // it might be a negative number...
            JSON.parse(argv[idx + 1])
        } catch (e) {
            throw new Error(`Parse error: expected string, got an option ${argv[idx + 1]}`)
            return idx + 1
        }
    }
    if (argv[idx + 2].charAt(0) === '-') {
        try {
            // it might be a negative number...
            JSON.parse(argv[idx + 2])
        } catch (e) {
            throw Error(`Parse error: expected string, got an option ${argv[idx + 2]}`)
            return idx + 1
        }
    }

    const paramName = argv[++idx]
    let paramValue = argv[++idx]
    let startQuote
    if (paramValue.startsWith('"')) {
        startQuote = '"'
    } else if (paramValue.startsWith("'")) {
        startQuote = "'"
    }
    if (startQuote) {
        while (!argv[idx].endsWith(startQuote)) {
            paramValue = `${paramValue} ${argv[++idx]}`
        }
        paramValue = paramValue.replace(new RegExp(startQuote, 'g'), '')
    }

    if (paramValue.charAt(0) === '@') {
        // this is an @file form of parameter. read in the file
        // !!!!!!! FIXME cap the size of the file to avoid bombing out
        const location = expandHomeDir(paramValue.substring(1))
        if (!fs.existsSync(location)) {
            throw new Error(`Requested parameter @file does not exist: ${location}`)
        } else {
            const extension = location.substring(location.lastIndexOf('.') + 1),
                  encoding = isBinary[extension] ? 'base64' : 'utf8'

            paramValue = fs.readFileSync(location).toString(encoding)
        }
    }        

    // see if the value is JSON
    try {
        paramValue = JSON.parse(paramValue)
    } catch (e) {
        //console.error('NOT JSON', paramValue, typeof paramValue, argv)
        //console.error(e)
    }

    M[type][key].push({
        key: paramName,
        value: paramValue
    })

    return idx + 1
}
const param = handleKeyValuePairAsArray('parameters')
const annotation = handleKeyValuePairAsArray('annotations')
function isNumeric(input) {
    // a rough approximation
    return (input - 0) == input && (''+input).trim().length > 0;
}
const limits = key => (M, idx, argv, type) => {
    if (!M[type]) M[type] = {}
    if (!M[type].limits) M[type].limits = {}

    const valueString = argv[idx + 1]
    let value = parseInt(valueString)

    // check that the value is a valid integer
    if (!isNumeric(valueString)) {
        if (key === 'timeout' && valueString && (valueString.endsWith('s') || valueString.endsWith('m'))) {
            value = require('parse-duration')(valueString)
        } else {
            throw new Error(`Invalid ${key} limit: expected integer, but got ${valueString === undefined ? 'nothing' : valueString}.`)
        }
    }

    M[type].limits[key] = value
    return idx + 2
}
const keyValueParams = {
    '-p': param,
    '--param': param,
    '--param-file': paramFile,
    '-P': paramFile,
    '-a': annotation,
    '--annotation': annotation,
    '-m': limits('memory'),
    '--memory': limits('memory'),
    '-l': limits('logs'),
    '--log': limits('logs'),
    '--logs': limits('logs'),
    '--logsize': limits('logs'),
    '-t': limits('timeout'),
    '--timeout': limits('timeout')
}
const extractKeyValuePairs = (argv, type) => {
    const options = {}
    for (let idx = 0; idx < argv.length; ) {
        const handler = keyValueParams[argv[idx]]
        if (handler) {
            const idx_before = idx
            idx = handler(options, idx, argv, type) || (idx_before + 1)
            for (let i = idx_before; i < idx; i++) {
                argv[i] = undefined
            }
        } else {
            idx++
        }
    }
    return options
}

/** ignore these methods from the openwhisk npm */
const ignore = {
    constructor: true,
    activation: true,
    get_activation: true,
    action_body: true,
    rule_body: true,
    qs: true,
    invoke_options: true,
    invoke_params: true,
    convert_to_fqn: true,

    packages: {
        invoke: true // the openwhisk npm has package.invoke, which just throws an error. oof
    },
    rules: {
        invoke: true // the openwhisk npm has package.invoke, which just throws an error. oof
    }
}

/**
 * if i do `wsk action get binding/action`, i get back an action
 * struct that has the expected binding parameters from the `binding`
 * package, but the `name` and `namespace` field, and indeed the
 * entire returned struct, are devoid of any mention of the
 * binding. so, in the Shell, when i ask to `invoke` this action, the
 * Shell incorrectly invokes the non-bound package, thus the binding
 * parameters are missing from the invoke
 *
 */
const correctMissingBindingName = options => entity => {
    let packageName

    if (options.namespace) {
        // 
        const slashIndex = options.namespace.indexOf('/')
        if (slashIndex >= 0) {
            packageName = options.namespace.substring(slashIndex + 1)
        }
    }

    if (!packageName) {
        if (options.name) {
            const A = options.name.split('/')
            if (A.length > 1) {
                packageName = A.length === 4 ? A[2] : A[0]
            }
        }
    }

    if (packageName) {
        if (entity.namespace) {
            entity.namespace = entity.namespace.replace(new RegExp(`/${entity.packageName}$`), `/${packageName}`)
        }
        entity.packageName = packageName
    }

    return entity
}

const addPrettyType = (entityType, verb, entityName) => entity => {
    if (typeof entity === 'string') {
        return {
            type: entityType,
            verb: verb,
            name: entity,
            onclick: false
        }
    } else if (verb === 'invoke' || verb === 'fire') {
        entity.type = 'activations'
        entity.entity = { name: entityName }
    } else {
        if (!entity.type) {
            entity.type = entityType
        }
        if (entity.exec && entity.exec.kind === 'sequence'
            || entity.annotations && entity.annotations.find(kv => kv.key === 'exec' && kv.value === 'sequence')) {
            entity.prettyType = 'sequence'
        }

        if (entity.annotations
            && entity.annotations.find(kv => kv.key === 'kind' && kv.value === 'sequence')) {
            // sequence activations
            entity.prettyType = 'sequence'
        }

        if (entity.binding === true || entity.binding && entity.binding.name) {
            entity.prettyType = 'binding'
        }

        // add package attribute
        if (entity.namespace) {
            const slashIndex = entity.namespace.indexOf('/')
            if (slashIndex >= 0) {
                entity.packageName = entity.namespace.substring(slashIndex + 1)
            }
        }

        // add verb
        entity.verb = verb

        // add apihost
        entity.apiHost = apiHost
    }

    if (specials[entityType] && specials[entityType][verb]) {
        try {
            const res = specials[entityType][verb]()
            entity.modes = res && res.modes && res.modes(entity)
        } catch (e) {
            console.error(e)
        }
    }

    return entity
}

const extensionToKind = {
    'js': 'nodejs:default',
    'py': 'python:default',
    'swift': 'swift:default'
}

/** return the fully qualified form of the given entity name */
const fqn = name => {
    const A = name.split('/')
    if (A.length < 3) {
        // just the action name (length === 1) or just the packag/eaction (length === 2)
        return `/_/${name}`
    } else {
        return name
    }
}

const specials = {}

/** for parametrizable entity types, e.g. actions, packages, the standard view modes */
const standardViewModes = (defaultMode, fn) => {
    let modes = [{ mode: 'parameters', label: 'params', command: () => 'parameters' },
                 { mode: 'annotations', command: () => 'annotations' },
                 { mode: 'raw', command: () => 'raw' }]

    if (defaultMode) {
        if (!util.isArray(defaultMode)) {
            if (!modes.find(_ => _.mode === defaultMode)) {
                // only add the defaultMode if it isn't already in the list
                const mode = defaultMode.mode || defaultMode
                modes.splice(0, 0,  { mode, defaultMode: typeof mode === 'string' || mode.default, command: () => mode })
            }
        } else {
            modes = defaultMode.concat(modes)
        }
    }

    if (fn) {
        return (options, argv, verb) => Object.assign(fn(options, argv, verb) || {}, { modes: entity => modes })
    } else {
        return (options, argv) => ({ modes: entity => modes })
    }
}

const actionSpecificModes = [{ mode: 'code', defaultMode: true }, { mode: 'limits' }]
specials.actions = {
    get: standardViewModes(actionSpecificModes),
    create: standardViewModes(actionSpecificModes, (options, argv, verb) => {
        if (!options) return

        if (!options.action) options.action = {}
        if (!options.action.exec) options.action.exec = {}

        if (options.web) {
            if (!options.action.annotations) options.action.annotations = []
            options.action.annotations.push({ key: 'web-export', value: true })

            if (options['content-type']) {
                options.action.annotations.push({ key: 'content-type-extension', value: options['content-type'] })
            }
        }


        if (options.sequence) {
            options.action.exec = {
                kind: 'sequence',
                components: argv[0].split(/,\s*/).map(fqn) // split by commas, and we need fully qualified names
            }

        } else if (options.copy) {
            // copying an action
            return {
                options: ow.actions.get(owOpts({ name: argv[0] }))
                    .then(action => {
                        if (options.action.parameters && !action.parameters) {
                            action.parameters = options.action.parameters
                        } else if (options.action.parameters) {
                            action.parameters = action.parameters.concat(options.action.parameters)
                        }
                        if (options.action.annotations && !action.annotations) {
                            action.annotations = options.action.annotations
                        } else if (options.action.annotations) {
                            action.annotations = action.annotations.concat(options.action.annotations)
                        }
                        return {
                            name: options.name,
                            action: action
                        }
                    })
            }

        } else if (verb !== 'update' || argv[0]) {
            // for action create, or update and the user gave a
            // positional param... find the input file
            const filepath = ui.findFile(expandHomeDir(argv[0])),
                  isBinary = argv[0].endsWith('.zip'),
                  encoding = isBinary ? 'base64' : 'utf8'

            options.action.exec.code = fs.readFileSync(filepath).toString(encoding)

            if (!options.action.annotations) options.action.annotations = []
            options.action.annotations.push({ key: 'file', value: filepath })

            if (isBinary) {
                // add an annotation to indicate that this is a managed action
                options.action.annotations.push({ key: 'wskng.combinators', value: [{
                    type: 'action.kind',
                    role: 'replacement',
                    badge: 'zip'
                }]})

                options.action.annotations.push({ key: 'binary', value: true })
            }

            eventBus.emit('/action/update', { file: filepath, action: { name: options.name, namespace: options.namespace } })

            // set the default kind
            if (!options.action.exec.kind) {
                if (options.kind) {
                    options.action.exec.kind = options.kind
                } else {
                    const extension = filepath.substring(filepath.lastIndexOf('.') + 1)
                    if (extension) {
                        options.action.exec.kind = extensionToKind[extension] || extension
                    }
                }
            }
        } else {
            // then we must remove options.exec; the backend fails if an empty struct is passed
            delete options.action.exec
        }
    }),
    invoke: (options, argv) => {
        if (options && options.action && options.action.parameters) {
            options.params = options.action && options.action.parameters && options.action.parameters.reduce((M, kv) => {
                M[kv.key] = kv.value
                return M
            }, {})
        }
    }
}
const activationModes = (opts={}) => Object.assign(opts, {
    modes: entity => [ { mode: 'result', defaultMode: true, command: () => 'wsk activation result' }, //activation => ui.showEntity(entity, { show: 'result' }) }
                       { mode: 'logs', label: entity.prettyType == 'sequence' ? 'trace' : 'logs',
                         command: () => 'wsk activation logs' },
                       { mode: 'annotations', command: () => 'annotations' },
                       { mode: 'raw', command: () => 'raw' }
                     ]
})

specials.activations = {
    // activations list always gets full docs, and has a default limit of 10, but can be overridden
    list: (options, argv) => activationModes({ options: Object.assign({}, { limit: 10 }, options, { docs: false }) }),
    get: (options, argv) => activationModes()
}
specials.packages = {
    list: (options, argv) => {
        options.namespace = options.name
    },
    get: standardViewModes('content'),
    create: standardViewModes('content'),
    update: standardViewModes('content'),
    bind: (options, argv) => {
        // the binding syntax is a bit peculiar...
        const parentPackage = options.name
        const bindingName = argv[0]
        if (!parentPackage || !bindingName) {
            throw new Error(usage.bind)
        }
        if (!namespace.current()) {
            throw new Error('namespace uninitialized')
        }
        options.name = bindingName
        if (!options.package) options.package = {}
        options.package.binding = { namespace: (parseNamespace(parentPackage) || namespace.current()).replace(/^\//, ''),
                                    name: parseName(parentPackage) }

        debug('package bind', options.package.binding)

        return {
            verb: 'update' // package bind becomes package update. nice
        }
    }
}
specials.rules = {
    create: (options, argv) => {
        if (argv) {
            options.trigger = argv[0]
            options.action = argv[1]
        }

        if (!options.name || !options.trigger || !options.action) {
            throw new Error('Invalid argument(s). A rule, trigger and action name are required.')
        }
    }
}
specials.triggers = {
    get: standardViewModes('parameters'),
    invoke: (options, argv) => {
        if (options && options.trigger && options.trigger.parameters) {
            options.params = options.trigger && options.trigger.parameters && options.trigger.parameters.reduce((M, kv) => {
                M[kv.key] = kv.value
                return M
            }, {})
        }
    },
    create: standardViewModes('parameters', (options, argv) => {
        if (options && options.feed) {
            // the openwhisk npm is a bit bizarre here for feed creation
            const feedName = options.feed
            const triggerName = options.name
            delete options.feed
            delete options.f
            delete options.name

            options.params = options.trigger.parameters.reduce((M, kv) => {
                M[kv.key] = kv.value
                return M
            }, {})

            options.feedName = feedName
            options.trigger = triggerName
            return {
                entity: 'feeds'
            }
        }
    })
}
specials.actions.update = specials.actions.create
specials.rules.update = specials.rules.create
specials.triggers.update = specials.triggers.create

/** actions => action */
const toOpenWhiskKind = type => type.substring(0, type.length - 1)

const parseOptions = (argv_full, type) => {
    const kvOptions = extractKeyValuePairs(argv_full, type),
          argvWithoutKeyValuePairs = argv_full.filter(x => x) // remove nulls
    return {
        kvOptions: kvOptions,
        argv: argvWithoutKeyValuePairs
    }
}

const agent = new (require('https').Agent)({ keepAlive: true, keepAliveMsecs: process.env.RUNNING_SHELL_TEST ? 20000 : 1000 })
const owOpts = (options = {}, execOptions = {}) => {
    if (isLinux) {
	// options.forever = true
	options.timeout = 5000
        options.agent = agent
    }

    if (!process.env.TEST_SPACE && !process.env.TRAVIS) {
        // install a User-Agent header, except when running tests
        options['User-Agent'] = 'IBM Cloud Functions Shell'
    }

    return options
}

/**
 * Execute a given command
 *
 * @param preflight the preflight module, used to validate operations
 *
 */
const executor = (_entity, _verb, verbSynonym, commandTree, preflight) => (block, nextBlock, argv_full, modules, raw, execOptions) => {
    let entity = _entity,
        verb = _verb

    const pair = parseOptions(argv_full, toOpenWhiskKind(entity)),
          regularOptions = minimist(pair.argv, { boolean: booleans[entity] && booleans[entity][verb],
                                                 alias: aliases[verb]
                                               }),
          argv = regularOptions._

    let options = Object.assign({}, regularOptions, pair.kvOptions)
    delete options._

    // console.log('wsk::exec', entity, verb, argv, options)

    const verbIndex = argv.findIndex(arg => arg === verbSynonym),
          nameIndex = verbIndex + 1,
          hasName = argv[nameIndex] !== undefined,   // !== undefined important, as minimist turns all-zeroes into numeric 0 (shell #284)
          restIndex = hasName ? nameIndex + 1 : nameIndex
    if (hasName) {
        options.name = argv[nameIndex]
        if (typeof options.name === 'number') {
            // see https://github.com/ibm-functions/shell/issues/284
            // minimist bug: it auto-converts numeric-looking strings
            // into Numbers! thus all-numeric uuids become javascript
            // Numbers :(

            // the solution is to scan the original (before minimist
            // mucked things up) argv_full, looking for an arg that is
            // ==, but not === the one that minimist gave us.
            // THUS NOTE THE USE OF == in `arg == options.name` <-- important
            options.name = argv_full.find(arg => arg == options.name && arg !== options.name)
        }

    } else if (!noImplicitName[verb]) {
        //
        // OPERATION WITH IMPLICIT ENTITY: try to get the name from the current selection
        //
        const sidecar = document.querySelector('#sidecar')
        if (sidecar && sidecar.entity) {
            options.name = `/${sidecar.entity.namespace || '_'}/${sidecar.entity.name}`

            if (sidecar.entity.type === 'activations') {
                //
                // special case for activations... the proper entity path is an annotation. nice
                //
                const pathAnnotation = sidecar.entity.annotations && sidecar.entity.annotations.find(kv => kv.key === 'path')
                if (pathAnnotation) {
                    // note: the path doesn't have a leading slash. nice nice
                    options.name = `/${pathAnnotation.value}`
                }
            }

            console.log('wsk::exec using implicit entity name', options.name)
        }
    }

    if (specials[entity] && specials[entity][verb]) {
        const res = specials[entity][verb](options, argv.slice(restIndex), verb)
        if (res && res.verb) {
            // updated verb? e.g. 'package bind' => 'package update'
            verb = res.verb
        }
        if (res && res.entity) {
            entity = res.entity
        }
        if (res && res.options) {
            options = res.options
        }
    }
    // process the entity-naming "nominal" argument
    //if (!(syn_options && syn_options.noNominalArgument) && argv_without_options[idx]) {
    //options.name = argv_without_options[idx++]
    //}

    // process any idiosyncratic non-optional arguments
    /*if (syn._options && syn._options.nonOptArgs) {
        const res = syn._options.nonOptArgs(options, idx, argv_without_options, entity)
        if (res.verb) {
            // updated verb? e.g. 'package bind' => 'package update'
            verb = res.verb
        }
    }*/

    if (!options.then) options = Promise.resolve(options)

    return options.then(options => {
    // this will format a prettyType for the given type. e.g. 'sequence' for actions of kind sequence
    const pretty = addPrettyType(entity, verb, options.name)

    console.log(`wsk::calling openwhisk ${entity} ${verb} ${options.name}`, options)

    // amend the history entry with the details
    if (execOptions && execOptions.history) {
        history.update(execOptions.history, entry => {
            entry.entityType = entity
            entry.verb = verb
            entry.name = options.name
            entry.options = Object.assign({}, options)

            if (options.action && options.action.exec) {
                // don't store the code in history!
                entry.options.action = Object.assign({}, options.action)
                entry.options.action.exec = Object.assign({}, options.action.exec)
                delete entry.options.action.exec.code
            }
        })
    }

    if (!ow[entity][verb]) {
        return Promise.reject('Unknown OpenWhisk command')
    } else {
        //if (isLinux && (!execOptions || !execOptions.noRetry) && options.retry !== false) options.timeout = 5000 // linux bug

	owOpts(options, execOptions)

        // programmatic passing of parameters?
        const paramVars = ['params', 'parameters']
        paramVars.forEach(paramVar => {
            if (execOptions && execOptions[paramVar]) {
                let details = options[toOpenWhiskKind(entity)]
                if (!details) {
                    details = {}
                    options[toOpenWhiskKind(entity)] = details
                }
                if (!details[paramVar]) {
                    const params = details[paramVar] = []

                    for (let key in execOptions[paramVar]) {
                        const value = execOptions[paramVar][key]
                        params.push({ key, value })
                    }
                }
            }
        })

        return preflight(verb, options)
            .then(options => ow[entity][verb](options))
            .then(response => {
                // amend the history entry with a selected subset of the response
                if (execOptions && execOptions.history) {
                    history.update(execOptions.history, entry => entry.response = { activationId: response.activationId })
                }
                return response
            })
            .then(pretty)
            .then(correctMissingBindingName(options))
            .then(response => response.map ? response.map(pretty) : response)
            .then(response => {
                if (commandTree
                    && (!execOptions || !execOptions.noHistory || (execOptions && execOptions.contextChangeOK)) // don't update context for nested execs
                    && (response.verb === 'get' || response.verb === 'create' || response.verb === 'update')) {
                    const name = entity === 'activations' ? response.activationId : response.name
                    return commandTree.changeContext(`/wsk/${entity}`, { name: name })(response)
                } else {
                    return response
                }
            })
    }
    })
}

module.exports = (commandTree, prequire) => {
    debug('init')
    const preflight = prequire('/code/validation/preflight').preflight

    // for each entity type
    const apiMaster = commandTree.subtree(`/wsk`, { docs: 'Commands that interact with OpenWhisk' })

    if (!ow) {
        commandTree.listen('/wsk/action/get', () => Promise.resolve(false))
    }
    for (let api in ow) {
        const clazz = ow[api].constructor,
              props = Object.getOwnPropertyNames(clazz.prototype).concat(extraVerbs(api) || [])
        //alsoInstallAtRoot = api === 'actions'

        const apiMaster = commandTree.subtree(`/wsk/${api}`, { docs: `Commands related to ${api}` })

        // find the verbs of this entity type
        for (let idx in props) {
            const verb = props[idx]
            if (!ignore[verb] && (!ignore[api] || !ignore[api][verb])) {
                // install the route handler for the main /entity/verb
                //const handler = executor(api, verb, verb, commandTree)
                //const master = commandTree.listen(`/wsk/${api}/${verb}`, handler, { docs: docs(api, verb) })

                // install synonym route handlers
                const entities = (synonyms.entities[api] || []).concat([api])
                const verbs = synonyms.verbs[verb] || []
                entities.forEach(eee => {
                    commandTree.subtreeSynonym(`/wsk/${eee.nickname || eee}`, apiMaster)

                    const handler = executor(eee.name || api, verb, verb, commandTree, preflight)
                    const entityAliasMaster = commandTree.listen(`/wsk/${eee.nickname || eee}/${verb}`, handler, { docs: docs(api, verb) })

                    verbs.forEach(vvv => {
                        const handler = executor(eee.name || api, vvv.name || verb, vvv.nickname || vvv, commandTree, preflight)
                        if (vvv.notSynonym || vvv === verb) {
                            if (vvv.limitTo && vvv.limitTo[api]) {
                                commandTree.listen(`/wsk/${eee.nickname || eee}/${vvv.nickname || vvv}`, handler, { docs: docs(api, vvv.nickname || vvv) })
                            }
                        } else {
                            commandTree.synonym(`/wsk/${eee.nickname || eee}/${vvv.nickname || vvv}`, handler, entityAliasMaster)
                        }

                        //if (alsoInstallAtRoot) {
                        //commandTree.synonym(`/wsk/${vvv.nickname || vvv}`, handler, master)
                        //}
                    })
                })
            }
        }
    }

    // trigger fire special case?? hacky
    const doFire = executor('triggers', 'invoke', 'fire', commandTree, preflight)
    synonymsFn('triggers').forEach(syn => {
        commandTree.listen(`/wsk/${syn}/fire`, doFire, { doc: 'Fire an OpenWhisk trigger' })
    })

    const removeTrigger = (block, nextBlock, argv, modules) => {
        const name = argv[argv.length - 1]
        return ow.triggers.delete(owOpts({ name: name }))
            .then(trigger => {
                const feedAnnotation = trigger.annotations && trigger.annotations.find(kv => kv.key === 'feed')
                if (feedAnnotation) {
                    // special case of feed
                    console.log('wsk::delete feed', trigger)
                    return ow.feeds.delete(owOpts({ feedName: feedAnnotation.value,
                                                    trigger: name,
                                                  }))
                } else {
                    return trigger
                }
            }).then(() => true)
    }
    synonyms.verbs.delete.forEach(rm => {
        synonyms.entities.triggers.forEach(syn => {
            commandTree.listen(`/wsk/${syn}/${rm}`, removeTrigger, { docs: 'Remove an OpenWhisk trigger' })
        })
    })

    // namespace.current
    synonyms.entities.namespaces.forEach(syn => {
        commandTree.listen(`/wsk/${syn}/current`, () => namespace.current(), { docs: 'Print the currently selected namespace' })
    })

    // exported API
    self = {
        /** given /a/b/c, return /a/b */
        parseNamespace: parseNamespace,
        parseName: parseName,

        /** all terms for the given type */
        synonyms: synonymsFn,

        /** export the activation bottom stripe modes */
        activationModes: entity => {
            entity.modes = activationModes().modes(entity)
            return entity
        },

        /** main terms (not including synonyms) for all crudable types */
        // [].concat(...crudableTypes.map(synonymsFn)), // flatten the result
        crudable: crudableTypes,

        /** export the raw interface */
        ow: ow,
        addPrettyType: addPrettyType,
        parseOptions: parseOptions,

        apiHost: {
            get: () => Promise.resolve(apiHost),
            set: (new_host, { ignoreCerts=false }={}) => {
                const url = require('url').parse(new_host)
                if (!url.protocol) {
                    if (new_host.indexOf('localhost') >= 0 || new_host.indexOf('192.168') >= 0) {
                        new_host = `http://${new_host}`
                    } else {
                        new_host = `https://${new_host}`
                    }
                }
                apiHost = new_host                               // global variable
                userRequestedIgnoreCerts = ignoreCerts
                localStorage.setItem(localStorageKey, new_host)  // remember the choice in localStorage
                localStorage.setItem(localStorageKeyIgnoreCerts, userRequestedIgnoreCerts)
                initOW()                                         // re-initialize the openwhisk npm
                console.log(`wsk::apiHost::set ${apiHost}`)
                return Promise.resolve(new_host)
            }
        },
        namespace: {
            get: () => ow.namespaces.list(owOpts()).then(A => A[0]) // the api returns, as a historical artifact, an array of length 1
        },
        auth: {
            get: () => auth,
            getSubjectId: () => auth.split(/:/)[0] || auth,   // if auth is x:y, return x, otherwise return auth
            set: new_auth => {
                auth = new_auth
                initOW()
                console.log(`wsk::auth::set ${auth}`)
                return Promise.resolve(true)
            }
        },
        fillInActionDetails: (package, type) => actionSummary => Object.assign({}, actionSummary, {
            // given the actionSummary from the 'actions' field of a package entity
            type: type || 'actions',
            packageName: package.name,
            namespace: `${package.namespace}/${package.name}`
        }),

        /** actions => action */
        toOpenWhiskKind: toOpenWhiskKind,

        /** is this activation that of a sequence? */
        isSequenceActivation: entity => entity.logs
            && entity.annotations && entity.annotations.find(kv => kv.key === 'kind' && kv.value === 'sequence'),

        /** update the given openwhisk entity */
        update: (entity, retryCount) => {
            const options = owOpts({
                name: entity.name,
                namespace: entity.namespace
            })
            options[toOpenWhiskKind(entity.type)] = entity
            console.log('wsk::update', options)
            try {
                return ow[entity.type].update(options)
                    .then(addPrettyType(entity.type, 'update', entity.name))
                    .catch(err => {
                        console.error(`error in wsk::update ${err}`)
                        console.error(err)
                        if ((retryCount || 0) < 10) {
                            return update(entity, (retryCount || 0) + 1)
                        } else {
                            throw err
                        }
                    })
            } catch (err) {
                console.error(`error in wsk::update ${err}`)
                console.error(err)
                throw err
            }
        },

        /** add action modes */
        addActionMode: (mode, where='push') => {
            actionSpecificModes[where](mode)
            debug('adding action mode', where, mode, actionSpecificModes)
            specials.actions.get = standardViewModes(actionSpecificModes)
        },

	owOpts: owOpts,

        /** execute a wsk command without saving to the command history */
        qexec: (command, execOptions) => execuctor(command, Object.assign({}, { noHistory: true}, execOptions)),

        /** execute a wsk command with the given options */
        exec: (command, execOptions) => {
            try {
                return executor(command, execOptions)
            } catch (err) {
                console.error('Error in wsk::exec')
                console.error(err)
                throw err
            }
        }
    }

    debug('init done')
    return self
}

