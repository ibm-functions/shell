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

/** sort by action name */
exports.nameSorter = { id: 'name', field: group => group.path, compare: (a,b) => a.localeCompare(b), extraCss: 'cell-label' }

/** sort by string field */
exports.stringSorter = id => ({ id, field: group => group[id], compare: (a,b) => a.localeCompare(b), extraCss: `cell-${id}` })

/** sort by the semver field */
exports.versionSorter = exports.stringSorter('version') // note how, in grouping.js, the SemVer class supports a string-compatible localeCompare method

/** sort by an element of statistical data */
exports.statDataSorter = n => ({ id: n, field: group => group.statData.n[n], compare: (a,b) => b-a, extraCss: 'cell-numeric' })

/** generic sorter for numerical attributes */
exports.numericalSorter = (id, sortDir=+1) => ({ id, field: group => group[id], compare: (a,b) => sortDir*(b-a), extraCss: 'cell-numeric' })

/** sort by activation duration */
exports.durationSorter = exports.numericalSorter('duration')

/** sort by activation start time */
exports.startTimeSorter = exports.numericalSorter('start', -1) // sort from earliest to latest

/** sort by group count */
exports.countSorter = exports.numericalSorter('count')

/** sort by numerical groupKey */
exports.numericalGroupKeySorter = exports.numericalSorter('groupKey')

/** the default sorter */
exports.defaultSorter = exports.statDataSorter(90) // sort by 90th percentile of duration by default

/**
 * Create a sort function
 *
 */
const sortFn = (sorter, sortDir) => (a,b) => {
    const f1 = sorter.field(a),
          f2 = sorter.field(b)
    return sortDir * sorter.compare(f1, f2)
}

/**
 * Sort the given group data using the given sorter
 *
 */
exports.sort = (groups, sorter, sortDir) => {
    // sort the rows
    groups.sort(sortFn(sorter, sortDir))
}

/**
 * Secondary sort, i.e. sort the activations within each group
 *
 */
exports.sortActivations = (groups, sorter, sortDir) => {
    const comparator = sortFn(sorter, sortDir)

    groups.forEach(group => {
        (group.successes || group.activations).sort(comparator)
    })
}
