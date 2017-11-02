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
      { latencyBucket } = require('./util')

/**
 * Draw the given activation in the given cell (a dom)
 *
 */
exports.renderCell = (returnTo, cell, activation, isFailure=!activation.response.success, latBucket=latencyBucket(activation.end - activation.start), options) => {
    let returnValue = cell
    if (!cell) {
        // then the caller asked us to make the container
        cell = document.createElement('div')
        cell.className = 'activation-viz-plugin'

        const inner = document.createElement('div')
        inner.className = 'grid cell-container'
        inner.setAttribute('color-by', 'duration')
        cell.appendChild(inner)

        const inner2 = document.createElement('div')
        inner2.classList.add('grid-cell')
        if (activation.end) inner2.classList.add('grid-cell-occupied')
        inner.appendChild(inner2)

        // the rest of the code will attach to the inner, but we return the outer
        returnValue = cell
        cell = inner2
    }

    const container = document.createElement('div')
    cell.appendChild(container)

    cell.className = `${cell.className} is-failure-${isFailure}`
    container.className = `grid-cell-content latency-${latBucket}`

    //label = document.createElement('div')
    // container.appendChild(label)
    // label.className = 'cell-label'
    // label.innerText = labelText || ''

    if (isFailure) {
        const fdom = document.createElement('div')
        fdom.className = 'grid-oops-overlay'
        container.appendChild(fdom)
    }

    if (activation) {
        cell.onclick = drilldownWith(returnTo, () => repl.pexec(`wsk activation get ${activation.activationId}`), cell)

        // tooltip
        const result = activation.response && activation.response.result
              && activation.response.result,
              statusCode = isFailure && result && (result.code || result.statusCode
                                                   || (result.error && (result.error.code || result.error.statusCode))),
              errorMessage = isFailure && result && (result.message
                                                     || (result.error && result.error.message))

        // failure versus success message for tooltip
        msg = isFailure
            ? 'FAILED' + (statusCode ? ` with status code ${statusCode}` : '') + (errorMessage ? `: ${errorMessage}` : '')
        : activation.end ? `completed in ${prettyPrintDuration(activation.end - activation.start)}`
        : ''

        //cell.setAttribute('data-activation-id', activation.activationId)
        cell.id = activation.activationId
        cell.setAttribute('data-action-name', activation.name)
        cell.setAttribute('data-balloon', `${options && options.nameInTooltip ? activation.name + ' action, invoked ' : ''}${ui.prettyPrintTime(activation.start, 'short')}, and ${msg}`)
        cell.setAttribute('data-balloon-pos', 'up')
    }

    return returnValue
}
