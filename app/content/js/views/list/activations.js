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
      viewName = 'Trace View'

/**
 * Fetch activation records
 *
 */
const fetch = activationIds => Promise.all(activationIds.map(_ => {
    if (typeof _ === 'string') {
        return repl.qexec(`activation get ${_}`).catch(err => {
            console.error(err)
        })
    } else {
        return _
    }
})).then(activations => activations.filter(x=>x)) // error recovery. remove blanks

/**
 * Show an activation
 *
 */
const show = activation => () => {
    if (activation.logs && activation.logs.length === 1) {
        // optimistically assume this is a session. the sesion get
        // code will fall back to an activation get, if not
        const sessionId = activation.logs[0]
        return repl.pexec(`session get ${sessionId}`)

    } else if (activation.sessionId) {
        // we know for certain that this is a session
        return repl.pexec(`session get ${activation.sessionId}`)

    } else {
        // we know of certain that this is a plain activation, and
        // already have it in hand! no need to re-fetch
        //return Promise.resolve(activation).then(ui.showEntity)
        return repl.pexec(`activation get ${activation.activationId}`)
    }
}

/**
 * Given a list of activationIds, render a list view and place it in
 * the given container
 *
 */
exports.render = opts => {
    try {
        _render(opts)
    } catch (err) {
        console.error(err)
    }
}
const _render = ({entity, activationIds, container, noCrop=false, noPip=false, showResult=false, showStart=false, showTimeline=true}) => {
    ui.injectCSS('https://cdnjs.cloudflare.com/ajax/libs/balloon-css/0.5.0/balloon.min.css', true) // tooltips

    const nCols = 5 + (showResult ? 1 : 0)
    const logTable = document.createElement('table')
    logTable.className = 'log-lines'
    ui.removeAllDomChildren(container)
    container.appendChild(logTable)

    if (entity) {
        const messageRow = logTable.insertRow(-1),
              message = messageRow.insertCell(-1)
        message.className = 'log-lines-message-for-activations'
        message.innerText = `This ${entity.prettyType || entity.type} includes the following activity:`
        message.setAttribute('colspan', nCols)
    }

    // picture in picture
    const pip = cmd => noPip
          ? cmd
          : ui.pictureInPicture(cmd, undefined, logTable, viewName, { parent: container })
    
    // duration of the activation. this will be helpful for
    // normalizing the bar dimensions
    const first = activationIds.length - 1,
          last = 0,
          start = entity ? entity.start : activationIds[first].start,
          maxEnd = activationIds.reduce((max, activation) => Math.max(max, activation.end||(activation.start+1)), 0), // the last one in the list might not have the highest end
          dur = Math.max(1, entity ? entity.end - entity.start : maxEnd - activationIds[first].start)

    let tgap = 0, gaps
    const normalize = (value, idx) => {
        //console.error(value, value-start, gaps[idx], value-start-gaps[idx], dur-tgap, (value - start - gaps[idx]) / (dur - tgap))
        return (value - start - gaps[idx]) / (dur - tgap)
    }

    return fetch(activationIds)
        .then(activations => entity ? [entity, ...activations] : activations) // add entity to the top of the list
        .then(activations => {
            gaps = new Array(activations.length).fill(0)
            if (!entity) {
                for (let idx = activations.length - 2; idx >= 0; idx--) {
                    const activation = activations[idx],
                          previous = activations[idx + 1],
                          gap = activation.start - (previous.end || (previous.start + 1))
                    if (gap > 0) {
                        const ngap = gap / dur
                        if (gap > 10000 || ngap > 0.05) {
                            tgap += gap

                            for (let ii = idx; ii >= 0; ii--) {
                                gaps[ii] = gaps[ii] + gap
                            }
                        }
                    }
                }
            }

            // note: for statusCode === 0
            //   see https://github.com/apache/incubator-openwhisk/blob/master/common/scala/src/main/scala/whisk/core/entity/ActivationResult.scala#L58

            activations.forEach((activation, idx) => {
                const line = logTable.insertRow(-1),
                      isSuccess = activation.statusCode === 0 // see the note: just above

                // row dom
                line.className = 'log-line entity'
                line.classList.add(activation.sessionId ? 'session' : 'activation')
                line.setAttribute('data-name', activation.name)
                if (entity && idx === 0) line.classList.add('log-line-root')

                // column 1: activationId cell
                const id = line.insertCell(-1),
                      clicky = document.createElement('span')
                clicky.className = 'clickable'
                id.appendChild(clicky)
                id.className = 'log-field activationId'
                if (noCrop) id.classList.add('full-width')
                clicky.innerText = activation.originalActivationId || activation.activationId
                id.setAttribute('data-activation-id', id.innerText)
                clicky.onclick = pip(show(activation))

                // column 2: name cell
                const name = line.insertCell(-1),
                      nameClick = document.createElement('span')
                name.className = 'deemphasize log-field entity-name'
                nameClick.className = 'clickable'
                nameClick.innerText = activation.name
                name.appendChild(nameClick)
                if (activation.name === 'conductor') {
                    if (activation.logs.find(_ => _.indexOf('Entering action_') >= 0)) {
                        nameClick.innerText = 'entering next task'
                    } else if (activation.logs[0].indexOf('Entering function_') >= 0) {
                        nameClick.innerText = 'executing inline function'
                    } else if (activation.logs[0].indexOf('Entering choice_') >= 0) {
                        nameClick.innerText = 'executing if condition'
                    } else if (activation.logs[0].indexOf('Entering final') >= 0) {
                        nameClick.innerText = 'finishing up'
                    } else {
                        console.error(activation.logs)
                    }
                }

                // command to be executed when clicking on the entity name cell
                const path = activation.annotations && activation.annotations.find(({key}) => key === 'path'),
                      gridCommand = activation.sessionId
                      ? `grid "${activation.name}"`
                      : !path ? `grid --name /${activation.namespace}/${activation.name}`   // triggers, at least, have no path annotation
                      : `grid --name "/${path.value}"`

                nameClick.onclick = pip(() => repl.pexec(gridCommand),
                                        undefined, logTable, viewName, { parent: container })

                // column 3: duration cell
                const duration = line.insertCell(-1)
                duration.className = 'deemphasize log-field log-field-right-align duration-field'
                if (activation.end) {
                    duration.innerText = prettyPrintDuration(activation.end - activation.start)
                }

                // column 4: success cell
                const success = line.insertCell(-1)
                success.className = 'deemphasize log-field success-field'
                success.classList.add(isSuccess ? 'green-text' : 'red-text')
                success.innerText = activation.status === 'live' ? activation.status : isSuccess ? 'ok' : 'failed'
                if (activation.status) {
                    line.setAttribute('data-status', activation.status)
                }

                // column 5|6?: result cell
                if (showResult) {
                    const result = line.insertCell(-1),
                          code = document.createElement('code')
                    code.classList.add('json')
                    result.appendChild(code)
                    result.className = 'deemphasize log-field activation-result'
                    if (activation.response) {
                        code.innerText = JSON.stringify(activation.response.result||{}).substring(0, 40)
                        setTimeout(() => hljs.highlightBlock(code), 0)
                    }
                }

                // column 5|6|7: bar chart cell
                if (showTimeline) {
                    const timeline = line.insertCell(-1),
                          bar = document.createElement('div')
                    timeline.appendChild(bar)
                    timeline.className = 'log-field log-line-bar-field'
                    bar.style.position = 'absolute'
                    bar.classList.add('log-line-bar')
                    if (activation.name === 'conductor') bar.classList.add('log-line-bar-conductor')
                    bar.classList.add(`is-success-${isSuccess}`)

                    // bar dimensions
                    const left = normalize(activation.start, idx),
                          right = normalize(activation.end || (activation.start + 1), idx), // handle rules and triggers as having dur=1
                          width = right - left
                    bar.style.left = (100 * left) + '%'
                    bar.style.width = (100 * width) + '%'

                    bar.onclick = pip(show(activation))
                    bar.setAttribute('data-balloon', `Activation of ${name.innerText}, lasting ${duration.innerText}`)
                    bar.setAttribute('data-balloon-pos', 'right')
                }
                
                // column n: start cell
                if (showStart) {
                    const start = line.insertCell(-1),
                          previous = activations[idx - 1],
                          previousStart = previous && previous.start,
                          time = ui.prettyPrintTime(activation.start, 'short', previousStart)
                    start.className = 'deemphasize log-field log-field-right-align start-time-field'
                    if (typeof time === 'string') {
                        start.innerText = time
                    } else {
                        start.appendChild(time)
                    }
                }
            })

            return true // success
        })
}
