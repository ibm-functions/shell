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
      { sort, sortActivations, startTimeSorter, nameSorter, countSorter } = require('./sorting'),
      { drilldownWith } = require('./drilldown'),
      { groupByAction } = require('./grouping'),
      { drawLegend } = require('./legend'),
      { renderCell } = require('./cell'),
      { modes } = require('./modes'),
      { grid:usage } = require('../usage'),
      { nbsp, optionsToString, isSuccess, titleWhenNothingSelected, latencyBucket,
        displayTimeRange, prepareHeader, visualize } = require('./util')

const viewName = 'Grid'

const css = {
    content: 'activation-viz-plugin',
    gridGrid: 'grid-grid'
}

const closestSquare = n => {
    const root = Math.sqrt(n),
          integralPart = ~~root,
          decimalPart = root - integralPart

    if (decimalPart === 0) {
        return integralPart
    } else {
        return integralPart + 1
    }
}

const makeCellDom = () => {
    const cellDom = document.createElement('div')
    cellDom.className = 'grid-cell grid-cell-occupied'
    return cellDom
}

class Occupancy {
    constructor(width, height, nCells, grid, gridGrid) {
        this.width = width
        this.height = height
        this.rows = new Array(width * height)
        this.gridGrid = gridGrid
        const cells = document.createElement('div')
        cells.className ='grid-row'
        grid.appendChild(cells)
        for (let count = 0, rowIdx = 0; rowIdx < height; rowIdx++) {
            for (let colIdx = 0; colIdx < width && count < nCells; colIdx++, count++) {
                const cellDom = makeCellDom()
                cells.appendChild(cellDom)
                this.rows[rowIdx * width + colIdx] = cellDom
            }
            //const linebreak = document.createElement('div')
            //linebreak.className = 'grid-line-break'
            //cells.appendChild(linebreak)
        }
        /*this.rows = new Array(height)
        for (let rowIdx = 0; rowIdx < height; rowIdx++) {
            const row = this.rows[rowIdx] = new Array(width),
                  rowDom = document.createElement('div')

            grid.appendChild(rowDom)
            rowDom.className = 'grid-row'

            for (let colIdx = 0; colIdx < width; colIdx++) {
                const cellDom = document.createElement('div')
                cellDom.className = 'grid-cell'
                rowDom.appendChild(cellDom)
                row[colIdx] = cellDom
            }
        }*/
    }

    mark(x, y, width, height, count) {
        const cells = [],
              rowExtent = Math.min(this.height, y + height),
              colExtent = Math.min(this.width, x + width)

        for (let C = 0, rowIdx = y; rowIdx < rowExtent; rowIdx++) {
            const row = this.rows[rowIdx]

            for (let colIdx = x; colIdx < colExtent && C < count; colIdx++, C++) {
                const cell = this.rows[rowIdx * this.width + colIdx]
                //peripheral = /*this.width > 20 &&*/ colIdx < 3 ? 'grid-cell-far-left'
//                      : /*this.width > 20 &&*/ this.width - colIdx < 3 ? 'grid-cell-far-right'
//                      : ''
                //const cell = row[colIdx]
                cells.push(cell)
                cell.className = `${cell.className} grid-cell-occupied` // ${peripheral}

                cell.onmouseenter = evt => {
                    const win = this.gridGrid.getBoundingClientRect(),
                          cell = evt.currentTarget
                    if (win.right - evt.clientX < 80) {
                        cell.setAttribute('data-balloon-pos', 'up-right')
                    } else if (evt.clientX - win.left < 80) {
                        cell.setAttribute('data-balloon-pos', 'up-left')
                    }

                    if (cell.id && cell.isFailure && !cell.failureMessage) {
                        repl.qexec(`wsk activation get ${cell.id}`)
                            .then(({response}) => {
                                if (response.result.error) {
                                    cell.failureMessage = response.result.error.error || response.result.error
                                    cell.setAttribute('data-balloon', cell.getAttribute('data-balloon') + ` with: ${cell.failureMessage.substring(0, 40)}`)
                                }
                            })
                    }
                }
            }
        }

        return cells
    }

    reserve(group) {
        return this.mark(group.x, group.y, group.width, group.height, group.count)
    }
}

/**
 * Change the coloring strategy
 *
 */
const colorBy = (strategy, gridGrid=document.querySelector(`.${css.content} .${css.gridGrid}`)) => {
    gridGrid.setAttribute('color-by', strategy)
    return true
}

/**
 * Visualize the activation data
 *
 */
const drawGrid = (options, header) => activations => {
    const existingContent = document.querySelector(`#sidecar .custom-content .custom-content .${css.content}`),
          content = existingContent || document.createElement('div'),
          redraw = !!existingContent

    content.className = css.content
    _drawGrid(options, header, content, groupByAction(activations, options), undefined, undefined, redraw)

    //injectHTML(content, 'grid/bottom-bar.html', 'bottom-bar')

    return {
        type: 'custom',
        content,
        modes: modes('grid', options)
    }
}

/**
 * Try to be clever about picking a zoom level, if one wasn't specified
 *
 */
const smartZoom = numCells => {
    if (numCells > 1000) {
        return -2
    } else if (numCells <= 36) {
        return 2;
    } else if (numCells <= 100) {
        return 1
    } else {
        return 0;
    }
}

/**
 * Helper method for drawGrid. This was split out, to allow for
 * re-sorting.
 *
 */
const _drawGrid = (options, {sidecar, leftHeader, rightHeader}, content, groupData, sorter=countSorter, sortDir=+1, redraw) => {
    const { groups, summary } = groupData

    sort(groups, sorter, sortDir)
    sortActivations(groups, startTimeSorter, +1)

    const ns = namespace.current(),
          nsPattern = new RegExp(`/${ns}/`),
          gridGrid = redraw ? content.querySelector(`.${css.gridGrid}`) : document.createElement('div'),
          totalCount = groupData.totalCount,
          zoomLevel = options.zoom || smartZoom(totalCount),
          zoomLevelForDisplay = totalCount > 1000 ? -2 : totalCount <= 100 ? zoomLevel : 0 // don't zoom in too far, if there are many cells to display

    gridGrid.className = `${css.gridGrid} cell-container zoom_${zoomLevelForDisplay}`
    colorBy('duration', gridGrid)

    if (!redraw) {
        content.appendChild(gridGrid)
    }

    // add activation name to header
    if (groups.length === 1 && !options.fixedHeader && !options.appName) {
        const group = groups[0],
              pathComponents = group.path.split('/'),
              packageName = pathComponents.length === 4 ? pathComponents[2] : ''

        const onclick = drilldownWith(viewName, () => repl.pexec(`action get "${group.path}"`))
        ui.addNameToSidecarHeader(sidecar, group.name, packageName, onclick)

        drawLegend(viewName, rightHeader, group, options)
    } else {
        const onclick = options.appName ? drilldownWith(viewName, () => repl.pexec(`app get "${options.appName}"`)) : undefined,
              pathComponents = (options.appName||'').split('/'),
              packageName = pathComponents.length === 4 ? pathComponents[2] : pathComponents.length === 2 && options.appName.charAt(0) !== '/' ? pathComponents[0] : '',
              name = pathComponents.length > 1 ? pathComponents[pathComponents.length - 1] : options.appName || titleWhenNothingSelected

        ui.addNameToSidecarHeader(sidecar, name, packageName, onclick)

        if (groups.length > 0) {
            drawLegend(viewName, rightHeader, summary)
        }
    }

    // add time range to the sidecar header
    displayTimeRange(groupData, leftHeader)

    groups.forEach((group, groupIdx) => {
        // prepare the grid structure
        const gridDom = redraw ? gridGrid.querySelector(`.grid[data-action-path="${group.path}"]`) : document.createElement('div')
        gridDom.className = 'grid'
        gridDom.setAttribute('data-action-name', group.name)
        gridDom.setAttribute('data-action-path', group.path)
        if (!redraw) gridGrid.appendChild(gridDom)
        
        // adjust z-index to help tooltips
        // not yet supported by browsers gridDom.setAttribute('data-grid-index', groupIdx)
        //gridDom.style.zIndex = groups.length - groupIdx + 1

        // add a label to the grid
        const gridLabel = document.createElement('div'),
              labelInner = document.createElement('div'),
              labelPackage = document.createElement('div'),
              labelAction = document.createElement('div'),
              labelSplit = group.groupKey.split('/'),
              hasPackage = labelSplit.length === 4,                 // this action is part of a pacakge?
              packageName = hasPackage ? labelSplit[2] : nbsp,      // the package name to display
              actionName = labelSplit[labelSplit.length - 1]        // the action name to display

        if (!redraw /*zoomLevel === 0 || groups.length > 1 || options.fixedHeader*/) {
            gridLabel.className = 'grid-label'
            gridLabel.appendChild(labelInner)
            gridDom.appendChild(gridLabel)

            labelInner.appendChild(labelPackage)
            labelPackage.innerText = packageName
            labelPackage.className = 'package-prefix grid-label-part'

            labelInner.appendChild(labelAction)
            labelAction.innerText = actionName
            labelAction.className = 'clickable grid-label-part'
            labelAction.onclick = drilldownWith(viewName, () => repl.pexec(`grid ${optionsToString(options)} --zoom 1 --name "${group.path}"`))
        }

        // render the grid
        let cells
        if (!redraw) {
            const L = closestSquare(group.count),
                  width = L,
                  height = L,
                  grid = new Occupancy(width, height, group.activations.length, gridDom, gridGrid)
            group.x = 0
            group.y = 0
            group.width = L
            group.height = L
            cells = grid.reserve(group)

            // now that we know the width of the grid, adjust the width of the label
            if (zoomLevel === 0) {
                gridLabel.style.maxWidth = `${width * 8}vw`
            }

            // and try to make the gridDom mostly squarish
            gridDom.querySelector('.grid-row').style.maxWidth = `${width * (zoomLevelForDisplay === 0 ? 2.5 : zoomLevelForDisplay === 1 ? 3 : zoomLevelForDisplay === 2 ? 4 : 3)}vw`

            let idx = 0
            group.activations.forEach(activation => {
                renderCell(viewName, cells[idx], activation, !isSuccess(activation))
                idx++
            })
        } else {
            const cellContainer = gridDom.querySelector('.grid-row'),
                  existingCells = cellContainer.querySelectorAll('.grid-cell')
                  /*exists = {} // map by activationId
            for (let idx = 0; idx < existingCells.length; idx++) {
                const id = existingCells[idx].getAttribute('data-activation-id')
                if (id) {
                    exists[id] = true
                }
            }
            console.error(exists)*/
            group.activations.forEach(activation => {
                //if (!exists[activation.activationId]) {
                //if (!cellContainer.querySelector(`data-activation-id="${activation.activationId}"`)) {
                try {
                    if (!document.getElementById(activation.activationId)) {
                        const cell = makeCellDom()
                        cellContainer.appendChild(cell)
                        cell.classList.add('grid-cell-newly-created')
                        renderCell(viewName, cell, activation, !isSuccess(activation))
                    }
                } catch (e) {
                    console.error(e)
                }
            })
        }
    })
}

/**
 * This is the module
 *
 */
module.exports = (commandTree, require, options) => {
    if (options && options.activations) {
        const grid = drawGrid(options, prepareHeader())(options.activations)
        ui.showCustom(grid)
        return
    }

    const wsk = require('/ui/commands/openwhisk-core'),
          mkCmd = (cmd, extraOptions) => visualize(wsk, commandTree, cmd, viewName, drawGrid, null, extraOptions),
          fixedGrid = mkCmd('grid'),
          pollingGrid = mkCmd('...', { live: true })

    // a command that is a bit instructional as to what is going on
    // this if for the tray-launched scenario
    commandTree.listen('/loading/activity/grid/...', function() {
        return /*repl.qexec('mirror poll')*/Promise.resolve(true)
            .then(() => pollingGrid.apply(undefined, arguments))
    }, { hide: true })

    wsk.synonyms('activations').forEach(syn => {
        commandTree.listen(`/wsk/${syn}/grid`, fixedGrid, { usage,
                                                            needsUI: true, viewName,
                                                            fullscreen: true, width: 800, height: 600,
                                                            placeholder: 'Loading activity grid ...'})

        // coloring
        /*const cmd = commandTree.listen(`/wsk/${syn}/color/grid/by`, (_0, _1, fullArgv, modules, _2, _3, argvNoOptions, options) => {
            const strategy = argvNoOptions[argvNoOptions.indexOf('by') + 1]
            if (strategy === 'pass/fail') {
                return colorBy('pass/fail')
            } else if (strategy === 'duration' || strategy === 'default' || strategy === 'reset') {
                return colorBy('duration')
            } else {
                throw new Error('Usage: color by default|pass/fail|duration')
            }
        }, { docs: 'Change the coloring strategy of the activation grid' })
        commandTree.listen('/wsk/$dur', () => colorBy('duration'), cmd)
        commandTree.listen('/wsk/$pf', () => colorBy('pass/fail'), cmd)*/
    })
}
