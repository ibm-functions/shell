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
      { groupByAction } = require('./grouping'),
      { sort, numericalGroupKeySorter:defaultSorter } = require('./sorting'),
      { modes } = require('./modes'),
      { timeline:usage } = require('../usage'),
      { ready, transparent, optionsToString, titleWhenNothingSelected, latencyBucket, latencyBucketRange, nLatencyBuckets, displayTimeRange, visualize } = require('./util')

const viewName = 'Timeline'

/**
 * Visualize the activation data
 *
 */
const drawTimeline = (options, header) => activations => {
    // this needs *only* to contain the chart; see the "basic requirement" link a few lines down
    const content = document.createElement('div')
    content.className = 'activation-viz-plugin'

    // some bits to enable responsive charts, i.e. auto-adjusting as container resizes
    content.style.position = 'relative' // basic requirement; see http://www.chartjs.org/docs/latest/general/responsive.html#important-note
    content.style.width = 0             // ugh, chrome doesn't trigger a resize on shrink; see https://stackoverflow.com/a/7985973

    // header title
    const onclick = options.name ? drilldownWith(viewName, `app get "${options.name}"`) : undefined
    ui.addNameToSidecarHeader(sidecar, options.name || titleWhenNothingSelected, undefined, onclick)

    // add time range to the sidecar header
    const groupData = groupByAction(activations, Object.assign({ groupBySuccess: true }, options))
    displayTimeRange(groupData, header.leftHeader)

    ready().then(_drawTimeline({ options, header, content, timelineData: groupData.timeline }))

    return {
        type: 'custom',
        content,
        controlHeaders: true,
        modes: modes('timeline', options)
    }
}

/**
 * Generate a CDF from a PDF
 *
 */
const accumulate = PDF => PDF.reduce((CDF, density, idx) => {
    CDF[idx] = ~~(density + (idx === 0 ? 0 : CDF[idx-1]))
    return CDF
}, Array(PDF.length).fill(0))

/**
 * Prepare the data models
 *
 */
const prepare = (timelineData, theme) => {
    const { success, failure, cost, nBuckets, first, last, interval} = timelineData,
          fill = true,     // we want all of the bars to be filled in
          borderWidth = 0  // for bars

    // hover effect
    const hover = color => Color(color.bg).darken(0.25).saturate(2).rgbString()

    const data = {
        labels: [],
        datasets: [
            { type: 'line', fill: false, borderWidth: theme.cost.borderWidth||6, pointBorderWidth: 3, pointBackgroundColor: theme.cost.pointBackgroundColor || 'rgba(255,255,255,0.5)', pointRadius: theme.cost.pointRadius === undefined ? 3 :theme.cost.pointRadius, pointHoverRadius: 6,
              borderDash: [12,1], label: 'Cumulative Cost', data: accumulate(cost), yAxisID: 'cost',
              borderColor: theme.cost.border, backgroundColor: theme.cost.bg},
            { type: 'bar', fill, borderWidth, label: 'Successes', data: success, hoverBackgroundColor: hover(theme.success), borderColor: theme.success.border, backgroundColor: theme.success.bg },
            { type: 'bar', fill, borderWidth, label: 'Failures', data: failure, hoverBackgroundColor: hover(theme.failure), borderColor: theme.failure.border, backgroundColor: theme.failure.bg }
        ]
    }

    // make the label model for the x axis
    const { labels } = data
    for (let idx = 0; idx < nBuckets; idx++) {
        labels.push(first + idx * interval)
    }

    //console.error(data)
    //console.error(labels)

    // because of rounding, we need to remember "last" so that
    // drilldown from the last bucket works; see shell issue #224
    return { data, labels, last }
}

/**
 * Helper method for drawTimeline. This was split out, to allow for
 * re-sorting.
 *
 */
const _drawTimeline = ({options, content, timelineData}) => () => {
    const timeFormat = 'MM/DD/YYYY HH:mm',
          { colors } = require(`../themes/${options.theme || 'colorbrewer1'}`)

    /** render the chart */
    const render = () => {
          // clean the container
        ui.removeAllDomChildren(content)

        // create the canvas that ChartJS needs
        const canvas = document.createElement('canvas'),
              ctx = canvas.getContext('2d')
        content.appendChild(canvas)
        canvas.style.padding = '1em 0 1em 1em'

        // prepare the data models
        const theme = colors(ctx)
        const {data, labels, last} = prepare(timelineData, theme)

        const { fontFamily, success, failure, cost, borderWidth = 1, fontSize = 12, tickFontSize = 12, chart:chartStyle, fontColor='#333', gridLinesColor=transparent(fontColor,0.1) } = theme

        if (chartStyle && chartStyle.backgroundColor) {
            content.style.background = chartStyle.backgroundColor;
        }

        const range = labels[labels.length - 1] - labels[0],
              ONE_SECOND = 1000,
              ONE_MINUTE = 60 * ONE_SECOND,
              ONE_HOUR = 60 * ONE_MINUTE,
              ONE_DAY = 24 * ONE_HOUR,
              ONE_WEEK = 7 * ONE_DAY,
              ONE_MONTH = 4 * ONE_WEEK,
              overflow = 5

        // reset mouse cursor after a hover event; ugh, this requires a plugin, at least as of ChartJS 2.7.1
        // see https://github.com/jtblin/angular-chart.js/issues/598
        Chart.plugins.register({
            afterEvent: function(chartInstance, chartEvent) {
                const elements = chart.getElementsAtEventForMode(event, 'point')
                if (elements.length === 1 && elements[0]._datasetIndex < 2) {
                    // then the mouse is currently over a bar; don't
                    // reset the hover effect just yet
                    return
                }

                // otherwise, reset the hover effect if the mouse is now outside the legend
                var legend = chartInstance.legend;
                var canvas = chartInstance.chart.canvas;
                var x = chartEvent.x;
                var y = chartEvent.y;
                var cursorStyle = 'default';
                if (x <= legend.right && x >= legend.left &&
                    y <= legend.bottom && y >= legend.top) {
                    for (var i = 0; i < legend.legendHitBoxes.length; ++i) {
                        var box = legend.legendHitBoxes[i];
                        if (x <= box.left + box.width && x >= box.left &&
                            y <= box.top + box.height && y >= box.top) {
                            cursorStyle = 'pointer';
                            break;
                        }
                    }
                }
                canvas.style.cursor = cursorStyle;
            }
        })

        const chart = new Chart(ctx, {
            type: 'bar',
            data,
            labels,
            options: {
                events: ['click', 'mousemove', 'mouseout'],
                onHover: (event, entry) => {
                    const elements = chart.getElementsAtEventForMode(event, 'point')
                    if (elements.length === 1 && elements[0]._datasetIndex < 2) {
                        canvas.style.cursor = 'pointer'
                    } else {
                        canvas.style.cursor = 'default'
                    }
                },
                responsive: true,
                maintainAspectRatio: false,
                hover: {
                    animationDuration: 100,
                    mode: 'point' // only highlight the hovered bar; the default is to highlight the whole stack
                },
                tooltips: {
                    mode: 'nearest',
                    intersect: true,
                    titleFontFamily: fontFamily,
                    bodyFontFamily: fontFamily,
                    footerFontFamily: fontFamily,
                    callbacks: {
                        label: (tooltipItem, data) => {
                            if (tooltipItem.datasetIndex === 2) {
                                return `$${tooltipItem.yLabel} per million, cumulatively`
                            } else {
                                return `${data.datasets[tooltipItem.datasetIndex].label}: ${tooltipItem.yLabel}`
                            }
                        }
                    }
                },
                legend: {
                    //reverse: true,
                    onHover: function(event, entry) {
                        canvas.style.cursor = 'pointer'
                    },
                    onClick: (event, {datasetIndex}) => {
                        if (datasetIndex < 2) {
                            const filter = datasetIndex === 0 ? 'success' : 'failure'
                            drilldownWith(viewName, `grid ${optionsToString(options)} --${filter}`)()
                        }
                    },
                    labels: {
                        fontFamily,
                        fontColor,
                        fontSize,
                        padding: 20,
                        usePointStyle: true
                    }
                },
                scales: {
                    xAxes: [{
                        type: 'time',
                        stacked: true,
                        ticks: {
                            fontFamily,
                            fontSize: tickFontSize,
                            fontColor,
                            maxRotation: 20,
                            autoSkip: true
                        },
                        gridLines: {
                            color: gridLinesColor,
                        },
                        scaleLabel: {
                            display: true,
                            //fontStyle: 'bold',
                            fontFamily,
                            fontColor,
                            fontSize,
                            labelString: 'Time'
                        },
                        time: {
                            min: labels[0] - (labels[labels.length - 1] - labels[0]) / labels.length / 2,
                            max: labels[labels.length - 1] + (labels[labels.length - 1] - labels[0]) / labels.length / 2,
                            unit: range > overflow * ONE_MONTH ? 'month' : range > overflow * ONE_WEEK ? 'week' : range > overflow * ONE_DAY ? 'day' : range > overflow * ONE_HOUR ? 'hour' : 'second',
			    tooltipFormat: timeFormat
                        }
                    }],
                    yAxes: [{
                        type: 'linear',
                        stacked: true,
                        beginAtZero: true,
                        gridLines: {
                            color: gridLinesColor,
                        },
                        ticks: {
                            fontFamily,
                            fontSize: tickFontSize,
                            fontColor,
                        },
                        scaleLabel: {
                            display: true,
                            //fontStyle: 'bold',
                            fontFamily,
                            fontSize,
                            fontColor,
                            labelString: 'Activations'.toUpperCase()
                        },
                    }, {
                        type: 'linear',
                        id: 'cost',
                        beginAtZero: true,
                        stacked: true,      // <--- at least in ChartJS 2.7.1, this is required to make beginAtZero work. ¯\_(ツ)_/¯
                        position: 'right',
                        gridLines: {
                            display: false,
                        },
                        ticks: {
                            fontFamily,
                            fontSize: tickFontSize,
                            fontColor,
                            callback: (value, idx, values) => {
                                return `$${value}`
                            }
                        },
                        scaleLabel: {
                            display: true,
                            //fontStyle: 'bold',
                            fontFamily,
                            fontSize,
                            fontColor,
                            labelString: 'Cumulative Cost per Million Activations'.toUpperCase()
                        },
                    }]
                }
            }
        })

        /*chart.onHover = (event, entry) => {
            console.error(entry)
            return
            const elements = chart.getElementsAtEventForMode(event, 'point')
            if (elements.length === 1) {
                canvas.style.cursor = 'pointer'
            } else {
                canvas.style.cursor = 'default'
            }
        }*/

        canvas.onclick = event => {
            const elements = chart.getElementsAtEventForMode(event, 'point')
            if (elements.length === 1) {
                const { _datasetIndex, _index } = elements[0],
                      timeRangeStart = labels[_index],
                      timeRangeEnd = _index === labels.length - 1 ? last : labels[_index + 1]
                if (_datasetIndex <= 2) {
                    const filter = _datasetIndex === 1 ? 'success' : 'failure'
                    drilldownWith(viewName, `grid ${optionsToString(options)} --since ${timeRangeStart} --upto ${timeRangeEnd} --${filter}`)()
                }
            }
        }

        return chart
    }

    return render()
}


/**
 * This is the module
 *
 */
module.exports = (commandTree, prequire) => {
    // disabled for now shell issue #794
    return

    const wsk = prequire('/ui/commands/openwhisk-core'),
          mkCmd = (cmd, extraOptions) => visualize(wsk, commandTree, cmd, viewName, drawTimeline, extraOptions),
          timelineIt = mkCmd('timeline'),
          pollingTimeline = mkCmd('...', { live: true })

    // a command that is a bit instructional as to what is going on
    // this if for the tray-launched scenario
    commandTree.listen('/loading/activity/timeline/...', function() {
        return /*repl.qexec('mirror poll')*/Promise.resolve(true)
            .then(() => pollingTimeline.apply(undefined, arguments))
    }, { hide: true })

    wsk.synonyms('activations').forEach(syn => {
        commandTree.listen(`/wsk/${syn}/timeline`, timelineIt, { usage, needsUI: true,
                                                                 viewName,
                                                                 fullscreen: true, width: 800, height: 600,
                                                                 placeholder: 'Loading activity timeline ...'})
    })
}
