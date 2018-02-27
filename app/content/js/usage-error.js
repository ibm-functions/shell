/*
 * Copyright 2017-2018 IBM Corporation
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

'use strict'

/** Create an HTML DIV to wrap around the given string */
const div = (str, css=undefined, tag='div') => {
    const result = document.createElement(tag)
    if (str) {
        result.innerText = str
    }
    if (css) {
        if (typeof css === 'string') {
            result.className = css
        } else {
            css.forEach(_ => result.classList.add(_))
        }
    }
    return result
}
const span = (str, css=undefined) => div(str, css, 'span')

/**
 * The start of every section, e.g. Usage:
 *
 */
const prefix = str => {
    const result = div(str, undefined, 'h2')
    result.style.fontWeight = '300'
    result.style.margin = '0 0 0.375em'
    result.style.fontSize = '1.25em'
    result.style.color = 'var(--color-brand-01)'
    sans(result)
    return result
}

/** A part of the main body of the usage message */
const bodyPart = () => {
    const result = div()
    result.style.margin = '1.5em 3em 0 0'
    return result
}

/** render the given div with the default san serif font */
const sans = div => {
    div.style.fontFamily = 'var(--font-sans-serif)'
    return div
}

/** render the given div a bit smaller */
const smaller = div => {
    div.style.fontSize = '0.875em'
    return div
}
/** render the given div with white space line wrapping */
const wrap = div => {
    div.style.display = 'block'
    div.style.whiteSpace = 'normal'
    return div
}

/**
 * Format the given usage message
 *
 */
const format = message => {
    if (typeof message === 'string') {
        return message

    } else if (message.nodeName) {
        // then this is a pre-formatted HTML
        return message
        
    } else {
        // these are the fields of the usage message
        const { title, header, example, commandPrefix, available, related } = message

        // the return value will be `result`; we will populate it with
        // those fields now; `body` is the flex-wrap portion of the
        // content
        const result = div(),
              body = div()

        result.style.margin = '1em calc(1ex + 1em)' // 1ex+1em try to match the '> ' bit of the REPL
        result.style.border = '1px solid var(--color-ui-04)'
        result.style.padding = '1em'
        result.style.color = 'initial'

        //
        // title
        //
        if (title) {
            const dom = div(title, 'capitalize', 'h1')
            dom.style.fontSize = '1.629em'
            dom.style.fontWeight = 300
            dom.style.color = 'var(--color-brand-01)'
            dom.style.margin = '0 0 .3rem'
            result.appendChild(dom)
        }

        //
        // header message
        //
        if (header) {
            const headerDiv = div(header)
            //headerDiv.style.color = 'var(--color-support-01)'
            headerDiv.style.fontWeight = 400
            sans(headerDiv)
            result.appendChild(headerDiv)
        }

        body.style.display = 'flex'
        body.style.flexWrap = 'wrap'
        result.appendChild(body)

        if (example) {
            const examplePart = bodyPart(),
                  prePart = prefix('Usage'),
                  textPart = div(example)

            body.appendChild(examplePart)
            examplePart.appendChild(prePart)
            examplePart.appendChild(textPart)

            textPart.style.color = 'var(--color-support-02)'
        }

        if (available) {
            const availablePart = bodyPart(),
                  prePart = prefix('Available Commands'),
                  table = document.createElement('table')

            table.className = 'log-lines'

            availablePart.appendChild(prePart)
            availablePart.appendChild(table)
            body.appendChild(availablePart)

            available.forEach(({command, label=command, dir:isDir=false, docs, partial=false}) => {
                const row = table.insertRow(-1),
                      cmdCell = row.insertCell(-1),
                      docsCell = row.insertCell(-1),
                      cmdPart = span(label),
                      dirPart = isDir && span('/'),
                      docsPart = span(docs)

                row.className = 'log-line entity'
                cmdCell.className = 'log-field'
                docsCell.className = 'log-field'

                cmdPart.className = 'clickable'
                cmdPart.style.fontWeight = '500'
                //docsPart.classList.add('deemphasize')
                wrap(smaller(sans(docsPart)))

                cmdCell.appendChild(cmdPart)
                if (dirPart) cmdCell.appendChild(smaller(dirPart))
                docsCell.appendChild(docsPart)

                cmdPart.onclick = partial ? () => repl.partial(`${commandPrefix ? commandPrefix + ' ' : ''}${command}${partial === true ? '' : ' ' + partial}`)
                    : () => repl.pexec(`${commandPrefix ? commandPrefix + ' ' : ''}${command}`)
            })
        }

        if (related) {
            const relatedPart = bodyPart(),
                  prePart = prefix('Related Commands'),
                  listPart = div()

            relatedPart.appendChild(prePart)
            relatedPart.appendChild(listPart)
            result.appendChild(relatedPart) // note that we append to result not body; body is for the flex-wrap bits

            related.forEach((command, idx) => {
                const commandPart = span(undefined, ''),
                      commaPart = span(idx === 0 ? '' : ', ', ''),
                      clickablePart = span(command, 'clickable')

                commandPart.appendChild(commaPart)
                commandPart.appendChild(clickablePart)
                clickablePart.onclick = () => repl.pexec(command)

                listPart.appendChild(commandPart)
            })
        }

        return result
    }
}

module.exports = function UsageError(message, extra) {
    Error.captureStackTrace(this, this.constructor)
    this.name = this.constructor.name
    this.message = format(message)
    this.extra = extra
}

require('util').inherits(module.exports, Error)
