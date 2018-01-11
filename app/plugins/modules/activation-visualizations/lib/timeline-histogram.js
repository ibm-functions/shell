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
      { ready, transparent, titleWhenNothingSelected, latencyBucket, latencyBucketRange, nLatencyBuckets, displayTimeRange, visualize } = require('./util')

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
    const onclick = options.appName ? drilldownWith(viewName, () => repl.pexec(`app get "${options.appName}"`)) : undefined
    ui.addNameToSidecarHeader(sidecar, options.appName || titleWhenNothingSelected, undefined, onclick)

    // add time range to the sidecar header
    const groupData = groupByAction(activations, Object.assign({ groupBySuccess: true }, options))
    displayTimeRange(groupData, header.leftHeader)

    ready().then(_drawTimeline({ options, header, content, timelineData: groupData.timeline }))

    return {
        type: 'custom',
        content,
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
const prepare = timelineData => {
    const { success, failure, cost, nBuckets, first, interval} = timelineData,
          fill = true,     // we want all of the bars to be filled in
          borderWidth = 0  // for bars

    const data = {
        labels: [],
        datasets: [
            { type: 'bar', fill, borderWidth, label: 'Successes', data: success },
            { type: 'bar', fill, borderWidth, label: 'Failures', data: failure },
            { type: 'line', fill: true, borderWidth: 6, pointBorderWidth: 3, pointBackgroundColor: 'rgba(255,255,255,0.5)', pointRadius: 3, borderDash: [1,4], label: 'Cumulative Cost', data: accumulate(cost), yAxisID: 'cost' }
        ]
    }

    // make the label model for the x axis
    const { labels } = data
    for (let idx = 0; idx < nBuckets; idx++) {
        labels.push(first + idx * interval)
    }

    //console.error(data)
    //console.error(labels)

    return { data, labels }
}

/**
 * Helper method for drawTimeline. This was split out, to allow for
 * re-sorting.
 *
 */
const _drawTimeline = ({options, content, timelineData}) => () => {
    const timeFormat = 'MM/DD/YYYY HH:mm',
          { colors } = require(`../themes/${options.theme || 'coral'}`)

    /** render the chart */
    const render = ({data, labels}) => {
          // clean the container
        ui.removeAllDomChildren(content)

        const canvas = document.createElement('canvas'),
              ctx = canvas.getContext('2d')
        content.appendChild(canvas)
        canvas.style.padding = '1em 0 1em 1em'

        const { fontFamily, success, failure, cost, borderWidth = 1, fontSize = 14, tickFontSize = 12, chart:chartStyle, fontColor='#333', gridLinesColor=transparent(fontColor,0.1) } = colors(ctx)
        data.datasets[0].borderColor = success.border
        data.datasets[0].backgroundColor = success.bg
        data.datasets[1].borderColor = failure.border
        data.datasets[1].backgroundColor = failure.bg
        data.datasets[2].borderColor = cost.border
        data.datasets[2].backgroundColor = cost.bg

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

        const chart = new Chart(ctx, {
            type: 'bar',
            data,
            labels,
            options: {
                responsive: true,
                maintainAspectRatio: false,
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
                            labelString: '# Activations'
                        },
                    }, {
                        type: 'linear',
                        id: 'cost',
                        beginAtZero: true,
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
                            labelString: 'Cumulative Cost per Million Activations'
                        },
                    }]
                }
            }
        })

        return chart
    }

    return render(prepare(timelineData))
}


/**
 * This is the module
 *
 */
module.exports = (commandTree, prequire) => {
    const wsk = prequire('/ui/commands/openwhisk-core'),
          mkCmd = (cmd, extraOptions) => visualize(wsk, commandTree, cmd, viewName, drawTimeline, '\t--theme    <orange-cyan|coral|acacia|highcharts|ibm> [default=ibm]\n\t--nBuckets configure the number of buckets along the x axis [default=20]', extraOptions),
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
