/*
 * Copyright 2017-2018 IBM Corporation
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
debug('loading')

/**
 * This plugin adds commands for the core OpenWhisk API.
 *
 */

const propertiesParser = require('properties-parser'),
      expandHomeDir = require('expand-home-dir'),
      openwhisk = require('openwhisk'),
      minimist = require('yargs-parser'),
      fs = require('fs'),
      path = require('path'),
      history = plugins.require('/ui/commands/history'),
      usage = require('./openwhisk-usage'),
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
    apigw_token = process.env.__OW_APIGW_TOKEN || wskprops.APIGW_ACCESS_TOKEN || 'localhostNeedsSomething', // localhost needs some non-empty string
    apigw_space_guid = process.env.__OW_APIGW_SPACE_GUID || wskprops.APIGW_SPACE_GUID,
    ow

let userRequestedIgnoreCerts = localStorage.getItem(localStorageKeyIgnoreCerts) !== undefined
let ignoreCerts = apiHost => userRequestedIgnoreCerts || apiHost.indexOf('localhost') >= 0 || apiHost.startsWith('192.') || apiHost.startsWith('172.') || process.env.IGNORE_CERTS || wskprops.INSECURE_SSL

/** these are the module's exported functions */
let self = {}

const initOW = () => {
    const owConfig = {
        apihost: apiHost,
        api_key: auth,
        apigw_token, apigw_space_guid,
        ignore_certs: ignoreCerts(apiHost)
    }
    debug('initOW', owConfig)
    ow = self.ow = openwhisk(owConfig)
    ow.api = ow.routes
    delete ow.routes
    debug('initOW done')
}
if (apiHost && auth) initOW()

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
        actions: ['action'],
        packages: ['package'],
        rules: ['rule'],
        triggers: ['trigger'],
        namespaces: ['namespace', 'ns'],
        activations: ['$', 'activation']
    },
    verbs: {
        invoke: ['call', 'exec'],
        fire: [],
        get: ['cat', 'show', 'open'],
        list: ['ls'],
        delete: [],
        create: [
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
        create: ['sequence', 'docker', 'native', 'copy', 'web']
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

    return idx + 1
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
        //paramValue = paramValue.replace(new RegExp(startQuote, 'g'), '')
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

        /*if (entity.annotations
            && entity.annotations.find(kv => kv.key === 'kind' && kv.value === 'sequence')) {
            // sequence activations
            entity.prettyType = 'sequence'
        }*/

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
    'jar': 'java:default',
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
    const makeModes = () => {
        let modes = [{ mode: 'parameters', label: 'params', command: () => 'parameters' },
                     { mode: 'annotations', command: () => 'annotations' },
                     { mode: 'raw', command: () => 'raw' }]

        if (defaultMode) {
            if (!Array.isArray(defaultMode)) {
                if (!modes.find(_ => _.mode === defaultMode)) {
                    // only add the defaultMode if it isn't already in the list
                    const mode = defaultMode.mode || defaultMode
                    modes.splice(0, 0,  { mode, defaultMode: typeof mode === 'string' || mode.default, command: () => mode })
                }
            } else {
                modes = defaultMode.concat(modes)
            }
        }

        return modes
    }

    if (fn) {
        return (options, argv, verb) => Object.assign(fn(options, argv, verb) || {}, { modes: entity => makeModes() })
    } else {
        return (options, argv) => ({ modes: entity => makeModes() })
    }
}

/** flatten an array of arrays */
const flatten = arrays => [].concat.apply([], arrays)

/** api gateway actions */
specials.api = {
    get: (options, argv) => {
        if (!options) return
        const maybeVerb = argv[1]
        const split = options.name.split('/')
        let path = options.name
        if (split.length > 0) {
            options.name = `/${split[1]}`
            path = `/${split[2]}`
        }
        return {
            postprocess: res => {
                // we need to present the user with an entity of some
                // sort; the "api create" api does not return a usual
                // entity, as does the rest of the openwhisk API; so
                // we have to manufacture something reasonable here
                debug('raw output of api get', res)
                const { apidoc } = res.apis[0].value
                const { basePath } = apidoc
                const apipath = apidoc.paths[path]
                const verb = maybeVerb || Object.keys(apipath)[0]
                const { action:name, namespace } = apipath[verb]['x-openwhisk']
                debug('api details', namespace, name, verb)

                // our "something reasonable" is the action impl, but
                // decorated with the name of the API and the verb
                return repl.qexec(`wsk action get "/${namespace}/${name}"`)
                    .then(action => Object.assign(action, {
                        name, namespace,
                        packageName: `${verb} ${basePath}${path}`
                    }))
            }
        }
    },
    create: (options, argv) => {
        if (argv && argv.length === 3) {
            options.basepath = options.name
            options.relpath = argv[0]
            options.operation = argv[1]
            options.action = argv[2]
        } else if (argv && argv.length === 2) {
            options.relpath = options.name
            options.operation = argv[0]
            options.action = argv[1]
        } else if (options && options['config-file']) {
            //fs.readFileSync(options['config-file'])
            throw new Error('config-file support not yet implemented')
        }

        return {
            preprocess: _ => {
                // we need to confirm that the action is web-exported

                // this is the desired action impl for the api
                const name = argv[argv.length - 1]
                debug('fetching action', name)

                return ow.actions.get(owOpts({ name }))
                    .then(action => {
                        const isWebExported = action.annotations.find(({key}) => key === 'web-export')
                        if (!isWebExported) {
                            const error = new Error(`Action '${name}' is not a web action. Issue 'wsk action update "${name}" --web true' to convert the action to a web action.`)
                            error.code = 412 // precondition failed
                            throw error
                        }
                    })
                    .then(() => _)           // on success, return whatever preprocess was given as input
                    .catch(err => {
                        if (err.statusCode === 404) {
                            const error = new Error(`Unable to get action '${name}': The requested resource does not exist.`)
                            error.code = 404 // not found
                            throw error
                        } else {
                            throw err
                        }
                    })
            },
            postprocess: ({apidoc}) => {
                const { basePath } = apidoc
                const path = Object.keys(apidoc.paths)[0]
                const api = apidoc.paths[path]
                const verb = Object.keys(api)[0]
                const { action:name, namespace} = api[verb]['x-openwhisk']

                // manufacture an entity-like object
                return repl.qexec(`wsk action get "/${namespace}/${name}"`)
                    .then(action => Object.assign(action, {
                        name, namespace,
                        packageName: `${verb} ${basePath}${path}`
                    }))
            }
        }
    },
    list: () => {
        return {
            // turn the result into an entity tuple model
            postprocess: res => {
                debug('raw output of api list', res)

                // main list for each api
                return flatten((res.apis || []).map(({value}) => {
                    // one sublist for each path
                    const basePath = value.apidoc.basePath
                    const baseUrl = value.gwApiUrl

                    return flatten(Object.keys(value.apidoc.paths).map(path => {
                        const api = value.apidoc.paths[path]

                        // one sub-sublist for each verb of the api
                        return Object.keys(api).map(verb => {
                            const { action, namespace } = api[verb]['x-openwhisk']
                            const name = `${basePath}${path}`
                            const url = `${baseUrl}${path}`
                            const actionFqn = `/${namespace}/${action}`

                            // here is the entity for that api/path/verb:
                            return {
                                name, namespace,
                                onclick: () => {
                                    return repl.pexec(`wsk api get ${repl.encodeComponent(name)} ${verb}`)
                                },
                                attributes: [
                                    { key: 'verb', value: verb },
                                    { key: 'action', value: action, onclick: () => repl.pexec(`wsk action get ${repl.encodeComponent(actionFqn)}`) },
                                    { key: 'url', value: url, fontawesome: 'fas fa-external-link-square-alt',
                                      css: 'clickable clickable-blatant', onclick: () => window.open(url, '_blank') },
                                    { key: 'copy', fontawesome: 'fas fa-clipboard', css: 'clickable clickable-blatant',
                                      onclick: evt => {
                                          const target = evt.currentTarget
                                          require('electron').clipboard.writeText(url)

                                          const svg = target.querySelector('svg')
                                          svg.classList.remove('fa-clipboard')
                                          svg.classList.add('fa-clipboard-check')

                                          setTimeout(() => {
                                              const svg = target.querySelector('svg')
                                              svg.classList.remove('fa-clipboard-check')
                                              svg.classList.add('fa-clipboard')
                                          }, 1500)
                                      }
                                    }
                                ]
                            }
                        })
                    }))
                }))
            }
        }
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
            const src = argv[argv.length - 1],
                  dest = options.name
            debug('action copy SRC', src, 'DEST', dest, argv)

            return {
                options: ow.actions.get(owOpts({ name: src }))
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
                            name: dest,
                            action: action
                        }
                    })
            }

        } else if (verb !== 'update' || argv[0]) {
            // for action create, or update and the user gave a
            // positional param... find the input file
            if (options.docker) {
                // blackbox action
                options.action.exec.kind = 'blackbox'
                options.action.exec.image = argv[0]

            } else {
                // otherwise, find the file named by argv[0]
                const filepath = ui.findFile(expandHomeDir(argv[0])),
                      isZip = argv[0].endsWith('.zip'),
                      isJar = argv[0].endsWith('.jar'),
                      isBinary = isZip || isJar,
                      encoding = isBinary ? 'base64' : 'utf8'

                options.action.exec.code = fs.readFileSync(filepath).toString(encoding)

                if (!options.action.annotations) options.action.annotations = []
                options.action.annotations.push({ key: 'file', value: filepath })

                if (isBinary) {
                    // add an annotation to indicate that this is a managed action
                    options.action.annotations.push({ key: 'wskng.combinators', value: [{
                        type: 'action.kind',
                        role: 'replacement',
                        badge: isZip ? 'zip' : 'jar'
                    }]})

                    options.action.annotations.push({ key: 'binary', value: true })
                }

                if (options.native) {
                    // native code blackbox action
                    options.action.exec.kind = 'blackbox'
                    options.action.exec.image = 'openwhisk/dockerskeleton'
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
            }
        } else {
            // then we must remove options.exec; the backend fails if an empty struct is passed
            delete options.action.exec
        }

        if (options.main && options.action.exec) {
            // main method of java actions
            options.action.exec.main = options.main
        }
    }),
    list: (options, argv) => {
        // support for `wsk action list <packageName>` see shell issue #449
        if (options && options.name) {
            const parts = (options.name.match(/\//g) || []).length
            const names = options.name.split('/')
            if (parts === 2 && options.name.startsWith('/')) { // /namespace/package
                options.namespace = '/' + names[1]
                options.id = names[2] + '/'
            } else if (parts === 1 && options.name.startsWith('/')) { // /namespace
                options.namespace = options.name
            } else if (parts === 0) { // package
                options.id = options.name + '/'
            } else { // invalid entity
                options.id = options.name
            }
            delete options.name
        }
    },
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
        if (options) {
            options.namespace = options.name
        }
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

        if (options && (!options.name || !options.trigger || !options.action)) {
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

            if (options.trigger && options.trigger.parameters) {
                options.params = options.trigger.parameters.reduce((M, kv) => {
                    M[kv.key] = kv.value
                    return M
                }, {})
            }

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

    if (settings.userAgent && !process.env.TEST_SPACE && !process.env.TRAVIS) {
        // install a User-Agent header, except when running tests
        debug('setting User-Agent', settings.userAgent)
        options['User-Agent'] = settings.userAgent
    }

    return options
}

/**
 * Execute a given command
 *
 * @param preflight the preflight module, used to validate operations
 *
 */
const executor = (_entity, _verb, verbSynonym, commandTree, preflight) => (block, nextBlock, argv_full, modules, raw, execOptions/*, args, options*/) => {
    let entity = _entity,
        verb = _verb

    const pair = parseOptions(argv_full, toOpenWhiskKind(entity)),
          regularOptions = minimist(pair.argv, { boolean: booleans[entity] && booleans[entity][verb],
                                                 alias: aliases[verb],
                                                 configuration: { 'camel-case-expansion': false,
                                                                  'duplicate-arguments-array': false // see shell issue #616
                                                                }
                                               }),
          argv = regularOptions._

    let options = Object.assign({}, regularOptions, pair.kvOptions)
    delete options._

    debug('exec', entity, verb, argv, options, execOptions)

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
        debug('seeing if we can use an implicit entity')
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

            debug('using implicit entity name', options.name)
        }
    }

    // pre and post-process the output of openwhisk; default is do nothing
    let postprocess = x=>x
    let preprocess = x=>x

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

        if (res && res.preprocess) {
            // postprocess the output of openwhisk
            preprocess = res.preprocess
        }

        if (res && res.postprocess) {
            // postprocess the output of openwhisk
            postprocess = res.postprocess
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

    const kind = toOpenWhiskKind(entity)
    if (execOptions && execOptions.entity && execOptions.entity[kind]) {
        // passing entity options programatically rather than via the command line
        options[kind] = Object.assign({}, options[entity]||{}, execOptions.entity[kind])
        debug('programmatic entity', execOptions.entity[kind], options[entity])
    }

    if (!options.then) options = Promise.resolve(options)

    return options.then(options => {
    // this will format a prettyType for the given type. e.g. 'sequence' for actions of kind sequence
    const pretty = addPrettyType(entity, verb, options.name)

    debug(`calling openwhisk ${entity} ${verb} ${options.name}`, options)

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
            .then(preprocess)
            .then(options => ow[entity][verb](options))
            .then(postprocess)
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
                    //return commandTree.changeContext(`/wsk/${entity}`, { name: name })(response)
                    return response
                } else {
                    return response
                }
            })
            .catch(err => {
                if (err.error && err.error.activationId) {
                    // then this is a failed activation
                    throw err

                } else if (execOptions.nested && !execOptions.failWithUsage) {
                    throw err
                } else {
                    //
                    // wrap the backend error in a usage error
                    //
                    const message = modules.ui.oopsMessage(err),
                          code = err.statusCode || err.code,
                          _usageModel = usage[entity].available && usage[entity].available.find(({command}) => command === verb),
                          usageModel = _usageModel && typeof _usageModel.fn === 'function' ? _usageModel.fn(verb, entity) : _usageModel

                    if (!usageModel) {
                        throw err
                    } else {
                        throw new modules.errors.usage({ message, usage: usageModel, code })
                    }
                }
            })
    }
    })
}

module.exports = (commandTree, prequire) => {
    debug('init')

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
                debug('apiHost::set', apiHost)
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
                debug('auth::set', auth)
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
            debug('update', options)
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

        /** add action modes; where=push|unshift */
        addActionMode: (mode, where='push') => {
            actionSpecificModes[where](mode)
            debug('adding action mode', where, mode, actionSpecificModes)
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

        const preflight = prequire('/code/validation/preflight').preflight

    // for each entity type
    const apiMaster = commandTree.subtree(`/wsk`, { usage: usage.wsk })

    if (!ow) {
        // the openwhisk npm is not yet initialized; let's install
        // some basic command handlers
        debug('no openwhisk')
        commandTree.listen('/wsk/action/get', () => Promise.resolve(false))
        return self
    }

    for (let api in ow) {
        const clazz = ow[api].constructor,
              props = Object.getOwnPropertyNames(clazz.prototype).concat(extraVerbs(api) || [])
        //alsoInstallAtRoot = api === 'actions'

        /** return the usage model for the given (api, syn, verb) */
        const docs = typeof usage[api] === 'function' ? usage[api] :
              (syn, verb, alias) => {
                  if (verb) {
                      const model = usage[api] && usage[api].available.find(({command}) => command === verb)
                      if (model && alias && typeof model.fn === 'function') {
                          return model.fn(alias, syn)
                      } else {
                          return model
                      }
                  } else {
                      return usage[api]
                  }
              }

        const apiMaster = commandTree.subtree(`/wsk/${api}`, { usage: docs(api) })

        // find the verbs of this entity type
        debug('verbs')
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
                    commandTree.subtreeSynonym(`/wsk/${eee.nickname || eee}`, apiMaster, { usage: docs(eee.nickname || eee) })

                    const handler = executor(eee.name || api, verb, verb, commandTree, preflight)
                    const entityAliasMaster = commandTree.listen(`/wsk/${eee.nickname || eee}/${verb}`, handler, { usage: docs(api, verb) })

                    // register e.g. wsk action help; we delegate to
                    // "wsk action", which will print out usage (this
                    // comes as part of commandTree.subtree
                    // registrations)
                    //commandTree.listen(`/wsk/${eee.nickname || eee}/help`, () => repl.qexec(`wsk ${eee.nickname || eee}`), { noArgs: true })

                    verbs.forEach(vvv => {
                        const handler = executor(eee.name || api, vvv.name || verb, vvv.nickname || vvv, commandTree, preflight)
                        if (vvv.notSynonym || vvv === verb) {
                            if (vvv.limitTo && vvv.limitTo[api]) {
                                commandTree.listen(`/wsk/${eee.nickname || eee}/${vvv.nickname || vvv}`, handler, { usage: docs(api, vvv.nickname || vvv) })
                            }
                        } else {
                            const handler = executor(eee.name || api, verb, vvv.nickname || vvv, commandTree, preflight)
                            commandTree.synonym(`/wsk/${eee.nickname || eee}/${vvv.nickname || vvv}`, handler, entityAliasMaster, { usage: docs(api, verb, vvv.nickname || vvv) })
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
        commandTree.listen(`/wsk/${syn}/fire`, doFire, { usage: usage.triggers.available.find(({command}) => command === 'fire') })
    })

    /**
     * A request to delete a trigger. If this trigger has an
     * associated feed, we are responsible for invoking the DELETE
     * lifecycle event on the feed.
     *
     */
    const removeTrigger = (block, nextBlock, argv, modules) => {
        const name = argv[argv.length - 1]
        return ow.triggers.delete(owOpts({ name: name }))
            .then(trigger => {
                const feedAnnotation = trigger.annotations && trigger.annotations.find(kv => kv.key === 'feed')
                debug('trigger delete success', trigger, feedAnnotation)
                if (feedAnnotation) {
                    // special case of feed
                    debug('delete feed', trigger)
                    return ow.feeds.delete(owOpts({ feedName: feedAnnotation.value,
                                                    trigger: name,
                                                  }))
                } else {
                    return trigger
                }
            }).then(() => true)
    }
    synonyms.entities.triggers.forEach(syn => {
        commandTree.listen(`/wsk/${syn}/delete`,
                           removeTrigger,
                           { usage: usage.triggers.available.find(({command}) => command === 'delete') })
    })

    /**
     * As per the delete trigger comment for removeTrigger, we
     * similarly must invoke the CREATE lifecycle event for feed
     * creation
     *
     */
    const createTrigger = (_1, _2, _3, _4, _5, _6, argv, options) => {
        const name = argv[argv.length - 1],
              triggerSpec = owOpts({ name }),
              paramsArray = [],
              params = {}

        if (options.param) {
            for (let idx = 0; idx < options.param.length; idx += 2) {
                const key = options.param[idx]
                let value = options.param[idx + 1]

                try {
                    value = JSON.parse(options.param[idx + 1])
                } catch (err) {
                }

                params[key] = value
                paramsArray.push({ key, value })
            }
        }

        if (options.feed) {
            // add the feed annotation

            const annotation = { key: 'feed', value: options.feed }
            debug('adding feed annotation', annotation)

            if (!triggerSpec.trigger) {
                triggerSpec.trigger = {}
            }
            if (!triggerSpec.trigger.annotations) {
                triggerSpec.trigger.annotations = []
            }

            triggerSpec.trigger.annotations.push(annotation)
        } else {
            if (!triggerSpec.trigger) {
                triggerSpec.trigger = {}
            }
            if (!triggerSpec.trigger.parameters) {
                triggerSpec.trigger.parameters = paramsArray
            } else {
                triggerSpec.trigger.parameters = triggerSpec.trigger.parameters.concat(paramsArray)
            }
        }

        debug('creating trigger', triggerSpec)
        return ow.triggers.create(triggerSpec)
            .then(trigger => {
                /** remove trigger if something bad happened instantiating the feed */
                const removeTrigger = err => {
                    console.error(err)
                    ow.triggers.delete(owOpts({ name }))
                    throw new Error('Internal Error')
                }

                if (options.feed) {
                    try {
                        // special case of feed: invoke CREATE lifecycle
                        const feedName = options.feed

                        debug('create feed', feedName, name, params)
                        return ow.feeds.create(owOpts({ feedName, trigger: name, params }))
                            .then(() => trigger)   // return the trigger, not the result of invoking the feed lifecycle
                            .catch(removeTrigger)  // catastrophe, clean up after ourselves

                    } catch (err) {
                        // make sure to clean up after ourselves in case of catastrophe
                        return removeTrigger(err)
                    }

                } else {
                    // otherwise, this is a normal trigger, not a feed
                    return trigger
                }
            })
            .then(addPrettyType('triggers', 'create', name))
    }
    synonyms.entities.triggers.forEach(syn => {
        commandTree.listen(`/wsk/${syn}/create`,
                           createTrigger,
                           { usage: usage.triggers.available.find(({command}) => command === 'create') })
    })

    // namespace.current
    synonyms.entities.namespaces.forEach(syn => {
        commandTree.listen(`/wsk/${syn}/current`, () => namespace.current(), { docs: 'Print the currently selected namespace' })
    })

    // count APIs
    for (let entityType in synonyms.entities) {
        synonyms.entities[entityType].forEach(syn => {
            commandTree.listen(`/wsk/${syn}/count`, (_1, _2, _3, _4, _5, _6, argv, options) => {
                const name = argv[argv.indexOf('count') + 1],
                      overrides =  { count: true }
                if (name) {
                    overrides.name = name
                }
                return ow[entityType].list(Object.assign({}, options, overrides))
                    .then(res => res[entityType])
            })
        })
    }

    debug('init done')
    return self
}

