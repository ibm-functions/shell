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
      { summary:usage } = require('../usage'),
      { leftArrowHead, rightArrowHead, newline, enDash, emDash, optionsToString, titleWhenNothingSelected, latencyBucket, displayTimeRange, visualize } = require('./util'),
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
        dom.setAttribute('data-choice', choice)
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
    animate.setAttribute('data-choice', 'animate')
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
    outliers.setAttribute('data-choice', 'outliers')
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
          xAxisFocusLabelMiddle = document.createElement('div'),
          xAxisFocusLabelRight = document.createElement('div')
    xAxisFocusLabelCell.className = 'x-axis-focus-label-cell'
    xAxisFocusLabelRange.className = 'x-axis-focus-label-range'
    xAxisFocusLabelLeft.className = 'x-axis-focus-label'
    xAxisFocusLabelRight.className = 'x-axis-focus-label'
    xAxisFocusLabelCell.appendChild(xAxisFocusLabelRange)
    xAxisFocusLabelRange.appendChild(xAxisFocusLabelLeft)
    xAxisFocusLabelRange.appendChild(xAxisFocusLabelMiddle)
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

    // set the focus range to be in the middle so we get some animation on first hover
    xAxisFocusLabelRange.style.left = percent(0.5)
    xAxisFocusLabelRange.style.width = 0

    /** Render a selected range on the x axis */
    const xAxisToggleFocus = ({barWrapper, this25, this75, left, right}) => {
        const inFocus = content.classList.toggle('x-axis-focus')
        barWrapper.classList.toggle('focus')

        if (inFocus) {
            // this will house the enDash for e.g. 1.1-1.3s
            xAxisFocusLabelMiddle.innerText = ''

            const pretty25 = prettyPrintDuration(this25),
                  pretty75 = prettyPrintDuration(this75),
                  split25 = pretty25.match(/[^\d]/).index,
                  split75 = pretty75.match(/[^\d]/).index,
                  num25 = pretty25.substring(0, split25),
                  unit25 = pretty25.substring(split25),
                  num75 = pretty75.substring(0, split75),
                  unit75 = pretty75.substring(split75),
                  sameUnit = unit25 === unit75,
                  rangeLessThanOne = sameUnit && num75 - num25 < 1,
                  superNarrow = right - left < 0.05,
                  veryNarrow = right - left < 0.25

            if (superNarrow) {
                xAxisFocusLabelRight.classList.add('no-border')
            } else {
                xAxisFocusLabelRight.classList.remove('no-border')
            }

            if (rangeLessThanOne || superNarrow) {
                // e.g. 32-32ms, just show 32ms!
                xAxisFocusLabelLeft.innerText = pretty75
                xAxisFocusLabelMiddle.innerText = ''
                xAxisFocusLabelRight.innerText = ''

            } else if (veryNarrow && sameUnit) {
                // or close together? here, we need a prettyPrint on
                // the lower bound; e.g. 1.2-1.6s
                xAxisFocusLabelLeft.innerText = num25
                xAxisFocusLabelMiddle.innerText = enDash
                xAxisFocusLabelRight.innerText = pretty75

            } else {
                xAxisFocusLabelLeft.innerText = pretty25
                xAxisFocusLabelMiddle.innerText = ''
                xAxisFocusLabelRight.innerText = pretty75
            }

            xAxisFocusLabelRange.style.left = percent(left)
            xAxisFocusLabelRange.style.width = percent(right - left)
        } else {
            // on mouseleave, move the labels to the center
            xAxisFocusLabelRange.style.left = percent(0.5)
            xAxisFocusLabelRange.style.width = 0
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
    const onclick = options.name ? drilldownWith(viewName, `app get "${options.name}"`) : undefined
    ui.addNameToSidecarHeader(sidecar, options.name || titleWhenNothingSelected, undefined, onclick)

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
                && thisBarRange < MM.maxBarRange) {
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
                  splitOptions = options.split ? `--split${options.split===true ? '' : ' "' + options.split + '"'} --key "${group.groupKey}"` : '',
                  balloonPos = idx === 0 || idx < groups.length - 2 ? 'down' : 'up',
                  { outliers=[] } = group.statData  // extract the list of outliers from the model

            if (!redraw) {
                const labelInner = document.createElement('div'),
                      labelPackage = document.createElement('div'),
                      labelAction = document.createElement('div'),
                      labelSplit = group.groupKey.split('/'),
                      packageName = labelSplit.length === 4 && labelSplit[2],
                      actionName = labelSplit[labelSplit.length - 1],
                      nameWithoutNamespace = labelSplit.slice(2).join('/')

                label.appendChild(labelInner)
                if (packageName) {
                    labelInner.appendChild(labelPackage)
                    labelPackage.innerText = packageName
                    labelPackage.className = 'package-prefix'
                }
                labelInner.appendChild(labelAction)
                labelAction.innerText = actionName

                // cache the row for redrawing later
                rowMap[group.groupKey] = row

                row.setAttribute('data-action-name', nameWithoutNamespace)
                row.className = 'grid-cell-occupied'

                label.className = 'cell-label'
                labelAction.className = 'clickable'
                label.onclick = drilldownWith(viewName, `action get ${group.path}`)

                if (nameWithoutNamespace.length > 20) {
                    label.setAttribute('data-balloon', nameWithoutNamespace) // line break
                    label.setAttribute('data-balloon-pos', 'right')
                    label.setAttribute('data-balloon-length', nameWithoutNamespace.length < 20 ? 'fit' : 'large')
                }

                // drill down to grid view; note how we pass through a --name
                // query, to filter based on the clicked-upon row
                //row.onclick = drilldownWith(viewName, `grid ${optionsToString(options)} --zoom 1 --name "${group.path}" ${splitOptions}`)

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

                // fancy focus, to show the extent of the bar on the x axis!
                const doFocus = () => xAxisToggleFocus({barWrapper, this25, this75, left, right}),
                      focus = dom => {
                          dom.onmouseenter = doFocus
                          dom.onmouseleave = doFocus
                      }

                // install the fancy focus handlers
                focus(bar)

                // add 25th and 75th explainers to widest bar
                if (this75 - this25 === maxBarRange) {
                    // e.g. 25th versus min; and 75th percentile versus max
                    const kindaNarrow = right - left < 0.4,
                          veryNarrow = right - left < 0.25,
                          veryFarRight = right > 0.95,
                          veryFarLeft = left < 0.05

                    const thFor75 = kindaNarrow ? th : th2  // no space for "percentile"
                    const rightPad = stat => typeof stat === 'number' && !kindaNarrow ? '10.5em' : '3.5em' // extra room for "th percentile"

                    const indicator25 = document.createElement('div'),
                          indicator75 = document.createElement('div')
                    barWrapper.appendChild(indicator25)
                    barWrapper.appendChild(indicator75)
                    indicator25.className = 'stat-indicator'
                    indicator75.className = 'stat-indicator'
                    if (!veryNarrow) {
                        indicator25.innerText = `${leftArrowHead} ${th(stat25)}`
                        indicator25.style.left = percent(left + 0.02)
                        indicator75.innerText = `${thFor75(stat75)} ${rightArrowHead}`
                        indicator75.style.left = `calc(${percent(right - 0.02)} - ${rightPad(stat75)})`
                    } else if (veryFarRight) {
                        // bar is not wide at all, and ends very far to the RIGHT
                        indicator25.innerText = `${th(stat25)} ${rightArrowHead}`
                        indicator25.style.left = `calc(${percent(left)} - 8ex)`
                        indicator75.innerText = `${thFor75(stat75)} ${rightArrowHead}`
                        indicator75.style.left = `calc(${percent(right - 0.02)} - ${rightPad(stat75)})`
                    } else if (veryFarLeft) {
                        // bar is not wide at all, and ends very far to the LEFT
                        indicator25.innerText = `${leftArrowHead} ${th(stat25)}`
                        indicator25.style.left = percent(left + 0.02)
                        indicator75.innerText = `${leftArrowHead} ${thFor75(stat75)}`
                        indicator75.style.left = `calc(${percent(right)} + 1ex)`
                    }

                    // still focus when the mouse flies over the indicators
                    focus(indicator25)
                    focus(indicator75)
                }

                // add < median indicator to the second widest bar
                // whose median isn't "too far right"
                const showMedianIndicator = max2BarRange > 0 && this75 - this25 === max2BarRange
                if (showMedianIndicator) {
                    const indicator50 = document.createElement('div')
                    barWrapper.appendChild(indicator50)
                    indicator50.className = 'stat-indicator'
                    if (medianLeft < 0.85) {
                        indicator50.innerText = `${leftArrowHead} median`
                        indicator50.style.left = `calc(${percent(medianLeft)} + 1ex + 0.3em)`
                    } else {
                        // otherwise, place the median indicator on the left side
                        indicator50.innerText = `median ${rightArrowHead}`
                        indicator50.style.left = `calc(${percent(medianLeft)} - 10ex - 0.3em)`
                    }
                    // 0.3em must match .activation-viz-plugin .data-table td.cell-stats .stat-median-dot width

                    // still focus when the mouse flies over the indicator
                    focus(indicator50)
                }

                // an element to show the median of this bar
                medianDot.style.left = percent(medianLeft)
                medianDot.setAttribute('data-balloon', prettyPrintDuration(thisMedian))
                medianDot.setAttribute('data-balloon-length', 'small')
                medianDot.setAttribute('data-balloon-pos', 'right')
                focus(medianDot)

                // outlier activations
                outliers.forEach(outlier => {
                    // render a dot for each outlier
                    const dot = redraw ? outlier.dom : document.createElement('div'),
                          { activation } = outlier,
                          { total: duration, start, reasons } = group.statData.explainOutlier(activation),
                          left = normalize(duration)

                    if (!redraw) {
                        outlier.dom = dot
                        dot.className = 'outlier-dot cell-show-only-when-outliers-shown'
                        dot.onclick = drilldownWith(viewName, `activation get ${activation.activationId}`)
                        barWrapper.appendChild(dot)

                        // try to explain why it's slow
                        if (reasons.length > 0) {
                            const { why } = reasons[0],
                                  render = reasons => reasons.map(({why, disparity}) => `${why}: +${prettyPrintDuration(disparity)}`).join(newline)
                            dot.setAttribute('why-is-it-slow', why)

                            // tooltip metadata
                            const tooltip = `${prettyPrintDuration(duration)} (${~~(duration/thisMedian*10)/10}x the median)\u000a\u000a${render(reasons)}`
                            dot.setAttribute('data-balloon', tooltip)
                            dot.setAttribute('data-balloon-break', 'data-balloon-break')
                            dot.setAttribute('data-balloon-length', 'large')
                            dot.setAttribute('data-balloon-pos', balloonPos)
                            if (left > 0.8) dot.setAttribute('data-balloon-far', 'right')
                        }
                    }

                    // focus the x axis on the bar, even when hovering over the outlier dots
                    focus(dot)
                    dot.style.left = percent(Math.min(left, 1)) // if we aren't showing outliers, yet, they'll flow off the right
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
                    cell.classList.remove('clickable')
                } else {
                    // drill down to grid, showing just successes
                    cell.classList.add('clickable')
                    cell.onclick = drilldownWith(viewName, `grid ${optionsToString(options)} --success --zoom 1 --name "${group.path}" ${splitOptions}`)
                }
                cell.appendChild(countPart)
                countPart.innerText = group.nSuccesses
                //countPart.setAttribute('data-balloon', `Successful Activations: ${group.nSuccesses}`)
                //countPart.setAttribute('data-balloon-pos', 'left')
            }

            // failure count
            if (!redraw) { 
                const cell = row.insertCell(-1)
                cell.className = 'cell-failures cell-numeric red-text cell-hide-when-outliers-shown'
                cell.setAttribute('data-failures', group.nFailures)

                const errorPart = document.createElement('span')
                //errorPartIcon = document.createElement('span')
                // \u000a is a line break
                //errorPart.setAttribute('data-balloon', `Failed Activations: ${group.nFailures}`)
                //errorPart.setAttribute('data-balloon-break', 'data-balloon-break')
                //errorPart.setAttribute('data-balloon-pos', 'left')
                errorPart.className = 'count-part'
                //errorPartIcon.className = 'count-icon'
                cell.appendChild(errorPart)
                //cell.appendChild(errorPartIcon)
                errorPart.innerText = group.nFailures || emDash  // show emDash when the value is zero
                //errorPartIcon.innerText = '\u26a0'
                errorPart.className = 'cell-errors'

                // drill down to grid, showing just failures
                cell.classList.add('clickable')
                cell.onclick = drilldownWith(viewName, `grid ${optionsToString(options)} --failure --zoom 1 --name "${group.path}" ${splitOptions}`)
                if (group.nFailures === 0) {
                    cell.classList.add('count-is-zero')
                    cell.classList.remove('clickable')
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
                    nOutliers.classList.remove('clickable')
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
        modes: modes(viewName.toLowerCase(), options)
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

    const opts = { usage,
                   needsUI: true, viewName,
                   fullscreen: true, width: 800, height: 600,
                   placeholder: 'Loading activity summary ...'}
    
    wsk.synonyms('activations').forEach(syn => {
        const cmd = commandTree.listen(`/wsk/${syn}/table`, tableIt('table'), opts)

        commandTree.listen(`/wsk/${syn}/summary`, tableIt('summary'), opts)
        commandTree.synonym(`/wsk/${syn}/tab`, tableIt('tab'), cmd, opts)
    })
}
