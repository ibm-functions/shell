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

const { isSuccess, pathOf, latencyBucket, nLatencyBuckets, isUUIDPattern } = require('./util')

/**
 * Compute statistical properties of a given group of activations
 *
 */
const summarizePerformance = activations => {
    const durations = activations.map(_ => _.end - _.start)
    durations.sort((a,b) => a - b)

    const min = durations[0],
          max = durations[durations.length - 1]

    return { min, max,
             n: {
                 25: durations[~~(durations.length * 0.25)],
                 50: durations[~~(durations.length * 0.50)],
                 90: durations[~~(durations.length * 0.90)],
                 95: durations[~~(durations.length * 0.95)],
                 99: durations[~~(durations.length * 0.99)]
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
const summarizeWhole = groups => {
    const allActivations = groups.reduce((L, group) => L.concat(group.successes || group.activations), []),
          nSuccesses = groups.reduce((S, group) => S + group.nSuccesses, 0),
          nFailures = groups.reduce((S, group) => S + group.nFailures, 0)

    return {
        statData: summarizePerformance(allActivations),
        nFailures,
        nSuccesses,
        errorRate: nFailures / (nSuccesses + nFailures)
    }
}

/**
  * Compute statData over all activations
  *
  */
const summarizeWhole2 = allActivations => {
    const { nSuccesses, nFailures } = allActivations.reduce((S, activation) => {
        if (activation.response.success) S.nSuccesses++
        else S.nFailures++
        return S
    }, { nSuccesses: 0, nFailures: 0 })

    return {
        statData: summarizePerformance(allActivations),
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
    const path = options.subgrouping === 'success' ? activation.response.success ? 'success' : 'failure'
          : options.subgrouping === 'duration' ? activation.response.success ? latencyBucket(activation.end - activation.start) : nLatencyBuckets
          : _path,
          {version, groupKey} = !splitRequested ? {groupKey: path} : splitter(activation, path)

    if (options.key && groupKey !== options.key) {
        // we were asked to filter by groupKey
        return groups
    }
    if (options.all || options.name || (!(_path.match && _path.match(isUUIDPattern)) && !activation.cause)) {
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
        const list = !options.groupBySuccess
              ? group.activations               // not grouping by success
              : isSuccess ? group.successes     // we are, and the activation was successful
              : group.failures                  // we are, and the activation failed
        list.push(activation)

        if (isSuccess(activation)) group.nSuccesses++
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
        group.statData = summarizePerformance(group.successes || group.activations)
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
 * Group the activations by action, and compute some summary
 * statistics for each group: error rate, count, success versus
 * failure.
 *
 */
exports.groupByAction = (activations, options) => {
    const splitRequested = options.split,
          splitter = splitRequested && (options.split === true ? splitByVersion : splitAroundVersion(options.split))

    const totals = { minTime: undefined, maxTime: undefined, totalCount: 0},
          map = activations.reduce(addToGroup(options, totals, splitRequested, splitter), {}),
          groups = toArray(map, options) // turn the map into an array, for easier consumption

    return Object.assign(totals, {
        groups,
        summary: summarizeWhole(groups)   // a "statData" object, for all activations
    })
}

/**
 * Group the given activations by time
 *
 */
exports.groupByTimeBucket = (activations, options) => {
    if (!options.all) {
        activations = activations.filter(activation => {
            const path = pathOf(activation)
            return !(path.match && path.match(isUUIDPattern)) && !activation.cause
        })
    }

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
                summary: summarizeWhole(bucket)
            }
        }),
        summary: summarizeWhole2(activations)  // a "statData" object, for all activations
    })
}
