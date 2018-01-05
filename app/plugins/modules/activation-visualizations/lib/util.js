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

const path = require('path'),
      defaults = require('./defaults.json'),
      prettyPrintDuration = require('pretty-ms')

/** we may want to filter out activations with internal names */
exports.isUUIDPattern = /.*[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** title to use when viewing general activity, i.e. without a name filter */
exports.titleWhenNothingSelected = 'Recent Activity'

/**
 * Flatten an array of arrays
 *
 */
const flatten = arrays => [].concat.apply([], arrays)

/** return the path attribute of the given activation */
const pathOf = activation => `/${activation.annotations.find(({key}) => key === 'path').value}`
exports.pathOf = pathOf

/** make a filter by name */
const acceptAnything = x=>x
const allBut = excludePattern => !excludePattern ? acceptAnything : name => name.indexOf(excludePattern) < 0
const accept = (includePattern, excluder) => name => name.indexOf(includePattern) >= 0 && excluder(name)
const makeFilter = (includePattern,excludePattern) => {
    if (!includePattern && !excludePattern) {
        return acceptAnything
    } else if (!includePattern) {
        return allBut(excludePattern)
    } else {
        return accept(includePattern, allBut(excludePattern))
    }
}

/**
 * foo => ${ns}/foo
 * ns/foo => ns/foo
 *
 */
const amendWithNamespace = name => {
    const ns = namespace.current()
    if (name.indexOf(ns) >= 0) {
        if (name.charAt(0) === '/') return name.substring(1)
        else return name
    } else {
        return `${ns}/${name}`
    }
}

/**
 * Remove trigger and rule activations. These won't have an end
 * attribute. Also, take an optional name filter.
 *
 */
const filterOutNonActionActivations = filter => activations => {
    return activations.filter(_ => _.end && filter(pathOf(_)))
}

const extractTasks = ({fsm}) => {
    const tasks = []
    for (let id in fsm.States || {}) {
        const state = fsm.States[id]
        if (state.Type === 'Task' && state.Action) {
            // state.Action might be undefined, e.g. for inline functions
            tasks.push(state.Action)
        }
    }
    return tasks
}

/**
 * Fetch the activation data from the OpenWhisk API
 *
 */
const fetchActivationData/*FromBackend*/ = (wsk, N, options) => {
    const {appName,path,filter,include,exclude,skip=0,batchSize=defaults.batchSize,all} = options
    let {name=''} = options

    // see if the user requested a time range
    const timeRange = require('./time').range(options),
          upto = (timeRange && timeRange.upto) || options.upto,    // either something like --yesterday, or an explicit --upto
          since = (timeRange && timeRange.since) || options.since  // ibid...

    // name queries can only specify package/action or action; let's check for conformance
    let nameSplit = name.split(/\//)
    if (nameSplit.length === 4 && nameSplit[0].length === 0) {
        // then the pattern is /a/b/c, which split will return as ['', 'a', 'b', 'c']
        // the backend doesn't yet support namespace filters, so strip that off, too
        name = nameSplit.slice(2).join('/')
    } else if (nameSplit.length === 3 && name.charAt(0) === '/') {
        // the name query is /ns/action, where ns is the current
        // namespace; as above, we need to strip off ns
        name = nameSplit[2]
    }

    const nameFilter = name ? `--name ${name}` : '',
          uptoArg = upto ? ` --upto ${upto}` : '',                      // this is part of the openwhisk API; upto a millis since epoch
          sinceArg = since ? ` --since ${since}` : '',                  // ibid; after a millis since epoch
          fetch = extraSkip => repl.qexec(`wsk activation list ${nameFilter} --skip ${skip + extraSkip} --limit ${batchSize}${uptoArg}${sinceArg}`)
          .catch(err => {
              // log but swallow errors, so that we can show the user something... hopefully, at least one of the fetches succeeds
              console.error(err)
              return []
          })

    if (appName) {
        // then the user asked to filter by app tasks
        return repl.qexec(`app get ${appName}`)
            .then(extractTasks)
            .then(tasks => all ? tasks.concat([appName]) : tasks) // if options.all, then add the app to the list of actions
            .then(tasks => Promise.all(tasks.map(task => fetchActivationData(wsk, N, {name:task,filter,include,exclude,skip,upto,since,batchSize}))))
            .then(flatten)
    }

    return Promise.all(new Array(N).fill(0).map((_, idx) => fetch(idx * batchSize)))
        .then(flatten)
        .then(filterOutNonActionActivations(path||filter||include ? makeFilter(path||filter||include, exclude) : name ? makeFilter(amendWithNamespace(name), exclude) : acceptAnything))
}
//exports.fetchActivationDataFromBackend = fetchActivationDataFromBackend

/**
 * Fetch the activation data from our local mirror
 *
 */
const fetchActivationDatas = (wsk, _1, _2, rest, fixedTimeRange) => {
    // --raw means return the raw collection, not a repl result
    // --fixedTimeRange will help us in keeping a fixed window of time across redraws
    return repl.qexec(`mirror query ${rest.join(' ')} --raw --fixedTimeRange ${fixedTimeRange||false}`)
}
exports.fetchActivationData = fetchActivationData

/**
 * Add our CSS to the document
 *
 */
const injectContent = () => {
    ui.injectCSS(path.join(__dirname, '..', 'web', 'css', 'table.css'))
    ui.injectCSS('https://cdnjs.cloudflare.com/ajax/libs/balloon-css/0.5.0/balloon.min.css', true) // tooltips
}
exports.injectContent = injectContent

exports.injectHTML = (container, file, css='') => {
    const frame = document.createElement('iframe')
    frame.setAttribute('src', path.join(__dirname, '..', 'web', 'html', file))
    frame.className = css
    container.appendChild(frame)
}

/**
 * Add time range the total count information to given container
 *
 */
const strong = (container, N) => {
    const existing = container.querySelector(`strong:nth-of-type(${N})`)
    if (existing) {
        return existing
    } else {
        const element = document.createElement('strong')
        container.appendChild(element)
        return element
    }
}
exports.displayTimeRange = ({minTime, maxTime, totalCount}, container) => {
    if (totalCount === 0) {
        container.innerText = 'No activations to display'
    } else {
        const fresh = !container.querySelector('strong')

        if (fresh && container.innerText.length > 0) {
            // in case we had a previous totalCount === 0
            container.innerText = ''
        }

        if (fresh) container.appendChild(document.createTextNode('Showing '))
        strong(container, 1).innerText = totalCount

        if (fresh) container.appendChild(document.createTextNode(' activations from '))
        strong(container, 2).innerText = ui.prettyPrintTime(minTime, 'short')
        
        if (fresh) container.appendChild(document.createTextNode(' to '))
        strong(container, 3).innerText = ui.prettyPrintTime(maxTime, 'short')
    }
}

/**
 * Prepare the sidecar header for the drawing routines to fill in
 *
 */
exports.prepareHeader = isRedraw => {
    const sidecar = document.querySelector('#sidecar'),
          leftHeader = sidecar.querySelector('.header-left-bits .sidecar-header-secondary-content .custom-header-content'),
          rightHeader = sidecar.querySelector('.header-right-bits .custom-header-content')

    if (!isRedraw) {
        ui.removeAllDomChildren(leftHeader)
        ui.removeAllDomChildren(rightHeader)
    }

    return { sidecar, leftHeader, rightHeader }
}

/**
 * The command handler for visualizing as a table
 *
 */
exports.visualize = (wsk, commandTree, cmd, viewName, draw, extraUsage, extraOptions) => (_0, _1, fullArgv, modules, _2, _3, argvNoOptions, options) => {
    // number of batches (of 200) to fetch
    const idx = argvNoOptions.indexOf(cmd),
          idx2 = fullArgv.indexOf(cmd)

    if (options.help || argvNoOptions[idx + 1] === 'help') {
        throw new modules.errors.usage(`Draw recent activations as an ${viewName}.

\t${cmd} [appName]

Options:
\tappName    optionally, if you specify an app, the view will be show only its tasks
\t--batches  the number of 200-activation batches to fetch${extraUsage ? '\n' + extraUsage : ''}`)
    }

    if (idx < 0) {
        console.error('!!!', idx, cmd, argvNoOptions)
        throw new Error('Parse error')
    }

    const appName = argvNoOptions[idx + 1]
    const cli_N = options.batches
    if (cli_N) {
        try {
            const nn = parseInt(cli_N)
        } catch (e) {
            throw new Error('Please provide an integer value for the --batches argument')
        }
    }

    // add the CSS to the document
    injectContent()

    //let timeRange
    const fetchAndDraw = isRedraw => {
        const N = cli_N || defaults.N
        if (N > defaults.maxN) {
            throw new Error(`Please provide a maximum value of ${defaults.maxN}`)
        }
        return fetchActivationData(wsk, N, Object.assign(options, { appName }), fullArgv.slice(idx2 + 1)/*, timeRange*/)
            /*.then(data => {
                if (!isRedraw) {
                    // remember the time range, so that the redraw can
                    // keep the same fixed window of time on every
                    // redraw
                    const {min, max} = data.reduce((range, activation) => {
                        if (!range.min || activation.start < range.min) {
                            range.min = activation.start
                        }
                        if (!range.max || activation.start > range.max) {
                            range.max = activation.start
                        }
                        return range
                    }, {})
                    timeRange = max - min
                }
                return data
            })*/
            .then(draw(options, exports.prepareHeader(isRedraw)))
    }

    if (extraOptions && extraOptions.live) {
        eventBus.on('/mirror/update', () => fetchAndDraw(true))
    }

    return fetchAndDraw().then(response => {
            // alter the sidecar header only once the rendering is done
            sidecar.querySelector('.sidecar-header-icon').innerText = viewName

            return response
        })
}

exports.nLatencyBuckets = 6
const n100 = 2,
      n1000 = 2,
      n7000 = 2
exports.latencyBucket = value => {
    const nBuckets = exports.nLatencyBuckets
    //return Math.min(nBuckets - 1, value < 100 ? ~~(value / (100/6)) : value < 1000 ? 6 + ~~(value / (1000/5)) : value < 7000 ? 11 + ~~(value / (6000/5)) : nBuckets - 1)
    return Math.min(nBuckets - 1, value < 100 ? ~~(value / (100/n100)) : value < 1000 ? n100 + ~~(value / (900/n1000)) : value < 7000 ? n100+n1000 + ~~(value / (6000/n7000)) : nBuckets - 1)
}
const range = (top,buckets,idx,base=0) => `${prettyPrintDuration(top/buckets * idx + 1 + base)}-${prettyPrintDuration(top/buckets * (idx+1) + base)}`
const bucketRanges = []
for (let idx=0; idx<n100; idx++) bucketRanges.push(range(100,n100,idx))
for (let idx=0; idx<n1000; idx++) bucketRanges.push(range(900,n1000,idx, 100))
for (let idx=0; idx<n7000; idx++) bucketRanges.push(range(6000,n7000,idx, 1000))
exports.latencyBucketRange = bucket => {
    return bucketRanges[bucket]
}

/**
 * Is the given activation a successful one?
 * @see https://github.com/apache/incubator-openwhisk/blob/master/common/scala/src/main/scala/whisk/core/entity/ActivationResult.scala#L58
 *
 */
exports.isSuccess = activation => activation.statusCode === 0

/**
 * Turn an options struct into a cli string
 *
 * @param options is the command line options struct given by the
 * user.
 *
 */
exports.optionsToString = options => {
    let str = ''
    for (let key in options) {
        // underscore comes from minimist
        if (key !== '_' && options[key] !== undefined) {
            const dash = key.length === 1 ? '-' : '--',
                  value = options[key] === true || options[key] === false ? '' : ` ${options[key]}`
            str = `${str} ${dash}${key}${value}`
        }
    }

    return str
}
