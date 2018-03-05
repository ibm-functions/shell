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
        if (str.then) {
            str.then(str => result.innerText = str)
        } else {
            result.innerText = str
        }
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
    result.style.fontSize = '1.125em'
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
 * Invoke a given command, and return the raw (i.e. not formatted) usage model
 *
 */
const usageFromCommand = command => repl.qexec(command)
      .then(_ => {
          console.error('Invalid usage model', _)
          throw new Error('Internal Error')
      })
    .catch(usageError => usageError.raw)

/**
 * Invoke a given command, and extract the breadcrumb title from the resulting usage model
 *
 */
const breadcrumbFromCommand = command => usageFromCommand(command)
      .then(usage => usage.breadcrumb || usage.title)

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
        const { title, breadcrumb=title, header, example, detailedExample, sampleInputs,
                commandPrefix, available, parents=[], related, required, optional, oneof } = message

        // the return value will be `result`; we will populate it with
        // those fields now; `body` is the flex-wrap portion of the
        // content
        const result = div(undefined, 'fade-in'),
              body = div(),
              left = div()  // usage and detailedExample

        result.style.margin = '1em calc(1ex + 1em)' // 1ex+1em try to match the '> ' bit of the REPL
        result.style.border = '1px solid var(--color-ui-03)'
        result.style.padding = '1em'
        result.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.1)'
        result.style.color = 'initial'

        //
        // breadcrumb
        //
        {
            const container = div(undefined, 'bx--breadcrumb bx--breadcrumb--no-trailing-slash', 'h1')
            result.appendChild(container)

            /** add a single breadcrumb to the UI; defaultCommand means use the string as a command */
            const addBreadcrumb = (options, defaultCommand, noSlash=false) => {
                const stringOpt = typeof options === 'string',
                      cmd = !stringOpt ? options.command : defaultCommand && options,
                      label = stringOpt ? options : options.label || breadcrumbFromCommand(options.command)

                const item = span()
                item.classList.add('bx--breadcrumb-item')
                item.classList.add('capitalize')

                const dom = span(label, 'bx--no-link')
                item.appendChild(dom)

                if (!noSlash) {
                    item.appendChild(span('/', 'bx--breadcrumb-item--slash'))
                }

                container.appendChild(item)

                if (cmd) {
                    dom.classList.add('bx--link')
                    dom.onclick = () => repl.pexec(cmd)
                }
            }

            // now we add the breadcrumb chain to the UI
            addBreadcrumb({ label: 'Shell Docs', command: 'help' }) // root
            parents.forEach(_ => addBreadcrumb(_, true))            // parent path
            addBreadcrumb(breadcrumb, undefined, true)              // this leaf we're rendering (noSlash=true)
        }

        //
        // title
        //
        /*if (title) {
            const dom = div(title, 'capitalize', 'h1')
            dom.style.fontSize = '1.629em'
            dom.style.fontWeight = 300
            dom.style.color = 'var(--color-brand-01)'
            dom.style.margin = '0 0 .3rem'
            result.appendChild(dom)
        }*/

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
        body.style.marginTop = '0.375em'
        body.appendChild(left)
        result.appendChild(body)

        // example command
        if (example) {
            const examplePart = bodyPart(),
                  prePart = prefix('Usage'),
                  textPart = div(example)

            left.appendChild(examplePart)
            examplePart.appendChild(prePart)
            examplePart.appendChild(textPart)

            textPart.style.color = 'var(--color-support-02)'
        }

        // detailed example command
        if (detailedExample) {
            const examplePart = bodyPart(),
                  prePart = prefix('Example'),
                  textPart = div(detailedExample.command),
                  docPart = sans(div(detailedExample.docs))

            left.appendChild(examplePart)
            examplePart.appendChild(prePart)
            examplePart.appendChild(textPart)
            examplePart.appendChild(smaller(docPart))

            textPart.style.color = 'var(--color-support-02)'
        }

        /**
         * Render a table of options
         *
         */
        const makeTable = (title, rows) => {
            const availablePart = bodyPart(),
                  prePart = prefix(title),
                  table = document.createElement('table')

            table.className = 'log-lines'

            availablePart.appendChild(prePart)
            availablePart.appendChild(table)
            body.appendChild(availablePart)

            // render the rows
            rows.forEach(({command, name=command, label=name, aliases, dir:isDir=false, docs, partial=false, allowed, defaultValue}) => {
                const row = table.insertRow(-1),
                      cmdCell = row.insertCell(-1),
                      docsCell = row.insertCell(-1),
                      cmdPart = span(label),
                      dirPart = isDir && span('/'),
                      aliasesPart = aliases && span(undefined, 'deemphasize left-pad'),
                      docsPart = span(docs),
                      allowedPart = allowed && smaller(span(undefined))

                row.className = 'log-line entity'
                cmdCell.className = 'log-field'
                docsCell.className = 'log-field'

                cmdPart.style.fontWeight = '500'
                wrap(smaller(sans(docsPart)))

                // command aliases
                if (aliases) {
                    // aliasesPart.appendChild(span('('))
                    aliases.forEach(alias => {
                        const cmdCell = span(),
                              cmdPart = span(alias, 'clickable clickable-blatant'),
                              dirPart = isDir && span('/')

                        cmdPart.onclick = () => repl.pexec(`${commandPrefix ? commandPrefix + ' ' : ''}${alias}`)

                        aliasesPart.appendChild(cmdCell)
                        cmdCell.appendChild(cmdPart)
                        if (dirPart) cmdCell.appendChild(smaller(dirPart))
                    })
                    // aliasesPart.appendChild(span(')'))
                }

                // allowed and default values
                if (allowed) {
                    allowedPart.style.color = 'var(--color-text-02)'
                    allowedPart.appendChild(span('options: '))
                    allowed.forEach((value, idx) => {
                        const option = span(`${idx > 0 ? ', ' : ''}${value}${value !== defaultValue ? '' : '*'}`)
                        allowedPart.appendChild(option)
                    })
                }

                cmdCell.appendChild(cmdPart)
                if (dirPart) cmdCell.appendChild(smaller(dirPart))
                if (aliasesPart) cmdCell.appendChild(smaller(aliasesPart))
                docsCell.appendChild(docsPart)
                if (allowedPart) docsCell.appendChild(allowedPart)

                if (command) {
                    cmdPart.classList.add('clickable')
                    cmdPart.classList.add('clickable-blatant')
                    cmdPart.onclick = () => {
                        if (partial) {
                            return repl.partial(`${commandPrefix ? commandPrefix + ' ' : ''}${command}${partial === true ? '' : ' ' + partial}`)
                        } else {
                            return repl.pexec(`${commandPrefix ? commandPrefix + ' ' : ''}${command}`)
                        }
                    }
                }
            })

            return table
        }

        if (available) {
            makeTable('Available Commands', available)
        }

        if (required) {
            makeTable('Required Parameters', required)
        }

        if (optional) {
            makeTable('Optional Parameters', optional)
        }

        if (oneof) {
            makeTable('Required Parameters (choose one of the following)', oneof)
        }

        if (sampleInputs) {
            makeTable('Sample Inputs', sampleInputs)
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
    this.raw = message
    this.extra = extra
}

require('util').inherits(module.exports, Error)
