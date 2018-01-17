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
      { renderCell } = require('./cell'),
      { drilldownWith } = require('./drilldown'),
      { nbsp, enDash, leftArrowHead, rightArrowHead, latencyBuckets, nLatencyBuckets, latencyBucket, optionsToString } = require('./util')

// for future reference, here is a platform way to render percents
//const locale = window.navigator.userLanguage || window.navigator.language
//corrected = isNaN(errorRate) ? 0 : errorRate // we'll get a NaN if there are no activations
//corrected.toLocaleString(locale, { style:'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }),

/**
 * Render the legend in the sidecar header
 *
 * @param options user options from the CLI
 *
 */
exports.drawLegend = (viewName, rightHeader, {statData, errorRate, nFailures}, options) => {
    const existing = rightHeader.querySelector('.grid-header-key'),
          wrapper = existing || document.createElement('div'),
          existing2 = wrapper.querySelector('.cell-container'),
          wrapper2 = existing2 || document.createElement('div')

    if (!existing) {
        rightHeader.appendChild(wrapper)
        wrapper.appendChild(wrapper2)
        wrapper.className = 'activation-viz-plugin grid-header-key'
        wrapper2.className = 'grid-grid zoom_1 cell-container'
    }
    wrapper2.setAttribute('color-by', 'duration')

    /**
     * Render one legend entry
     *
     */
    const entry = (labelText, labelValue, isFailure, latBucket, { zoom = 1, labelAsTooltip = false, useThisLabelInstead, balloonPos, balloonLength = 'small', onclick }={}) => {
        const existing3 = wrapper2.querySelector(`.grid[label="${labelText}"]`),
              wrapper3 = existing3 || document.createElement('div'),
              existingEntry = wrapper3.querySelector('table'),
              entry = existingEntry || document.createElement('table')

        let valueDom
        if (!existing3) {
            const labelRow = entry.insertRow(-1),
                  valueRow = entry.insertRow(-1),
                  gridCellCell = valueRow.insertCell(-1),
                  cell = document.createElement('div'),
                  valueCell = valueRow.insertCell(-1)

            valueDom = document.createElement('div')
            valueCell.classList.add('kind')

            wrapper2.appendChild(wrapper3)
            wrapper3.className = `grid zoom_${zoom}`
            wrapper3.setAttribute('label', labelText)
            gridCellCell.appendChild(cell)
            wrapper3.appendChild(entry)
            cell.className = 'grid-cell grid-cell-occupied'

            renderCell('Legend', cell, null, isFailure, latBucket) // null means no activation associated with cell

            if (onclick) {
                cell.onclick = onclick
            }

            if (labelAsTooltip) {
                const attachTo = gridCellCell
                attachTo.setAttribute('data-balloon', labelText)
                attachTo.setAttribute('data-balloon-pos', balloonPos)
                attachTo.setAttribute('data-balloon-length', balloonLength)
            }

            if (useThisLabelInstead) {
                const labelCell = labelRow.insertCell(-1)
                labelCell.appendChild(document.createTextNode(useThisLabelInstead))
                labelCell.setAttribute('colspan', 2)
                labelCell.className = 'activation-viz-legend-label'
            } else if (!labelAsTooltip) {
                const emptyCell = labelRow.insertCell(-1)
                const labelCell = labelRow.insertCell(-1)
                labelCell.appendChild(document.createTextNode(labelText))
                labelCell.className = 'activation-viz-legend-label'
            }
            valueCell.appendChild(valueDom)
            valueCell.style.lineHeight = '1em'
            gridCellCell.style.paddingRight = '0.5ex'
        } else {
           valueDom = entry.querySelector('.kind > div')
        }

        valueDom.innerText = labelValue
    }

    //
    // find the index of the last non-zero legend entry for the
    // performance squares (latency buckets)
    let lastNonZero = -1
    for (let idx = statData.latBuckets.length - 1; idx >= 0; idx--) {
        if (statData.latBuckets[idx] > 0) {
            lastNonZero = idx
            break
        }
    }

    //
    // if we have at least one non-zero performance bucket, then
    // render the buckets up to that last non-zero bucket
    //
    if (lastNonZero >= 0) {
        latencyBuckets.forEach((latencyRange, idx, A) => {
            const first = idx === 0,
                  last = idx === A.length - 1,
                  isLastNonZero = idx === lastNonZero,
                  lower = idx === 0 ? 0 : A[idx - 1],
                  upper = latencyRange,
                  roughlySame = upper - lower < 1000 && (lower < 1000 && upper < 1000 || lower > 1000 && upper > 1000)

            // roughlySame means e.g. 50-100ms versus 500ms-1s; both
            // are "close", but the second one splits into a new range
            
            const labelText = last
                  ? `${prettyPrintDuration(latencyRange)}+` // special label for the last latency bucket
                  : roughlySame ? `${lower}${enDash}${prettyPrintDuration(upper)}`
                  : `${prettyPrintDuration(lower)}${enDash}${prettyPrintDuration(upper)}`

            // number of cells with this coloration
            const count = statData.latBuckets[idx]

            if (count > 0) {
                entry(labelText, count, false, idx, // false means not a failure
                    { zoom: -1, labelAsTooltip: true,
                      balloonPos: idx < ~~(nLatencyBuckets / 2) - 1? 'right' : 'left',
                      useThisLabelInstead: first ? `${leftArrowHead} fastest` : isLastNonZero ? `slowest ${rightArrowHead}` : nbsp,
                      onclick: drilldownWith(viewName, () => repl.pexec(`grid ${optionsToString(options)} --success --latency-bucket ${idx}`))
                    })
            }
        })
    }

    //
    // render the legend entry for failures
    //
    entry('Failing Invocations',
        nFailures,
        true, 0, // true means render as failure
          { zoom: -1, labelAsTooltip: true, useThisLabelInstead: 'failures', balloonPos: 'up', balloonLength: 'medium',
            onclick: drilldownWith(viewName, () => repl.pexec(`grid ${optionsToString(options)} --failure`))
          })
}
