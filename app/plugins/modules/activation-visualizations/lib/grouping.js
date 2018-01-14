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

const { isSuccess, pathOf, latencyBucket, nLatencyBuckets, isUUIDPattern } = require('./util'),
      prettyPrintDuration = require('pretty-ms')

/**
 * Create a table of rows
 *
 */
const tableOf = rows => {
    const table = document.createElement('div')
    rows.forEach(({content, title}={}) => {
        if (content) {
            const row = document.createElement('span')
            row.classList.add('graphical-clickable')
            row.style.paddingLeft = '0.5ex'
            table.appendChild(row)
            row.innerText = content
            row.title = title
        }
    })
    return table
}

/**
 * Render an explanation of an increase in latency
 *
 */
const maybe = (reason, shorthand, disparity, cover) => {
    if (cover > 0.01) {
        const pretty = prettyPrintDuration(disparity)
        return {
            content: `${shorthand}+${pretty}`,
            title: `${reason} increased by ${pretty}`
        }
    }
}

/**
 * Compute statistical properties of a given group of activations
 *
 */
const summarizePerformance = (activations, options) => {
    const summaries = activations.map(_ => {
        const waitAnno = _.annotations.find(({key}) => key === 'waitTime'),
              initAnno = _.annotations.find(({key}) => key === 'initTime'),
              duration = _.end - _.start,              
              wait = waitAnno ? waitAnno.value : 0,  // this is "Queueing Time" as presented in the UI
              init = initAnno ? initAnno.value : 0   // and this is "Container Initialization"

        return { duration, wait, init, activation: _ }
    })
    summaries.sort((a,b) => a.duration - b.duration)

    if (summaries.length === 0) {
        return
    }

    const min = summaries[0].duration,
          max = summaries[summaries.length - 1].duration,
          idx25 = ~~(summaries.length * 0.25),
          idx50 = ~~(summaries.length * 0.50),
          idx75 = ~~(summaries.length * 0.75),
          idx90 = ~~(summaries.length * 0.90),
          idx95 = ~~(summaries.length * 0.95),
          idx99 = ~~(summaries.length * 0.99),
          idxOutlier = ~~(summaries.length * (options.outliers === undefined || options.outliers === true ? 0.95 : options.outliers)),  // where do we want to draw the line for "is an outlier"?
          nFast = idx25 + 1,
          nSlow = summaries.length - idxOutlier,
          waitAvgForFastest = summaries.slice(0, idx25 + 1).reduce((total, {wait}) => total + wait, 0) / nFast,
          waitAvgForSlowest = summaries.slice(idxOutlier).reduce((total, {wait}) => total + wait, 0) / nSlow,
          initAvgForFastest = summaries.slice(0, idx25 + 1).reduce((total, {init}) => total + init, 0) / nFast,
          initAvgForSlowest = summaries.slice(idxOutlier).reduce((total, {init}) => total + init, 0) / nSlow,
          durAvgForFastest = summaries.slice(0, idx25 + 1).reduce((total, {duration}) => total + duration, 0) / nFast,
          durAvgForSlowest = summaries.slice(idxOutlier).reduce((total, {duration}) => total + duration, 0) / nSlow,
          totalAvgForFastest = summaries.slice(0, idx25 + 1).reduce((total, {duration,wait,init}) => total + duration + wait + init, 0) / nFast,
          totalAvgForSlowest = summaries.slice(idxOutlier).reduce((total, {duration,wait,init}) => total + duration + wait + init, 0) / nSlow

    const disparity = totalAvgForSlowest - totalAvgForFastest,
          durDisparity = durAvgForSlowest - durAvgForFastest,
          waitDisparity = waitAvgForSlowest - waitAvgForFastest,
          initDisparity = initAvgForSlowest - initAvgForFastest,
          durDisparityCover = durDisparity / disparity,
          waitDisparityCover = waitDisparity / disparity,
          initDisparityCover = initDisparity / disparity,
          why = disparity === 0
          ? document.createTextNode('')
          : tableOf([maybe('Execution Time', 'E', durDisparity, durDisparityCover, ''),
                     maybe('Queueing Delays', 'Q', waitDisparity, waitDisparityCover),
                     maybe('Container Initialization', 'I', initDisparity, initDisparityCover)])

    // outlier activations
    const outliers = summaries.slice(idxOutlier),
          outlierMax = outliers.reduce((max, {activation}) => Math.max(max, activation.end - activation.start), 0)

    return { min, max,
             durDisparityCover, waitDisparityCover, initDisparityCover, why,
             outliers, outlierMax,
             n: {
                 disparity,
                 min, max,
                 25: summaries[idx25].duration,
                 50: summaries[idx50].duration,
                 75: summaries[idx75].duration,
                 90: summaries[idx90].duration,
                 95: summaries[idx95].duration,
                 99: summaries[idx99].duration
             }
           }
}
exports.summarizePerformance = summarizePerformance

/**
 * Given a string 'x.y.z', return an array of numbers [x,y,z].
 *
 */
const semver = version => version.split('.').map(Number)

class SemVer {
    constructor(version) {
        this.version = semver(version)
    }

    compare(v2) {
        return this._compare(semver(v2))
    }

    localeCompare(that) {
        return this._compare(that.version)
    }

    _compare(thatVersion) {
        return this.version[0] - thatVersion[0]
            || this.version[1] - thatVersion[1]
            || this.version[2] - thatVersion[2]
    }

    toString() {
        return this.version.join('.')
    }
}

/**
 * Form a grouping key that discriminates by version and path
 * attributes
 *
 */
const splitByVersion = (activation, path) => ({
    version: new SemVer(activation.version),
    groupKey: `${path} v${activation.version}`
})

/**
 * Form a grouping key that discriminates by the path attribute, and
 * a binary discrimination of the version field (< and >=)
*
*/
const splitAroundVersion = version => {
    const split = new SemVer(version)

    return (activation, path) => {
        const version = split.compare(activation.version) > 0 ? 'A' : 'B',
              groupKey = `${path} v${version}`
        return { version, groupKey }
    }
}

/**
  * Compute statData over all activations
  *
  */
const summarizeWhole = (groups, options) => {
    const allActivations = groups.reduce((L, group) => L.concat(group.successes || group.activations), []),
          nSuccesses = groups.reduce((S, group) => S + group.nSuccesses, 0),
          nFailures = groups.reduce((S, group) => S + group.nFailures, 0)

    return {
        statData: summarizePerformance(allActivations, options),
        nFailures,
        nSuccesses,
        errorRate: nFailures / (nSuccesses + nFailures)
    }
}

/**
  * Compute statData over all activations
  *
  */
const summarizeWhole2 = (allActivations, options) => {
    const { nSuccesses, nFailures } = allActivations.reduce((S, activation) => {
        if (isSuccess(activation)) S.nSuccesses++
        else S.nFailures++
        return S
    }, { nSuccesses: 0, nFailures: 0 })

    return {
        statData: summarizePerformance(allActivations, options),
        nFailures,
        nSuccesses,
        errorRate: nFailures / (nSuccesses + nFailures)
    }
}

/**
 * Helper to grouping by action, but assuming that the caller is
 * taking care of providing us with activations.
 *
 */
const addToGroup = (options, totals, splitRequested, splitter) => (groups, activation) => {
    const _path = pathOf(activation)
    const path = options.subgrouping === 'success' ? isSuccess(activation) ? 'success' : 'failure'
          : options.subgrouping === 'duration' ? isSuccess(activation) ? latencyBucket(activation.end - activation.start) : nLatencyBuckets
          : _path,
          {version, groupKey} = !splitRequested ? {groupKey: path} : splitter(activation, path)

    if (options.key && groupKey !== options.key) {
        // we were asked to filter by groupKey
        return groups
    }

    // commenting out the bizarre filter. see shell issue #120
    if (true/*options.all || options.name || (!(_path.match && _path.match(isUUIDPattern)) && !activation.cause)*/) {
        let group = groups[groupKey]
        if (!group) {
            group = groups[groupKey] = { name: activation.name, nSuccesses: 0, nFailures: 0, path, groupKey, version }

            if (options.groupBySuccess) {
                group.successes = []
                group.failures = []
            } else {
                group.activations = []
            }
        }

        // add the activation to the appropriate list
        const success = isSuccess(activation),
              list = !options.groupBySuccess
              ? group.activations               // not grouping by success
              : success ? group.successes       // we are, and the activation was successful
              : group.failures                  // we are, and the activation failed
        list.push(activation)

        if (success) group.nSuccesses++
        else group.nFailures++

        totals.totalCount++
        if (!totals.minTime || activation.start < totals.minTime) totals.minTime = activation.start
        if (!totals.maxTime || activation.start > totals.maxTime) totals.maxTime = activation.start
    }

    return groups
}

/**
 * Turn an "action group" --- activations grouped by action, keyed by
 * the action's path --- into an array. The caller will take care of
 * sorting this array how it sees fit.
 *
 */
const toArray = (map, options) => {
    const groups = []

    for (let x in map) {
        const group = groups[groups.push(map[x]) - 1]
        group.statData = summarizePerformance(group.successes && group.successes.length > 0 ? group.successes : group.failures || group.activations, options)
        group.errorRate = group.nFailures / (group.nSuccesses + group.nFailures)
        if (options.groupBySuccess) {
            group.count = group.successes.length + group.failures.length
        } else {
            group.count = group.activations.length
        }
    }

    return groups
}

/**
 * Cost function for an activation
 *   TODO factor this out!!!!
 */
const costOf = activation => {
    const limitsAnnotation = activation.annotations.find(({key}) => key === 'limits'),
          duration = activation.end - activation.start,
          cost = !limitsAnnotation ? 0 : ((limitsAnnotation.value.memory/1024) * (Math.ceil(duration/100)/10) * 0.000017 * 1000000)

    return ~~(cost * 100)/100
}

/**
 * Construct a success versus failure timeline model
 *
 */
const successFailureTimeline = (activations, { nBuckets = 20 }) => {
    if (activations.length === 0) {
        return []
    }

    // some parameters of the model
    const first = activations[activations.length - 1].start,
          last = activations[0].start,
          interval = ~~((last - first) / nBuckets),
          bucketize = timestamp => Math.min(nBuckets - 1, ~~((timestamp - first) / interval))

    // now we construct the model
    const buckets = activations.reduce((buckets, activation) => {
        const tally = isSuccess(activation) ? buckets.success : buckets.failure,
              idx = bucketize(activation.start)
        tally[idx]++
        buckets.cost[idx] += costOf(activation)
        return buckets
    }, { success: Array(nBuckets).fill(0),
         failure: Array(nBuckets).fill(0),
         cost: Array(nBuckets).fill(0),
         interval, first, last, nBuckets    // pass through the parameters to the view, in case it helps
       })

    return buckets
}

/**
 * Group the activations by action, and compute some summary
 * statistics for each group: error rate, count, success versus
 * failure.
 *
 */
exports.groupByAction = (activations, options) => {
    const splitRequested = options.split,
          splitter = splitRequested && (options.split === true ? splitByVersion : splitAroundVersion(options.split))

    const totals = { minTime: undefined, maxTime: undefined, totalCount: 0},
          timeline = successFailureTimeline(activations, options),
          map = activations.reduce(addToGroup(options, totals, splitRequested, splitter), {}),
          groups = toArray(map, options) // turn the map into an array, for easier consumption

    return Object.assign(totals, {
        timeline,
        groups,
        summary: summarizeWhole(groups, options)   // a "statData" object, for all activations
    })
}

/**
 * Group the given activations by time
 *
 */
exports.groupByTimeBucket = (activations, options) => {
    // commenting out the bizarre filter. see shell issue #120
    /*if (!options.all) {
        activations = activations.filter(activation => {
            const path = pathOf(activation)
            return !(path.match && path.match(isUUIDPattern)) && !activation.cause
        })
    }*/

    // first, sort the activations by increasing start time, to help
    // with bucketing
    activations.sort((a,b) => a.start - b.start)

    // compute bucket properties
    const nBuckets = options.buckets || 46,
          first = activations[0],
          last = activations[activations.length - 1],
          minTime = first && first.start,
          maxTime = last && last.start,
          timeRangeInMillis = maxTime - minTime + 1,
          bucketWidthInMillis = timeRangeInMillis / nBuckets,
          totals = { minTime: undefined, maxTime: undefined, totalCount: 0},
          grouper = addToGroup(options, totals)

    const buckets = activations.reduce((bucketArray, activation) => {
        const bucketIdx = ~~( (activation.start - minTime) / bucketWidthInMillis)
        grouper(bucketArray[bucketIdx], activation)
        return bucketArray
    }, new Array(nBuckets).fill(0).map(_ => ({}) )) // an array of length nBuckets, of {} -- these will be activation groups, for each timeline bucket


    // the buckets.map turns each timeline bucket, which right now is
    // a map from action path to action, into an array -- for easier
    // consumption
    return Object.assign(totals, {
        bucketWidthInMillis,
        buckets: buckets.map(bucketMap => {
            const bucket = toArray(bucketMap, options)
            return {
                bucket,
                summary: summarizeWhole(bucket, options)
            }
        }),
        summary: summarizeWhole2(activations, options)  // a "statData" object, for all activations
    })
}
