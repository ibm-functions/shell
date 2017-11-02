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

const prettyPrintDuration = require('pretty-ms'),
      { drilldownWith } = require('./drilldown'),
      { groupByTimeBucket } = require('./grouping'),
      { sort, numericalGroupKeySorter:defaultSorter } = require('./sorting'),
      { drawLegend } = require('./legend'),
      { renderCell } = require('./cell'),
      { titleWhenNothingSelected, latencyBucket, latencyBucketRange, nLatencyBuckets, displayTimeRange, visualize } = require('./util')

const viewName = 'Timeline'

const css = {
    content: 'activation-viz-plugin',
    wrapper: 'activation-viz-timeline-wrapper with-grids',    // wrapper around the timeline div, to give us a horizontal grid
    wrapperQS: 'activation-viz-timeline-wrapper',
    timeline: 'activation-viz-timeline grid-grid with-grids cell-container', // the grid-grid makes renderCell's styling of the cells happy (from the grid view)
    timelineQS: 'activation-viz-timeline',
    column: 'activation-viz-timeline-column grid',
    columnQS: 'activation-viz-timeline-column',
    cell: 'grid-cell grid-cell-occupied',
    cellQS: 'grid-cell'
}

const defaults = {
    cropAt: 60,       // crop the timeline height at this value, and show a "+N" decoration for values greater
    numAxisSwaths: 5, // number of ticks on the timeline axes
    subgrouping: 'duration' // group the timeline buckets into duration buckets; alternatively, 'success' would group by success versus failure
}


/**
 * Open the activity grid for the given activations array
 *
 */
const showGrid = (activations, modes) => () => {
    require('./grid')(null,null, { activations, zoom: 1, modes, fixedHeader: true })
}

/**
 * Visualize the activation data
 *
 */
const drawTimeline = (options, header, modes) => activations => {
    const existingContent = document.querySelector(`.custom-content .custom-content .${css.content}`),
          doubleCheck = existingContent && existingContent.querySelector(css.wrapperQS),
          content = (existingContent && doubleCheck) || document.createElement('div')
    content.className = css.content

    _drawTimeline(options, header, modes, content, groupByTimeBucket(activations, Object.assign({ subgrouping: 'duration'/*options.success ? 'success'
                                                                                                                    : options.success ? 'success' : defaults.subgrouping*/ },
                                                                                         options)))

    return {
        type: 'custom',
        content,
        modes: modes('timeline')
    }
}

/**
 * Create a div with the given CSS class
 *
 */
const div = (container, className, force=false) => {
    const existingElement = !force && container.querySelector(`.${className}`),
          element = existingElement || document.createElement('div')
    if (!existingElement) {
        container.appendChild(element)
        element.className = className
    }
    return { div: element, preexisting: !!existingElement }
}

/**
 * Generic routine for adding an axis. The given decorator will be
 * invoked for each segment of the axis:
 *
 *     decorator(segmentContainer, segmentIndex, numSegments)
 *
 */
const addAxis = (wrapper, axisName, decorator) => {
    const tickClass = 'activation-viz-timeline-axis-interval'

    const {div:axis,preexisting} = div(wrapper, `activation-viz-timeline-${axisName}-axis`)

    try {
        for (let idx = 0; idx < defaults.numAxisSwaths; idx++ ) {
            let segment
            if (!preexisting) {
                segment = div(axis, tickClass, true).div
            } else {
                segment = axis.querySelector(`.${tickClass}:nth-child(${idx + 1})`)
            }
            decorator(segment, idx, defaults.numAxisSwaths)
        }
    } catch (err) {
        conso.error(err)
    }
}

/**
 * Add a top axis to the timeline that indicates the width of each horizontal swath
 *
 */
const addHorizontalAxis = (wrapper, interval) => {
    if (isNaN(interval)) {
        // no data
        return
    }

    addAxis(wrapper, 'horizontal', (segment, segmentIndex, numSegments) => {
        // the decorator: add something to the last segment
        if (segmentIndex === numSegments - 1) {
            div(segment, 'activation-viz-timeline-horizontal-axis-left-line')
            div(segment, 'activation-viz-timeline-axis-label').div.innerText = prettyPrintDuration(interval)
            div(segment, 'activation-viz-timeline-horizontal-axis-right-line')
        }
    })
}

/**
 * Add a top axis to the timeline that indicates the width of each horizontal swath
 *
 */
const addVerticalAxis = (wrapper, interval) => {
    if (interval === 0) {
        // no data
        return
    }

    addAxis(wrapper, 'vertical', (segment, segmentIndex, numSegments) => {
        // the decorator
        ui.removeAllDomChildren(segment)
        const label = div(segment, 'activation-viz-timeline-axis-label').div,
              labelText = (numSegments - segmentIndex + 1) * interval
        label.innerText = Math.round(labelText * 10) / 10
    })
}

/**
 * Round n to nearest higher multiple of m.
 *    e.g. nearestMultiple(5,20)  -> 20
 *         nearestMultiple(17,20) -> 20
 *         nearestMultiple(25,20) -> 40
 *
 */
const nearestMultiple = (n,m) => ~~(n + (m - n % m))

/**
 * Helper method for drawTimeline. This was split out, to allow for
 * re-sorting.
 *
 */
const _drawTimeline = (options, {sidecar, leftHeader, rightHeader}, modes, content, bucketData, sorter=defaultSorter, sortDir=+1) => {
    const { buckets, summary } = bucketData,
          { numAxisSwaths } = defaults

    // determine max height
    let maxHeight
    buckets.forEach(({summary:bucketSummary, bucket}) => {
        // sort the buckets, so that we stack them in the right order
        sort(bucket, sorter, sortDir)

        // height of this column
        const height = bucketSummary.nFailures + bucketSummary.nSuccesses

        // adjust maxHeight across all timeline buckets (max height of a column, across x axis)
        if (!maxHeight || height > maxHeight) {
            maxHeight = height
        }
    })

    // make sure maxHeight is a multiple of the number of tick marks
    // this avoids fractions in the y axis labels
    const maxHeightForAxes = nearestMultiple(maxHeight, numAxisSwaths)

    // we now have maxHeight, and so can start rendering
    const cellRenderingOptions = { nameInTooltip : true }

    // we'll need a wrapper to help with rendering the axes
    const existingWrapper = document.querySelector(`.${css.wrapperQS}`),
          wrapper = existingWrapper || document.createElement('div'),
          timeline = existingWrapper ? wrapper.querySelector(`.${css.timelineQS}`) : document.createElement('div')

    // render the axes, do this first, so that the DOMs stack properly
    const minuteRounder = 1000 * 60 * 1, // try to round to the nearest minute
          rounder = bucketData.bucketWidthInMillis < minuteRounder ? 1 : minuteRounder // ... unless the bucket width is less than a minute!

    addHorizontalAxis(content, Math.round(bucketData.bucketWidthInMillis / rounder) * rounder )
    addVerticalAxis(timeline, maxHeightForAxes / numAxisSwaths)

    // now that the axes are in place, add the rest of the content DOMs
    wrapper.className = css.wrapper
    timeline.className = css.timeline
    timeline.setAttribute('color-by', 'duration')
    if (!existingWrapper) {
        content.appendChild(wrapper)
        wrapper.appendChild(timeline)
    }

    const columns = []
    let dragIsOn = false,
        dragIsMaybe = false,
        escapeHandler
    const resetDrag = () => {
        document.onmouseup = false
        for (let idx = dragIsOn[0]; idx <= dragIsOn[1]; idx++) {
            columns[idx].classList.remove('mousedown')
        }

        if (escapeHandler) {
            document.onkeyup = escapeHandler
        }

        dragIsOn = false
        dragIsMaybe = false
        escapeHandler = false
    }

    // now render the header bits (this could have been done earlier)
    const onclick = options.appName ? drilldownWith(viewName, () => repl.pexec(`app get "${options.appName}"`)) : undefined
    ui.addNameToSidecarHeader(sidecar, options.appName || titleWhenNothingSelected, undefined, onclick)

    displayTimeRange(bucketData, leftHeader)
    if (buckets.length > 0) {
        drawLegend(rightHeader, summary)
    }

    // now render each column: "buckets" is the array of column models
    let previousLeave
    buckets.forEach(({summary:bucketSummary, bucket}, bucketIdx) => {
        const existingColumn = timeline.querySelector(`.${css.columnQS}:nth-child(${bucketIdx + 2})`),
              column = existingColumn || document.createElement('div'),
              peripheral = bucketIdx < 2 ? 'grid-cell-far-far-left' : bucketIdx < 4 ? 'grid-cell-far-left'
              : buckets.length - bucketIdx < 2 ? 'grid-cell-far-far-right' : buckets.length - bucketIdx < 5 ? 'grid-cell-far-right' : '' // for tooltips
        column.className = css.column

        columns.push(column)
        column.onmousedown = () => {
            dragIsMaybe = {column,bucket,bucketIdx}

            escapeHandler = document.onkeyup
            document.onkeyup = evt => {
                if (evt.keyCode === 27) { // escape key maps to keycode `27`
                    resetDrag()
                }
            }
        }
        column.onclick = () => {
            dragIsMaybe = false
        }
        column.onmouseleave = () => {
            previousLeave = bucketIdx
        }
        column.onmouseenter = () => {
            if (dragIsOn && bucketIdx >= dragIsOn[0] && bucketIdx <= dragIsOn[1]) {
                // retraction
                let deleteStart, deleteEnd
                if (previousLeave > bucketIdx) {
                    // retraction from right <--
                    deleteStart = bucketIdx + 1
                    deleteEnd = dragIsOn[1]
                    dragIsOn[1] = bucketIdx
                    //console.error('ON-', dragIsOn, bucketIdx);
                } else {
                    // retraction from left -->
                    deleteStart = dragIsOn[0]
                    deleteEnd = bucketIdx - 1
                    dragIsOn[0] = bucketIdx
                    //console.error('-ON', dragIsOn, bucketIdx);
                }
                for (let idx = deleteStart; idx <= deleteEnd; idx++) {
                    columns[idx].classList.remove('mousedown')
                }
                return
            }
            
            if (dragIsMaybe) {
                // initiation
                dragIsMaybe.column.classList.add('mousedown')
                dragIsOn = [dragIsMaybe.bucketIdx,dragIsMaybe.bucketIdx]
                dragIsMaybe = false

                document.onmouseup = evt => {
                    if (dragIsOn) {
                        const activations = [],
                              highlightThis = []
                        for (let idx = dragIsOn[0]; idx <= dragIsOn[1]; idx++) {
                            buckets[idx].bucket.forEach(group => group.activations.forEach(activation => activations.push(activation)))
                            highlightThis.push(columns[idx])
                        }
                        resetDrag()
                        drilldownWith(viewName, showGrid(activations, modes), highlightThis)(evt)
                    }
                }
            }

            if (dragIsOn) {
                // expansion
                dragIsOn = [Math.min(dragIsOn[0],bucketIdx), Math.max(dragIsOn[1],bucketIdx)]
                //console.error('ON',dragIsOn)
                for (let idx = dragIsOn[0]; idx < dragIsOn[1]; idx++) {
                    columns[idx].classList.add('mousedown')
                }
            }
        }
        if (!existingColumn) timeline.appendChild(column)

        const updateCell = (cell, group) => {
            const isFailure = group.nFailures > 0,
                  fraction = group.count / maxHeight

            cell.style.height = `${100 * fraction}%`
            cell.setAttribute('data-count', group.count)

            if (group.count === 0) {
                cell.classList.remove('grid-cell-occupied')
            } else {
                cell.classList.add('grid-cell-occupied')
            }

            const tooltip = isFailure
                  ? `Failed Activations: ${group.count}`
                  : `${group.count} activations with a latency of ${latencyBucketRange(group.groupKey)}`
            cell.setAttribute('data-balloon', tooltip)

            cell.onclick = event => {
                resetDrag()
                drilldownWith(viewName, showGrid(group.activations, modes), cell)(event)
            }
        }
        if (existingColumn) {
            for (let idx = 0; idx < column.childNodes.length; idx++) {
                const cell = column.childNodes[idx],
                      groupKey = parseInt(cell.getAttribute('data-group-key')),
                      newOne = bucket.find(_ => _.groupKey === groupKey)

                if (!newOne) {
                    // this cell doesn't exist in the new model
                    cell.style.height = '0%'
                    cell.classList.remove('grid-cell-occupied')
                } else {
                    updateCell(cell, newOne)
                    newOne.marked = true
                }
            }
        }
        let prevCell
        bucket.forEach(group => {
            if (group.marked) return // dealt with already in the prior loop nest

            // otherwise, this is a new cell
            const isFailure = group.nFailures > 0,
                  fraction = group.count / maxHeight

            if (fraction > 0.01 || isFailure) {
                // render a new cell
                cell = document.createElement('div')
                cell.className = `${css.cell} ${peripheral}`
                cell.setAttribute('data-group-key', group.groupKey)
                renderCell(viewName, cell, null, isFailure, group.groupKey, cellRenderingOptions)

                if (column.childNodes.length === 0) {
                    // this is the first time we've rendered this column
                    column.appendChild(cell)
                } else {
                    let gotIt = false
                    for (let idx = 0; idx < column.childNodes.length; idx++) {
                        const otherCell = column.childNodes[idx],
                              otherGroupIdx = parseInt(cell.getAttribute('data-group-key'))
                        if (otherGroupIdx > group.groupKey) {
                            column.insertBefore(cell, otherCell)
                            gotIt = true
                        }
                    }
                    if (!gotIt) {
                        column.appendChild(cell)
                    }
                }

                prevCell = cell
                updateCell(cell, group)
            }
        })
    })
}

/**
 * This is the module
 *
 */
module.exports = (commandTree, prequire) => {
    const wsk = prequire('/ui/commands/openwhisk-core'),
          mkCmd = (cmd, extraOptions) => visualize(wsk, commandTree, cmd, viewName, drawTimeline, null, extraOptions),
          timelineIt = mkCmd('timeline'),
          pollingTimeline = mkCmd('...', { live: true })

    // a command that is a bit instructional as to what is going on
    // this if for the tray-launched scenario
    commandTree.listen('/loading/activity/timeline/...', function() {
        return /*repl.qexec('mirror poll')*/Promise.resolve(true)
            .then(() => pollingTimeline.apply(undefined, arguments))
    }, { hide: true })

    wsk.synonyms('activations').forEach(syn => {
        commandTree.listen(`/wsk/${syn}/timeline`, timelineIt, { docs: 'Visualize recent activations in a timeline', needsUI: true,
                                                                 viewName,
                                                                 fullscreen: true, width: 800, height: 600,
                                                                 placeholder: 'Loading activity timeline ...'})
    })
}
