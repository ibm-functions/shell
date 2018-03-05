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

const debug = require('debug')('plugin compile')
debug('loading')

const fs = require('fs-extra'),
      path = require('path'),
      events = require('events'),
      mkdirp = require('mkdirp-promise'),
      { exec } = require('child_process'),
      TMP = 'plugins'  // we'll stash the original plugins here

if (typeof global.plugins === 'undefined') {
    // this is the case when compiling plugins from the command line;
    // e.g. via an `npm install` in the top of the app directory
    global.plugins = require(path.join(__dirname, '../../../../content/js/plugins'))
    global.localStorage = { getItem: () => '{}' }
    global.eventBus = new events.EventEmitter()
    global.ui = {
        headless: true,
        startsWithVowel: () => false
    }
}

debug('modules loaded')

/**
 * Return the location of the pre-scanned cache file
 *
 */
const prescanned = dir => path.join(dir, '.pre-scanned')

/**
 * Write the plugin list to the .pre-scanned file in app/plugins/.pre-scanned
 *
 */
const writeToFile = (dir, modules) => new Promise((resolve, reject) => {
    fs.writeFile(prescanned(dir),
                 JSON.stringify(modules, undefined, 4),
                 err => {
                     if (err) reject(err)
                     else resolve()
                 })
})

/**
 * Read the current .pre-scanned file
 *
 */
const readFile = dir => new Promise((resolve, reject) => {
    fs.readFile(prescanned(dir), (err, data) => {
        if (err) {
            console.error(err.code)
            if (err.code === 'ENOENT') {
                resolve({})
            } else {
                reject(err)
            }
        } else {
            resolve(JSON.parse(data.toString()))
        }
    })
})

/**
 * Find what's new in after versus before, two structures
 *
 */
const diff = ({commandToPlugin:before}, {commandToPlugin:after}, reverseDiff = false) => {
    const A = (reverseDiff ? after : before) || [],
          B = (reverseDiff ? before : after) || []

    const changes = []
    for (let key in B) {
        if (! (key in A)) {
            changes.push(key.replace(/^\//,'').replace('/', ' '))
        }
    }

    return changes
}

/**
 * Uglify the javascript
 *
 */
const uglify = modules => modules.flat.map(module => new Promise((resolve, reject) => {
    if (!process.env.UGLIFY) resolve()
    debug('uglify %s', module.path)

    const src = path.join(__dirname, '..', '..', '..', module.path),
          target = src, // we'll copy it aside, and overwrite the original
          tmpPath = path.join(TMP, module.path),
          tmpDir = path.join(tmpPath, '..') // we want the name of the enclosing directory

    //console.log(`uglifying ${module.route} ${src}`)

    mkdirp(tmpDir)
        .then(() => fs.copy(src, tmpPath).then(() => tmpPath))
        .then(() => {
            exec(`${path.join(__dirname, '..', 'node_modules', '.bin', 'uglifyjs')} --compress --mangle -o "${target}" -- "${tmpPath}"`,
                 (err, stdout, stderr) => {
                     if (err) reject(err)
                     else resolve()
                 })
        })
        .catch(reject)
}))

/**
 * Make a tree out of a flat map.
 * e.g. take "/wsk" and "/wsk/actions" and make a tree out of that flat
 * structure based on the "/path/hierarchy"
 *
 */
const makeTree = (map, docs) => {
    const keys = Object.keys(map)

    // sort the keys lexicographically
    keys.sort()

    /** create new node */
    const node = route => ({ route })
    const inner = route => Object.assign(node(route), { children: {} })

    /** get or create a subtree */
    const getOrCreate = (tree, pathPrefix) => {
        const entry = tree.children[pathPrefix]
        if (!entry) {
            return tree.children[pathPrefix] = inner(pathPrefix)
        } else {
            return entry
        }
    }

    const tree = keys.reduce((tree, route) => {
        const split = route.split(/\//)

        let subtree = tree
        for (let idx = 0; idx < split.length; idx++) {
            const pathPrefix = split.slice(0, idx).join('/')
            subtree = getOrCreate(subtree, pathPrefix)
        }

        if (!subtree.children) subtree.children = {}
        const leaf = subtree.children[route] = node(route)
        leaf.usage = map[route]
        leaf.docs = map[route].header || docs[route]

        return tree
    }, inner('/'))

    return tree.children[''].children[''].children
}

/**
 * Scan the registered commands for usage docs, so that we can stash
 * them away in the compiled plugin registry. This will allow us to
 * present docs in a general way, not only in response to evaluation
 * of commands.
 *
 */
const scanForUsageDocs = modules => {
    const commandTree = require('../../../../content/js/command-tree')

    modules.docs = {}
    modules.usage = {}

    commandTree.getModel().forEachNode(({ route, options={} }) => {
        const { usage, docs } = options

        if (usage) {
            modules.usage[route] = usage
        }

        if (docs) {
            modules.docs[route] = docs
        }
    })

    // modules.usage right not is flat, i.e. it may contain entries
    // for "/wsk" and "/wsk/actions"; make a tree out of that flat
    // structure based on the "/path/hierarchy"
    modules.usage = makeTree(modules.usage, modules.docs)

    return modules
}

module.exports = (rootDir, externalOnly, cleanup = false, reverseDiff = false) => new Promise((resolve, reject) => {

    /**
     * assemble the list of plugins, then minify the plugins, if we can,
     * and write the list to the .pre-scanned file
     *
     */
    if (cleanup) {
        // copy the TMP originals back in place
        debug('cleanup')
        Promise.all(require('../../../../content/js/plugins.js').scanForPlugins(TMP)
            .map(pluginJsFile => {
                const pluginRoot = path.join(__dirname, '..', '..', '..', '..'),
                    originalLocation = path.join(pluginRoot, pluginJsFile)
                return fs.copy(pluginJsFile, originalLocation)
            })).then(()=>resolve()).catch(err=>reject(err))

    } else {
        const pluginRoot = path.join(rootDir, 'plugins')       // pluginRoot points to the root of the modules subdir

        debug('rootDir is %s', rootDir)
        debug('pluginRoot is %s', pluginRoot)
        debug('externalOnly is %s', externalOnly)

        return readFile(pluginRoot)
            .then(before => mkdirp(path.join(pluginRoot, 'modules'))
                  .then(() => plugins.assemble({ pluginRoot, externalOnly }))
                  .then(modules => Object.assign(modules, {
                      flat: modules.flat.map(module => Object.assign(module, {
                          // make the paths relative to the root directory
                          path: path.relative(path.join(__dirname, '..', '..', '..'), module.path)
                      }))
                  }))
                  .then(scanForUsageDocs)
                  .then(modules => Promise.all([writeToFile(pluginRoot, modules), ...uglify(modules)])
                        .then(() => resolve(diff(before, modules, reverseDiff)))))  // resolve with what is new
            .catch(err => reject(err))
    }
})

debug('loading done')
