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
      { sort, nameSorter, stringSorter, versionSorter, statDataSorter, numericalSorter, defaultSorter } = require('./sorting'),
      { groupByAction } = require('./grouping'),
      { modes } = require('./modes'),
      { optionsToString, titleWhenNothingSelected, latencyBucket, displayTimeRange, visualize } = require('./util'),
      emDash = '\u2014'

const viewName = 'Activity Table'

/**
 * Visualize the activation data
 *
 */
const drawTable = (options, header) => activations => {
    const content = document.createElement('div')
    content.className = 'activation-viz-plugin'

    // add time range to the sidecar header
    const groupData = groupByAction(activations, Object.assign({ groupBySuccess: true }, options))
    displayTimeRange(groupData, header.leftHeader)

    return _drawTable(options, header, content,
                      groupData,
                      options.split ? versionSorter : defaultSorter // if we were asked to split by version, then sort by name
                     )
}

/**
 * Helper method for drawTable. This was split out, to allow for
 * re-sorting.
 *
 */
const _drawTable = (options, header, content, groupData, sorter=defaultSorter, sortDir=+1) => {
    const { groups } = groupData,
          tableHeader = document.createElement('table'),
          tableScrollContainer = document.createElement('div'),
          table = document.createElement('table'),
          ns = namespace.current(),
          nsPattern = new RegExp(`/${ns}/`)

    // clean the container
    ui.removeAllDomChildren(content)

    // add the new elements to the container
    tableScrollContainer.appendChild(table)
    content.appendChild(tableHeader)
    content.appendChild(tableScrollContainer)

    sort(groups, sorter, sortDir)

    table.className = 'data-table cell-container'
    table.setAttribute('color-by', 'duration')
    tableHeader.className = 'data-table'
    tableScrollContainer.className = 'data-table-scroll-container'

    const theadRow = tableHeader.createTHead()
    const addHeaderCell = (labelText, sortByThisColumn, title) => {
        const cell = document.createElement('th'),
              inner = document.createElement('div'),
              label = document.createElement('div'),
              sortArrow = document.createElement('div')

        theadRow.appendChild(cell)
        cell.appendChild(inner)
        inner.appendChild(label)

        // column header label
        cell.className = `${sortByThisColumn.extraCss || ''} ${sortByThisColumn.id === sorter.id ? sortDir > 0 ? 'sort-big-to-small' : 'sort-small-to-big' : ''}`
        inner.className = 'cell-inner'
        label.className = 'clickable left-fill'
        label.appendChild(document.createTextNode(labelText))

        // column header sort arrow
        inner.appendChild(sortArrow)
        sortArrow.className = 'sortArrow'

        if (title) {
            // caller asked us to render a help widget
            const help = document.createElement('span')
            inner.appendChild(help)
            help.innerText = '(?)'
            help.classList.add('help-widget')
            help.title = title
            cell.classList.add('cell-extra-wide')
        }

        cell.onclick = () => {
            const newDir = sorter.id === sortByThisColumn.id ? -sortDir : undefined // undefined will let us pick up the default value
            _drawTable(options, header, content, groupData, sortByThisColumn, newDir)
        }

        return { cell, inner }
    }
    const {inner:nameHeaderCell} = addHeaderCell('action', nameSorter)
    if (options.split) addHeaderCell('version', versionSorter)
    //addHeaderCell('25%', statDataSorter(25))
    addHeaderCell('50%', statDataSorter(50))
    addHeaderCell('90%', statDataSorter(90))
    //addHeaderCell('95%', statDataSorter(95))
    addHeaderCell('99%', statDataSorter(99))
    addHeaderCell('count', numericalSorter('count'))
    addHeaderCell('errors', numericalSorter('errorRate'))
    addHeaderCell('spread', statDataSorter('disparity'), 'How much worse are the slowest than the fastest invocations?')
    addHeaderCell('reasons for spread', stringSorter('why'))

    // add row count to the name header cell
    const rowCount = groups.length,
          rowCountDom = document.createElement('div')
    rowCountDom.innerHTML = `${rowCount} rows`
    rowCountDom.className = 'left-align deemphasize'
    nameHeaderCell.insertBefore(rowCountDom, nameHeaderCell.childNodes[0])

    // header title
    const onclick = options.appName ? drilldownWith(viewName, () => repl.pexec(`app get "${options.appName}"`)) : undefined
    ui.addNameToSidecarHeader(sidecar, options.appName || titleWhenNothingSelected, undefined, onclick)

    // for each group of activations, render a table row
    groups.forEach(group => {
        const row = table.insertRow(-1),
              label = row.insertCell(-1),
              labelText = group.groupKey.replace(nsPattern, ''),
              splitOptions = options.split ? `--split${options.split===true ? '' : ' "' + options.split + '"'} --key "${group.groupKey}"` : ''

        row.setAttribute('data-action-name', labelText)
        row.className = 'grid-cell-occupied'

        label.innerText = labelText
        label.className = 'cell-label clickable'

        // drill down to grid view; note how we pass through a --name
        // query, to filter based on the clicked-upon row
        label.onclick = drilldownWith(viewName, () => repl.pexec(`grid ${optionsToString(options)} --zoom 1 --name "${group.path}" ${splitOptions}`))

        if (options.split) {
            const version = row.insertCell(-1)
            version.className = 'cell-version'
            version.innerText = group.version
        }

        const addNumericCell = (id, redIfNonZero=false, fmt=x=>x) => {
            const cell = row.insertCell(-1),
                  value = group[id]
            cell.innerText = fmt(value)

            const extraCss = redIfNonZero && value > 0 ? 'oops' : ''
            cell.className = `cell-numeric cell-${id} ${extraCss}`

            cell.setAttribute('data-value', value)
        }

        const addStat = (n, prefix='') => {
            const cell = row.insertCell(-1),
                  value = group.statData.n[n],
                  extraCss = `cell-stat-${n} latency-${latencyBucket(value)}`

            try {
                cell.innerText = `${prefix}${prettyPrintDuration(value)}`
            } catch (e) {
                console.error(group)
                console.error(e)
                cell.innerText = value
            }
            cell.className = `cell-stat cell-numeric ${extraCss}`
            cell.setAttribute('data-value', value)
            return cell
        }

        addStat(50)
        addStat(90)
        addStat(99)

        addNumericCell('count')
        addNumericCell('errorRate', true, value => value === 0 ? emDash : `${(100 * value).toFixed(1)}%`)
        addStat('disparity', '+').classList.add('cell-extra-wide')

        const why = row.insertCell(-1)
        why.classList.add('cell-label')
        why.appendChild(group.statData.why)
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
          tableIt = cmd => visualize(wsk, commandTree, cmd, 'activity table', drawTable)

    wsk.synonyms('activations').forEach(syn => {
        const cmd = commandTree.listen(`/wsk/${syn}/table`, tableIt('table'), { docs: 'Visualize recent activations in a table',
                                                                                needsUI: true, viewName,
                                                                                fullscreen: true, width: 800, height: 600,
                                                                                placeholder: 'Loading activity table ...'})

        commandTree.listen(`/wsk/${syn}/tab`, tableIt('tab'), cmd)
    })
}
