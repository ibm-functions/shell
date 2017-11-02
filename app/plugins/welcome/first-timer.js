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

/**
 * Detect first-timer user
 *
 */
module.exports = (commandTree, prequire) => {
    const localStorageKey = 'wsk.first-timer'

    commandTree.listen('/firsttimer/reset', () => {
        localStorage.removeItem(localStorageKey)
        return true
    }, { hide: true })

    commandTree.listen('/firsttimer/opt-in', () => {
        //ui.getCurrentPrompt().readOnly = false

        // hide the full-screen
        ui.hideFullscreen()

        // make note of the choice
        repl.qexec('tracker opt-in')
        return true
    }, { hide: true })

    commandTree.listen('/firsttimer/opt-out', () => {
        // make note of the choice
        repl.qexec('tracker opt-out')
        
        // then exit the program
        repl.pexec('exit')
    }, { hide: true })

    eventBus.on('/init/done', () => {
        return // disabled for now 20170919
        
        if (process.env.NO_FIRST_TIMER) return

        const isFirstTimer = !localStorage.getItem(localStorageKey)

        if (isFirstTimer) {
            // remember the user
            localStorage.setItem(localStorageKey, true)

            const fs = require('fs'),
                  path = require('path')

            fs.readFile(path.join(__dirname, 'first-timer.html'), (err, data) => {
                if (err) {
                    console.error(err)
                } else {
                    //ui.getCurrentPrompt().readOnly = true
                    ui.showFullscreen().innerHTML = data.toString()
                }
            })
        }
    })
}
