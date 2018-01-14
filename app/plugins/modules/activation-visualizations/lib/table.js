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
      events = require('events'),
      { drilldownWith } = require('./drilldown'),
      { sort, nameSorter, stringSorter, versionSorter, statDataSorter, numericalSorter } = require('./sorting'),
      { groupByAction } = require('./grouping'),
      { modes } = require('./modes'),
      { optionsToString, titleWhenNothingSelected, latencyBucket, displayTimeRange, visualize } = require('./util'),
      enDash = '\u2013',
      //emDash = '\u2014',
      defaultBottom = 25, defaultTop = 75,         // default range to show in summary
      defaultSorter = statDataSorter(defaultTop)   // sort by the default top of the range

const viewName = 'Summary'

/**
 * Render the given fractional value as a CSS percent
 *
 */
const percent = fraction => `${100 * fraction}%`

/**
 * Drill down to the grid for for a given list of activations
 *
 */
const showGridForActivationList = activations => drilldownWith(viewName, () => {
    require('./grid')(undefined, undefined, { activations })
})

/**
 * Visualize the activation data
 *
 */
const drawTable = (options, header) => activations => {
    const eventBus = new events.EventEmitter(),
          content = document.createElement('div')
    content.className = 'activation-viz-plugin'

    if (options.w) {
        // user asked for the action name column to be wider
        content.classList.add('wide-label')
    } else if (options.ww) {
        // user asked for the action name column to be wider
        content.classList.add('extra-wide-label')
    }

    // add time range to the sidecar header
    const groupData = groupByAction(activations, Object.assign({ groupBySuccess: true }, options))
    displayTimeRange(groupData, header.leftHeader)

    return _drawTable(options, header, content,
                      groupData, eventBus,
                      options.split ? versionSorter : defaultSorter // if we were asked to split by version, then sort by name
                     )
}

/**
 * Let the user select the percentile range to display
 *
 */
const addRangeSelector = (container, eventBus, defaultBottom, defaultTop, groupData, options) => {
    const selector = document.createElement('div'),
          label = document.createElement('div'),
          list = document.createElement('ul')

    const choices = [
        { bottom: 25, top: 75 },
        //{ bottom: 25, top: 90 },
        { bottom: 25, top: 95 },
        //{ bottom: 25, top: 99 },
        { bottom: 'min', top: 'max', text: 'Min-Max' }
    ]

    container.appendChild(selector)
    selector.appendChild(label)
    selector.appendChild(list)
    selector.className = 'activation-summary-range-selector'

    label.className = 'activation-summary-range-selector-label'
    label.innerText = 'select range'

    // handler to change the selected choice
    const change = choice => function(evt) {
        // did the user click, or is this an animation step?
        const fromUser = evt !== undefined

        list.querySelector('.selected').classList.remove('selected')
        choice.dom.classList.add('selected')

        // tell the world...
        eventBus.emit('/summary/range/change', Object.assign({}, choice, { fromUser }))
    }

    // render the choice buttons
    choices.forEach((choice, idx) => {
        const {bottom, top, text=`${bottom}th-${top}th`} = choice,
              dom = document.createElement('li')
        choice.dom = dom
        dom.idx = idx
        list.appendChild(dom)
        dom.onclick = change(choice)  // register onclick change handler
        dom.innerText = text

        if (bottom === defaultBottom && top === defaultTop) {
            // select the default range
            dom.classList.add('selected')
        }
    })

    // render the animate button
    const animate = document.createElement('li')
    list.appendChild(animate)
    animate.innerText = 'Animate'
    const auto = () => {
        if (animate.classList.contains('partially-selected')) {
            // animation in progress
            animate.classList.remove('partially-selected')
            clearInterval(animate.interval)
            return
        }

        animate.classList.add('partially-selected')

        const currentSelection = list.querySelector('.selected')
        let idx = (currentSelection.idx + 1) % choices.length
        const cycle = () => {
            const current = choices[idx]
            idx = (idx + 1) % choices.length    // -1: don't go to animate
            change(current)()
        }

        // change every few seconds
        cycle()
        animate.interval = setInterval(cycle, 1500)

        // listen for user clicks, and kill the interval
        eventBus.on('/summary/range/change', ({fromUser}) => {
            if (fromUser) {
                animate.classList.remove('partially-selected')
                clearInterval(animate.interval)
            }
        })
    }
    animate.onclick = auto

    if (options.auto) {
        // the user asked to start the animation immediately
        auto()
    }

    // render the outliers button
    const outliers = document.createElement('li')
    list.appendChild(outliers)
    outliers.innerText = 'Outliers'
    if (options.outliers) {
        // user asked for this to be the initial state
        outliers.classList.toggle('partially-selected')
    }
    outliers.onclick = () => {
        outliers.classList.toggle('partially-selected')
        eventBus.emit(`/summary/range/outliers/toggle`, { showOutliers: outliers.classList.contains('partially-selected') })
    }

    return {
        // currently selected range
        getCurrentRange: () => choices[list.querySelector('.selected').idx]
    }
}

/**
 * Helper method for drawTable. This was split out, to allow for
 * re-sorting.
 *
 */
const _drawTable = (options, header, content, groupData, eventBus, sorter=defaultSorter, sortDir=+1) => {
    const { groups } = groupData,
          tableHeader = document.createElement('table'),
          tableScrollContainer = document.createElement('div'),
          table = document.createElement('table'),
          ns = namespace.current(),
          nsPattern = new RegExp(`/${ns}/`),
          { ticks:numTicks = 4 } = options      // number of ticks on the x axis of the bar chart

    // clean the container
    ui.removeAllDomChildren(content)

    // let user select the 25-75, min-max, etc. range of interest
    const { getCurrentRange } = addRangeSelector(content, eventBus, defaultBottom, defaultTop, groupData, options)

    // x axis
    const headerRow = tableHeader.insertRow(-1),
          xAxisLabels = [],
          xAxisLeftPad = headerRow.insertCell(-1)
    tableHeader.classList.add('table-header')
    xAxisLeftPad.className = 'x-axis-left-pad'
    if (numTicks === 0) {
        // we still need to insert a cell to fill in the bar column
        headerRow.insertCell(-1)//.classList.add('x-axis-label')
    } else {
        for (let idx = 0; idx < numTicks; idx++) {
            xAxisLabels[idx] = headerRow.insertCell(-1)
            xAxisLabels[idx].classList.add('x-axis-label')
        }
    }
    const xAxisFocusLabelCell = headerRow.insertCell(-1),
          xAxisFocusLabelRange = document.createElement('div'),
          xAxisFocusLabelLeft = document.createElement('div'),
          xAxisFocusLabelRight = document.createElement('div')
    xAxisFocusLabelCell.className = 'x-axis-focus-label-cell'
    xAxisFocusLabelRange.className = 'x-axis-focus-label-range'
    xAxisFocusLabelLeft.className = 'x-axis-focus-label'
    xAxisFocusLabelRight.className = 'x-axis-focus-label'
    xAxisFocusLabelCell.appendChild(xAxisFocusLabelRange)
    xAxisFocusLabelRange.appendChild(xAxisFocusLabelLeft)
    xAxisFocusLabelRange.appendChild(xAxisFocusLabelRight)
    
    const xAxisRightPad1 = headerRow.insertCell(-1),
          xAxisRightPad2 = headerRow.insertCell(-1),
          xAxisRightPad3 = headerRow.insertCell(-1)
    xAxisRightPad1.className = 'cell-numeric cell-successes cell-hide-when-outliers-shown cell-hide-when-focus-shown'
    xAxisRightPad2.className = 'cell-numeric cell-failures cell-hide-when-outliers-shown cell-hide-when-focus-shown'
    xAxisRightPad3.className = 'cell-numeric cell-failures cell-show-only-when-outliers-shown cell-hide-when-focus-shown'
    xAxisRightPad1.innerText = 'Successes'
    xAxisRightPad2.innerText = 'Failures'
    xAxisRightPad3.innerText = 'Outliers'

    /** Render a selected range on the x axis */
    const xAxisToggleFocus = ({bar, this25, this75, left, right}) => {
        const inFocus = content.classList.toggle('x-axis-focus')
        bar.classList.toggle('focus')

        if (inFocus) {
            if (this25 < 100 && this75 < 100) {
                xAxisFocusLabelLeft.innerText = `${this25}${enDash}${prettyPrintDuration(this75)}`
                xAxisFocusLabelRight.innerText = ''
            } else {
                xAxisFocusLabelLeft.innerText = prettyPrintDuration(this25)
                xAxisFocusLabelRight.innerText = prettyPrintDuration(this75)
            }
            xAxisFocusLabelRange.style.left = percent(left)
            xAxisFocusLabelRange.style.width = percent(right - left)
        }
    }

    // add the new elements to the container
    tableScrollContainer.appendChild(table)
    content.appendChild(tableHeader)
    content.appendChild(tableScrollContainer)

    sort(groups, sorter, sortDir)

    table.className = 'data-table cell-container'
    table.setAttribute('color-by', 'duration')
    tableHeader.classList.add('data-table')
    tableScrollContainer.className = 'data-table-scroll-container'

    // header title
    const onclick = options.appName ? drilldownWith(viewName, () => repl.pexec(`app get "${options.appName}"`)) : undefined
    ui.addNameToSidecarHeader(sidecar, options.appName || titleWhenNothingSelected, undefined, onclick)

    // cache rows for redraw
    const rowMap = {}

    const draw = ({bottom:stat25, top:stat75, redraw = false, showOutliers = false}) => {
        const { min25, max75, maxBarRange, max2BarRange, maxRange } = groups.reduce((MM, group) => {
            const thisLeft = group.statData.n[stat25],
                  thisMedian = group.statData.n['50'],
                  thisBarRight = group.statData.n[stat75],
                  thisRight = showOutliers ? group.statData.outlierMax : thisBarRight,
                  thisBarRange = thisBarRight - thisLeft,
                  thisRange = thisRight - thisLeft
            if (MM.min25 === 0 || thisLeft < MM.min25) MM.min25 = thisLeft
            if (MM.max75 === 0 || thisRight > MM.max75) MM.max75 = thisRight
            if (MM.maxBarRange === 0 || thisBarRange > MM.maxBarRange) {
                MM.max2BarRange = MM.maxBarRange
                MM.maxBarRange = thisBarRange
            }
            if ((MM.max2BarRange === 0 || thisBarRange > MM.max2BarRange)
                && thisBarRange < MM.maxBarRange
                && thisMedian < 0.75 * thisRight) {
                MM.max2BarRange = thisBarRange
            }
            if (MM.maxRange === 0 || thisRange > MM.maxRange) MM.maxRange = thisRange
            return MM
        }, { min25: 0, max75: 0, maxBarRange: 0, max2BarRange: 0, maxRange: 0 })

        // turn a value into a x axis coordinate
        const normalize = value => (value - min25) / (max75 - min25)

        // draw the x axis labels
        const labelMin = min25,
              labelRange = maxRange / numTicks
        for (let idx = 0; idx < numTicks; idx++) {
            xAxisLabels[idx].innerText = prettyPrintDuration(labelMin + idx * labelRange)
        }

        // for each group of activations, render a table row
        let alreadyPlacedCountLabel = false
        groups.forEach((group, idx) => {
            // for redraw, we need to walk through the columns...
            let columnIdx = 0

            const row = redraw ? rowMap[group.groupKey] : table.insertRow(-1),
                  label = redraw ? row.cells[columnIdx++] : row.insertCell(-1),
                  labelText = group.groupKey.replace(nsPattern, ''),
                  splitOptions = options.split ? `--split${options.split===true ? '' : ' "' + options.split + '"'} --key "${group.groupKey}"` : '',
                  balloonPos = idx < groups.length - 2 ? 'down' : 'up',
                  { outliers=[] } = group.statData  // extract the list of outliers from the model

            if (!redraw) {
                const labelInner = document.createElement('div')
                label.appendChild(labelInner)

                // cache the row for redrawing later
                rowMap[group.groupKey] = row

                row.setAttribute('data-action-name', labelText)
                row.className = 'grid-cell-occupied'

                labelInner.appendChild(document.createTextNode(labelText))
                label.className = 'cell-label clickable'
                label.setAttribute('data-balloon', `Action Name\u000a\u000a${labelText}`) // line break
                label.setAttribute('data-balloon-break', 'data-balloon-break')
                label.setAttribute('data-balloon-pos', 'right')
                label.setAttribute('data-balloon-length', labelText.length < 20 ? 'fit' : 'large')

                // drill down to grid view; note how we pass through a --name
                // query, to filter based on the clicked-upon row
                //row.onclick = drilldownWith(viewName, () => repl.pexec(`grid ${optionsToString(options)} --zoom 1 --name "${group.path}" ${splitOptions}`))

                if (options.split) {
                    const version = row.insertCell(-1)
                    version.className = 'cell-version'
                    version.innerText = group.version
                }
            }

            // render bar chart cell
            {
                const cell = redraw ? row.cells[columnIdx++] : row.insertCell(-1),
                      barWrapper = redraw ? cell.querySelector('.stat-bar-wrapper') : document.createElement('div'),
                      bar = redraw ? cell.querySelector('.stat-bar') : document.createElement('div'),
                      medianDot = redraw ? cell.querySelector('.stat-median-dot') : document.createElement('div')

                if (!redraw) {
                    cell.appendChild(barWrapper)
                    barWrapper.appendChild(bar)
                    barWrapper.appendChild(medianDot)
                    cell.className = 'cell-stats'
                    barWrapper.className = 'stat-bar-wrapper'
                    bar.className = 'stat-bar'
                    medianDot.className = 'stat-median-dot'
                } else {
                    // if we're redrawing, we need to remove any previous range annotations
                    const indicators = barWrapper.querySelectorAll('.stat-indicator')
                    indicators.forEach(indicator => barWrapper.removeChild(indicator))
                }

                const this25 = group.statData.n[stat25],
                      thisMedian = group.statData.n['50'],
                      this75 = group.statData.n[stat75],
                      this99 = group.statData.n['99'],
                      left = normalize(this25),
                      right = normalize(this75),
                      medianLeft = normalize(thisMedian)

                // 25th versus min
                const th = stat => `${stat}${typeof stat === 'number' ? 'th' : ''}`,
                      th2 = stat => `${stat}${typeof stat === 'number' ? 'th percentile' : ''}`

                bar.style.left = percent(left)
                bar.style.width = percent(right - left)
                medianDot.style.left = `calc(${percent(medianLeft)} - 0.3em)` // 0.3 is half of the width of .activation-viz-plugin .data-table td.cell-stats .stat-median-dot
                medianDot.setAttribute('data-balloon', `Median Duration: ${prettyPrintDuration(thisMedian)}`)
                medianDot.setAttribute('data-balloon-pos', balloonPos)
                // \u000a are line breaks
                /*bar.setAttribute('data-balloon', `Range of Durations: ${th(stat25)}${enDash}${th2(stat75)}\u000a\u000a${typeof stat25 === 'number' ? stat25 + '% are faster than' : stat25 + ' is'} ${prettyPrintDuration(this25)}\u000a${typeof stat75 === 'number' ? (100-stat75) + '% are slower than' : stat75 + ' is'} ${prettyPrintDuration(this75)}`)
                bar.setAttribute('data-balloon-break', 'data-balloon-break')
                bar.setAttribute('data-balloon-length', 'large')
                bar.setAttribute('data-balloon-pos', balloonPos)*/

                bar.onmouseover = () => xAxisToggleFocus({bar, this25, this75, left, right})
                bar.onmouseout = () => xAxisToggleFocus({bar, this25, this75, left, right})

                // add 25th and 75th explainers to widest bar
                if (this75 - this25 === maxBarRange) {
                    // e.g. 25th versus min; and 75th percentile versus max
                    const rightPad = stat => typeof stat === 'number' ? '10.5em' : '3em' // extra room for "th percentile"

                    const indicator25 = document.createElement('div'),
                          indicator75 = document.createElement('div')
                    barWrapper.appendChild(indicator25)
                    barWrapper.appendChild(indicator75)
                    indicator25.className = 'stat-indicator'
                    indicator75.className = 'stat-indicator'
                    indicator25.innerText = `\u25c0 ${th(stat25)}`
                    indicator25.style.left = percent(left + 0.02)
                    indicator75.innerText = `${th2(stat75)} \u25b6`
                    indicator75.style.left = `calc(${percent(right - 0.02)} - ${rightPad(stat75)})`
                }
                if (max2BarRange > 0 && this75 - this25 === max2BarRange) {
                    const indicator50 = document.createElement('div')
                    barWrapper.appendChild(indicator50)
                    indicator50.className = 'stat-indicator'
                    indicator50.innerText = `\u25c0 median`
                    indicator50.style.left = `calc(${percent(medianLeft)} + 1ex + 0.3em)`
                    // 0.3em must match .activation-viz-plugin .data-table td.cell-stats .stat-median-dot width
                }

                // outlier activations
                outliers.forEach(outlier => {
                    // render a dot for each outlier
                    const dot = redraw ? outlier.dom : document.createElement('div'),
                          { activation } = outlier,
                          left = normalize(activation.end - activation.start),
                          duration = activation.end - activation.start
                    if (!redraw) {
                        outlier.dom = dot
                        dot.className = 'outlier-dot cell-show-only-when-outliers-shown'
                        dot.setAttribute('data-balloon', `Slow Activation\u000a\u000aDuration: ${prettyPrintDuration(duration)} (${~~(duration/thisMedian*10)/10}x median duration)`)
                        dot.setAttribute('data-balloon-break', 'data-balloon-break')
                        dot.setAttribute('data-balloon-length', 'large')
                        dot.setAttribute('data-balloon-pos', left < 0.3 ? 'right' : 'left')
                        dot.onclick = drilldownWith(viewName, () => repl.pexec(`activation get ${activation.activationId}`))
                        barWrapper.appendChild(dot)
                    }
                    dot.style.left = percent(left)
                })
            }

            // successful count
            if (!redraw) {
                const cell = row.insertCell(-1),
                      countPart = document.createElement('span')
                cell.className = 'cell-count cell-numeric cell-successes cell-hide-when-outliers-shown'
                cell.setAttribute('data-successes', group.count)
                if (group.nSuccesses === 0) {
                    cell.classList.add('count-is-zero')
                } else {
                    // drill down to grid, showing just successes
                    cell.classList.add('clickable')
                    cell.onclick = drilldownWith(viewName, () => repl.pexec(`grid ${optionsToString(options)} --success --zoom 1 --name "${group.path}" ${splitOptions}`))
                }
                cell.appendChild(countPart)
                countPart.innerText = group.nSuccesses
                countPart.setAttribute('data-balloon', `Successful Activations: ${group.nSuccesses}`)
                countPart.setAttribute('data-balloon-pos', 'left')
            }

            // failure count
            if (!redraw) { 
                const cell = row.insertCell(-1)
                cell.className = 'cell-failures cell-numeric red-text cell-hide-when-outliers-shown'
                cell.setAttribute('data-failures', group.nFailures)

                if (group.nFailures > 0) {
                    const errorPart = document.createElement('span')
                    //errorPartIcon = document.createElement('span')
                    // \u000a is a line break
                    errorPart.setAttribute('data-balloon', `Failed Activations: ${group.nFailures}`)
                    errorPart.setAttribute('data-balloon-break', 'data-balloon-break')
                    errorPart.setAttribute('data-balloon-pos', 'left')
                    errorPart.className = 'count-part'
                    //errorPartIcon.className = 'count-icon'
                    cell.appendChild(errorPart)
                    //cell.appendChild(errorPartIcon)
                    errorPart.innerText = group.nFailures
                    //errorPartIcon.innerText = '\u26a0'
                    errorPart.className = 'cell-errors'

                    // drill down to grid, showing just failures
                    cell.classList.add('clickable')
                    cell.onclick = drilldownWith(viewName, () => repl.pexec(`grid ${optionsToString(options)} --failure --zoom 1 --name "${group.path}" ${splitOptions}`))
                } else {
                    cell.classList.add('count-is-zero')
                }
            }

            // outlier count
            if (!redraw) {
                const cell = row.insertCell(-1),
                      countPart = document.createElement('span'),
                      nOutliers = outliers.length
                cell.className = 'cell-count cell-numeric cell-successes cell-show-only-when-outliers-shown clickable'
                cell.setAttribute('data-outliers', nOutliers)
                if (nOutliers === 0) {
                    cell.classList.add('count-is-zero')
                }
                cell.appendChild(countPart)
                countPart.innerText = nOutliers
                countPart.setAttribute('data-balloon', `Number of Outliers: ${nOutliers}`)
                countPart.setAttribute('data-balloon-pos', 'left')
                cell.onclick = showGridForActivationList(outliers.map(_ => _.activation))
            }

            /*addNumericCell('count')
              addNumericCell('nFailures', true)*/

            /*
              addStat('disparity', '+').classList.add('cell-extra-wide')
              const why = row.insertCell(-1)
              why.classList.add('cell-label')
              why.appendChild(group.statData.why)
            */
        })
    }

    // initial render
    draw({bottom: defaultBottom, top: defaultTop, showOutliers: options.outliers})
    if (options.outliers) {
        // user asked for this as the initial state
        content.classList.toggle('show-outliers')
    }

    eventBus.on('/summary/range/change', range => {
        draw(Object.assign({}, range, { redraw: true }))
    })

    // user requested that we toggle the display of outliers
    eventBus.on('/summary/range/outliers/toggle', ({showOutliers}) => {
        content.classList.toggle('show-outliers')
        draw(Object.assign({}, getCurrentRange(), { redraw: true, showOutliers }))
    })

    return {
        type: 'custom',
        content,
        modes: modes('table', options)
    }
}

/**
 * This is the module
 *
 */
module.exports = (commandTree, require) => {
    const wsk = require('/ui/commands/openwhisk-core'),
          tableIt = cmd => visualize(wsk, commandTree, cmd, 'summary', drawTable,
                                     '\t-w|--w     wider action name column\n\t--ww       even wider action name column')

    wsk.synonyms('activations').forEach(syn => {
        const cmd = commandTree.listen(`/wsk/${syn}/table`, tableIt('table'), { docs: 'Visualize recent activations in a table',
                                                                                needsUI: true, viewName,
                                                                                fullscreen: true, width: 800, height: 600,
                                                                                placeholder: 'Loading activity summary ...'})

        commandTree.listen(`/wsk/${syn}/summary`, tableIt('summary'), cmd)
        commandTree.synonym(`/wsk/${syn}/tab`, tableIt('tab'), cmd)
    })
}
