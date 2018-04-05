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
 * Turn a key->value map into a '--key1 value1 --key2 value2' cli opt string
 *
 */
const mapToOptions = (baseMap, overrides) => {
    const map = Object.assign({}, baseMap, overrides)
    return Object.keys(map).reduce((opts,key) => key === '_' ? opts : `${opts} --${key} ${map[key]}`, '')
}

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
    if (activation.logs && activation.logs.length === 1 && activation.logs[0].match(/^[0-9a-f]{32}$/)) {
        // if log size == 1 and the log matches activation id regex 

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

const findItemInAnnotations = (name, activation) => {
    // this function is for finding waitTime of initTime in activation annotations
    if(activation && activation.annotations && activation.annotations.find((item) => item.key === name))
        return activation.annotations.find((item) => item.key === name).value;
    else
        return 0;   // if no time item, return 0
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
const _render = ({entity, activationIds, container, noCrop=false, noPip=false, showResult=false, showStart=false, showTimeline=true, skip, limit,
                  parsedOptions}) => {
    ui.removeAllDomChildren(container)   

    const legendHTMLtext = `<div class='legend-stripe'><div class='legend-entry' data-legend-type='queueing-delays' data-balloon='The time this activation waited for free execution resources' data-balloon-pos='left'>Queueing Delays<div class='legend-icon is-waitTime'></div></div><div class='legend-entry' data-legend-type='container-initialization' data-balloon='The "cold start time", i.e. time spent initializing a container' data-balloon-pos='left'>Container Initialization<div class='legend-icon is-initTime'></div></div><div class='legend-entry' data-legend-type='execution-time' data-balloon='The time this activation spent executing your code' data-balloon-pos='left'>Execution Time<div class='legend-icon is-runTime'></div></div><div class='legend-entry' data-legend-type='failures' data-balloon='The activation failed to complete' data-balloon-pos='left'>Failures<div class='legend-icon is-success-false'></div></div></div>`

    const legend = document.createElement('div'),
          logTable = document.createElement('table')

    if (entity) {   // if we have an entity, then we are rendering the Trace tab
        container.appendChild(legend)

        // add a legned 
        legend.className = 'legend-trace'
        legend.innerHTML = legendHTMLtext
    }
    else if(activationIds && activationIds.find(item => item.annotations)){
        // assumption: currently, session activation does not have annotations. if none of the activations in activationIds has annotations, then the cmd is `session list` and we don't show the legend.             
        // create a legend only for `activation list`. 
        legend.className = 'legend-trace legend-list'
        legend.innerHTML = legendHTMLtext
        // insert the legend before logTable 
        container.appendChild(legend)
    }

    const nCols = 5 + (showResult ? 1 : 0)
    logTable.className = 'log-lines'
    container.appendChild(logTable) 

    // picture in picture
    const pip = cmd => noPip
          ? cmd
          : ui.pictureInPicture(cmd, undefined, logTable, viewName, { parent: container })
    
    // duration of the activation. this will be helpful for
    // normalizing the bar dimensions
    const first = activationIds.length - 1,
          last = 0,
          start = entity ? entity.start : activationIds[first].start - findItemInAnnotations('waitTime', activationIds[first]),
          maxEnd = activationIds.reduce((max, activation) => Math.max(max, activation.end||(activation.start+1)), 0), // the last one in the list might not have the highest end
          dur = Math.max(1, entity ? entity.end - entity.start : maxEnd - start)

    let tgap = 0, gaps
    const normalize = (value, idx) => {
        //console.error(value, value-start, gaps[idx], value-start-gaps[idx], dur-tgap, (value - start - gaps[idx]) / (dur - tgap))
        return (value - start - gaps[idx]) / (dur - tgap)
    }

    return Promise.all([fetch(activationIds)
                        .then(activations => entity ? [entity, ...activations] : activations), // add entity to the top of the list
                        repl.qexec(`wsk activation count ${mapToOptions(parsedOptions)}`)])
        .then(([activations, count]) => {
            gaps = new Array(activations.length).fill(0)
            if (!entity) {
                let residualDur = dur // after subtracing out gaps

                for (let idx = activations.length - 2; idx >= 0; idx--) {
                    const activation = activations[idx],
                          previous = activations[idx + 1],
                          gap = activation.start - findItemInAnnotations('waitTime', activation) - (previous.end || (previous.start + 1))
                    if (gap > 0) {
                        const ngap = gap / residualDur
                        if (gap > 10000 || ngap > 0.05) {
                            tgap += gap
                            residualDur -= gap

                            for (let ii = idx; ii >= 0; ii--) {
                                gaps[ii] = gaps[ii] + gap
                            }
                        }
                    }
                }
            }

            // note: for statusCode === 0
            //   see https://github.com/apache/incubator-openwhisk/blob/master/common/scala/src/main/scala/whisk/core/entity/ActivationResult.scala#L58

            let echo = -1;
            activations.forEach((activation, idx) => {
                //
                // in this block, we are rendering a row for one activation
                //

                // if statusCode is undefined, check activation.response for success/fail info
                // need to avoid isSuccess is set to undefined, as (false || undefined) returns undefined
                // and re: statusCode === 0, see the note just above
                const isSuccess = !activation.end ? true // rules and triggers. always successful?
                      : activation.statusCode !== undefined ? activation.statusCode === 0 : (activation.response && activation.response.success)

                // row dom
                const line = logTable.insertRow(-1)
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

                // special cases for sessions; note that with composer
                // v2, we won't be able to do isSessionRelated
                // properly. the backend needs to store info to help
                // us distinguish between interstitial conductor
                // activations and top-most conductor activations; as
                // of now, the interstitial ones don't have a
                // conductor:true annotation
                /*const isSessionRelated = activation.annotations && activation.annotations.find(({key, value}) => key === 'conductor' && value)
                if (isSessionRelated && activation.logs) {
                    if (activation.logs.find(_ => _.indexOf('Entering state') >= 0)) {
                        nameClick.innerText = 'entering next task'
                    } else if(activation.logs.findIndex(log => log.indexOf('Entering echo_') >= 0) == 0){
                        nameClick.innerText = 'entering next task'
                    } else if (activation.logs.find(_ => _.indexOf('Entering function_') >= 0)) {                        
                        nameClick.innerText = 'executing inline function'                        
                    } else if (activation.logs.findIndex(log => log.indexOf('Entering choice_') >= 0) == 0) {
                        nameClick.innerText = 'executing if condition'
                    } else if (activation.logs.find(_ => _.indexOf('Entering final state') >= 0)) {
                        nameClick.innerText = 'finishing up'
                    } else {
                        console.error(activation.logs)
                    }
                    
                    echo = activation.logs.findIndex(log => log.indexOf('Entering echo_')>=0);
                }
                else if(activation.name === 'echo' && echo != -1){
                    if(echo == 0)
                        nameClick.innerText = 'echo to log input'
                    else
                        nameClick.innerText = 'echo to log function output'
                }
                else{
                    echo = -1;
                }*/


                // command to be executed when clicking on the entity name cell
                const path = activation.annotations && activation.annotations.find(({key}) => key === 'path'),
                      gridCommand = activation.sessionId
                      ? `grid "${activation.name}"` // for apps, the activation.name field is the app name
                      : !path ? `grid "/${activation.namespace}/${activation.name}"`   // triggers, at least, have no path annotation
                      : `grid "/${path.value}"`

                nameClick.onclick = pip(() => repl.pexec(gridCommand),
                                        undefined, logTable, viewName, { parent: container })

                // column 3: duration cell
                const duration = line.insertCell(-1)
                duration.className = 'deemphasize log-field log-field-right-align duration-field'
                if (activation.end) {
                    duration.innerText = prettyPrintDuration(activation.end - activation.start)
                }
                else{                    
                    // for trigger and rule, set duration to be 1ms. If duration is not set, qtip will show 'lasting undefined' 
                    duration.innerText = prettyPrintDuration(1);
                }

                // column 4: success cell
                const success = line.insertCell(-1)
                success.className = 'deemphasize log-field success-field'
                success.classList.add(isSuccess ? 'green-text' : 'red-text')
                success.innerText = isSuccess ? 'ok' : 'failed'

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
                          isRootBar = (entity && idx === 0) // for sequence traces, show the sequence bar a bit differently

                    timeline.className = 'log-field log-line-bar-field'

                    // queueing delays and container initialization time
                    const waitTime = findItemInAnnotations('waitTime', activation) || 0,
                        initTime = findItemInAnnotations('initTime', activation) || 0

                    // execution time bar
                    const bar = document.createElement('div')
                    bar.style.position = 'absolute'
                    bar.classList.add('log-line-bar')
                    bar.classList.add(`is-success-${isSuccess}`)
                    const left = normalize(activation.start + initTime, idx),
                          right = normalize(activation.end || (activation.start + initTime + 1), idx), // handle rules and triggers as having dur=1
                          width = right - left

                    // on which side should we render the tooltip?
                    const balloonPos = right > 0.9 ? 'left' : 'right'

                    bar.style.left = (100 * left) + '%'
                    bar.style.width = (100 * width) + '%'
                    bar.onclick = pip(show(activation))
                    bar.setAttribute('data-balloon', prettyPrintDuration(activation.end ? activation.end - activation.start - initTime : initTime))
                    bar.setAttribute('data-balloon-pos', balloonPos)
                    bar.onmouseover = () => legend.setAttribute('data-hover-type', 'execution-time')
                    bar.onmouseout = () => legend.removeAttribute('data-hover-type')

                    // container initialization bar
                    let initTimeBar, waitTimeBar
                    if (initTime > 0 && !isRootBar) {
                        initTimeBar = document.createElement('div'),
                              l = normalize(activation.start, idx),
                              w = normalize(activation.start + initTime, idx) - l

                        initTimeBar.style.left = (100 * l) + '%';
                        initTimeBar.style.width = (100 * w) + '%';
                        initTimeBar.style.position = 'absolute';
                        initTimeBar.classList.add('log-line-bar');
                        initTimeBar.classList.add('is-initTime');
                        initTimeBar.onmouseover = () => legend.setAttribute('data-hover-type', 'container-initialization')
                        initTimeBar.onmouseout = () => legend.removeAttribute('data-hover-type')

                        // activation can fail at init time - if that's the case, initTime === duration 
                        if (initTime === activation.duration)
                            initTimeBar.classList.add(`is-success-false`)
                        else
                            initTimeBar.classList.add(`is-success-true`)

                        initTimeBar.onclick = pip(show(activation))
                        initTimeBar.setAttribute('data-balloon', prettyPrintDuration(initTime))
                        initTimeBar.setAttribute('data-balloon-pos', balloonPos)
                    }

                    // queueing delays bar
                    if (waitTime > 0 && !isRootBar) {
                        waitTimeBar = document.createElement('div'), 
                              l = normalize(activation.start - waitTime, idx),
                              w = normalize(activation.start, idx) - l

                        waitTimeBar.style.left = (100 * l)+'%';
                        waitTimeBar.style.width = (100 * w)+'%';
                        waitTimeBar.style.position = 'absolute';
                        waitTimeBar.classList.add('log-line-bar');
                        waitTimeBar.classList.add('is-waitTime');
                        waitTimeBar.onclick = pip(show(activation));
                        waitTimeBar.setAttribute('data-balloon', prettyPrintDuration(waitTime))
                        waitTimeBar.setAttribute('data-balloon-pos', balloonPos);
                        waitTimeBar.onmouseover = () => legend.setAttribute('data-hover-type', 'queueing-delays')
                        waitTimeBar.onmouseout = () => legend.removeAttribute('data-hover-type')
                    }

                    // here, we have to be careful to stack the bars in an order so that the tooltips will stack on top
                    // see shell issue #168
                    if (balloonPos === 'right') {
                        timeline.appendChild(bar)
                        if (initTimeBar) timeline.appendChild(initTimeBar)
                        if (waitTimeBar) timeline.appendChild(waitTimeBar)
                    } else {
                        if (waitTimeBar) timeline.appendChild(waitTimeBar)
                        if (initTimeBar) timeline.appendChild(initTimeBar)
                        timeline.appendChild(bar)
                    }
                } // now we're done rendering the timeline bars

                // column n: start cell
                if (showStart) {
                    const start = line.insertCell(-1),
                          startInner = document.createElement('span'),
                          previous = activations[idx - 1],
                          previousStart = previous && (previous.start - findItemInAnnotations('waitTime', previous)),
                          time = ui.prettyPrintTime(activation.start - findItemInAnnotations('waitTime', activation), 'short', previousStart)
                    start.className = 'deemphasize log-field log-field-right-align start-time-field'
                    start.appendChild(startInner)
                    if (typeof time === 'string') {
                        startInner.innerText = time
                    } else {
                        startInner.appendChild(time)
                    }
                }
            })

            // paginator
            if (!entity) {
                const paginator = document.createElement('div'),
                      leftButtons = document.createElement('div'),
                      rightButtons = document.createElement('div'),
                      description = document.createElement('span'),
                      prev = document.createElement('span'),
                      next = document.createElement('span')
            
                container.appendChild(paginator)
                paginator.classList.add('list-paginator')

                // left-fill button box
                paginator.appendChild(leftButtons)
                leftButtons.classList.add('list-paginator-left-buttons')

                // show summary buttons
                paginator.appendChild(rightButtons)
                rightButtons.classList.add('list-paginator-right-buttons')
                const buttons = [ { command: 'summary', icon: 'fas fa-chart-bar', balloon: 'Open a statistical summary view' },
                                  // 'timeline', // disabled for now shell issue #794
                                  { command: 'grid', icon: 'fas fa-th', balloon: 'Open a grid view' } ]
                buttons.forEach(({ command, icon, balloon, balloonPos='up-left' }) => {
                    const buttonContainer = document.createElement('span'),
                          button = document.createElement('i')

                    leftButtons.appendChild(buttonContainer)

                    buttonContainer.className = 'graphical-icon'
                    buttonContainer.appendChild(button)
                    buttonContainer.setAttribute('data-balloon', balloon)
                    buttonContainer.setAttribute('data-balloon-pos', balloonPos)

                    button.className = icon
                    button.classList.add('clickable')

                    buttonContainer.setAttribute('data-button-command', command)
                    buttonContainer.onclick = () => repl.pexec(command)
                })

                // description of current page
                description.className = 'list-paginator-description'
                rightButtons.appendChild(description)

                description.innerText = `${skip + 1}\u2013${skip+activationIds.length} of ${count.toLocaleString()} items`

                // forward and back buttons
                rightButtons.appendChild(prev)
                rightButtons.appendChild(next)
                prev.innerText = '\uff1c'
                next.innerText = '\uff1e'
                prev.className = 'list-paginator-button list-paginator-button-prev'
                next.className = 'list-paginator-button list-paginator-button-next'

                // pagination click handlers
                const goto = skip => () => repl.qexec(`wsk activation list ${mapToOptions(parsedOptions, { skip })}`)
                      .then(activationIds => {
                          if (activationIds.length === 0) {
                              // we're at the end! disable the next button
                              next.classList.add('list-paginator-button-disabled')
                              delete next.onclick
                          } else {
                              _render({ activationIds, container,
                                        noCrop, noPip, showResult, showStart, showTimeline, skip, limit, parsedOptions })
                          }
                      })

                if (skip === 0) {
                    // disable the back button when we're on the first page
                    prev.classList.add('list-paginator-button-disabled')
                } else {
                    // otherwise, onclick go back a page
                    prev.onclick = goto(skip - limit)
                }

                if (skip + limit >= count) {
                    // we're already at the end, so disable the next button
                    next.classList.add('list-paginator-button-disabled')
                } else {
                    next.onclick = goto(skip + limit)
                }
            } // end of paginator

            // try $ ls; $ ls; then paginate. this avoids chrome
            // scrolling up a bit after the pagination completes. we
            // did a ui.removeAllDomChildren, so perhaps chrome thinks
            // that it needs to scorll a bit. this seems like a chrome
            // bug to me, but the following seems to work around
            // it. NMM 20180106
            container.scrollIntoView()

            return true // success
        })
}
