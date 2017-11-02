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
      { latencyBucket } = require('./util')

/**
 * Render the legend in the sidecar header
 *
 */
exports.drawLegend = (rightHeader, {statData, errorRate}) => {
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

    const key = (labelText, labelValue, isFailure, latBucket) => {
        const existing3 = wrapper2.querySelector('.grid'),
              wrapper3 = existing3 || document.createElement('div'),
              existingEntry = wrapper3.querySelector('table'),
              entry = existingEntry || document.createElement('table')

        let valueDom
        if (!existing3) {
            const labelRow = entry.insertRow(-1),
                  valueRow = entry.insertRow(-1),
                  gridCellCell = valueRow.insertCell(-1),
                  cell = document.createElement('div'),
                  emptyCell = labelRow.insertCell(-1),
                  labelCell = labelRow.insertCell(-1),
                  valueCell = valueRow.insertCell(-1)

            valueDom = document.createElement('div')
            valueCell.classList.add('kind')

            wrapper2.appendChild(wrapper3)
            wrapper3.className = 'grid'
            gridCellCell.appendChild(cell)
            wrapper3.appendChild(entry)
            cell.className = 'grid-cell grid-cell-occupied'

            renderCell('Legend', cell, null, isFailure, latBucket) // null means no activation associated with cell

            labelCell.appendChild(document.createTextNode(labelText))
            valueCell.appendChild(valueDom)
            //labelCell.classList.add('deemphasize')
            valueCell.style.lineHeight = '1em'
            gridCellCell.style.paddingRight = '0.5ex'
        } else {
           valueDom = entry.querySelector('.kind > div')
        }

        valueDom.innerText = labelValue
    }

    // install legend entries for the 25th, 50th, 95th, etc. percentiles
    /*for (let n in statData.n) {
        if (n != 95) { // prune the header content a bit; single equals important
            const latency = statData.n[n]
            key(`${n}%:`, prettyPrintDuration(latency), false, latencyBucket(latency)) // false means not a failure
        }
        }*/

    //key(`Error Rate`, `${(100 * errorRate).toFixed(1)}%`, true, 0) // true means render as failure
    const locale = window.navigator.userLanguage || window.navigator.language,
          corrected = isNaN(errorRate) ? 0 : errorRate // we'll get a NaN if there are no activations
    key('Error Rate',
        corrected.toLocaleString(locale, { style:'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }),
        true, 0) // true means render as failure
}
