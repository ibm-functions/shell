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

const debug = require('debug')('history')
debug('starting')

/**
 * This plugin introduces a command history feature, and a few
 * commands to help with managing command history
 *
 */

// localStorage key
const key = 'openwhisk.history',
      DEFAULT_HISTORY_N = 20 // the default number of history elements to show with /history

let lines = JSON.parse(localStorage.getItem(key)) || [],
    cursor = lines.length // pointer to historic line

/** change the cursor, protecting against under- and overflow */
const guardedChange = incr => {
    const newCursor = cursor + incr

    if (newCursor < 0) cursor = 0
    else if (newCursor > lines.length) cursor = lines.length
    else cursor = newCursor

    //console.log('history::newCursor', cursor, lines.length, lines[cursor])
    return cursor
}

/** clear out all history */
const wipe = () => {
    lines = []
    localStorage.setItem(key, JSON.stringify(lines))
    return true
}

/** add a line of repl history */
const add = line => {
    if (lines.length === 0 || JSON.stringify(lines[lines.length - 1]) !== JSON.stringify(line)) {
        // don't add sequential duplicates
        lines.push(line)
        localStorage.setItem(key, JSON.stringify(lines))
        //console.log('history::add', cursor)
    }
    cursor = lines.length
    return cursor - 1
}

/** update a line of repl history -- for async operations */
const update = (cursor, updateFn) => {
    //console.log('history::update', cursor)
    updateFn(lines[cursor])
    localStorage.setItem(key, JSON.stringify(lines))
}

/** execute the command N again */
const again = (N, historyEntry) => {
    if (!lines[N]) {
        throw new Error('Could not find the command to re-execute')
    } else {
        //console.log('history::again', N, lines[N])
        update(historyEntry, entry => {
            entry.raw = lines[N].raw
        })
        return repl.qfexec(lines[N].raw)
    }
}

const parseN = str => {
    try {
        return parseInt(str)
    } catch(e) {
    }
}

module.exports = commandTree => {
    debug('init')

    /** clear view or clear history */
    commandTree.listen('/history/clear', wipe, { docs: 'Clear your command history' })

    /** list current history */
    commandTree.listen('/history', (_1, _2, argv) => {
        const filterStr = !parseN(argv[1]) && argv[1],
              filter = filterStr ? line => !line.raw.startsWith('history') && line.raw.indexOf(filterStr) >= 0 : () => true, // ignore history commands if a filterStr is specified
              N = parseN(argv[argv.length - 1]) || DEFAULT_HISTORY_N,
              recent = lines.slice(cursor - N - 1, cursor + 1)

        return recent.map((line, idx) => {
            if (!filter(line)) return

            // some commands can be super long... try to trim them down for the initial display
            const shortForm = line.raw.substring(0, line.raw.indexOf(' =')) || line.raw,
                  whitespace = shortForm.indexOf(' '),
                  shortFormPretty = document.createElement('span'),
                  command = document.createElement('strong'),
                  rest = document.createElement('span')

            shortFormPretty.appendChild(command)
            shortFormPretty.appendChild(rest)
            command.innerText = shortForm.substring(0, whitespace === -1 ? shortForm.length : whitespace)
            if (whitespace !== -1) {
                rest.innerText = shortForm.substring(whitespace)
            }

            return Object.assign({}, line, { type: `${cursor - (N - idx + 1)}s`,
                                             fullName: line.raw,
                                             name: shortFormPretty,
                                             noSort: true,
                                             onclick: () => repl.pexec(line.raw)
                                           })
        }).filter(x=>x)
    }, { docs: 'Show recently executed commands' })

    /** re-execute from history */
    commandTree.listen('/!!', (_1, _2, argv, _4, _5, execOptions) => {
        const N = argv[1] || cursor - 1  // use the last command, if the user entered only "!!"
        return again(N, execOptions && execOptions.history)
    }, { docs: 'Re-execute the last command, or, with !! N, the command at history position N ' })
    

    const self = {}

    /** return the given line of history */
    self.line = idx => lines[idx]
    self.lineByIncr = incr => self.line(guardedChange(incr))

    /** add a line of repl history */
    self.add = add

    /** update a given line of repl history -- for async operations */
    self.update = update

    /** go back/forward one entry */
    self.previous = () => self.lineByIncr(-1)
    self.next = () => self.lineByIncr(+1)
    self.first = () => { cursor = 0; return self.line(cursor); }
    self.last = () => { cursor = lines.length - 1; return self.line(cursor); }

    /** find */
    self.find = filter => {
        for (let idx = lines.length - 1; idx >= 0; idx--) {
            if (filter(lines[idx])) {
                return lines[idx]
            }
        }
    }

    debug('init done')
    return self 
}
