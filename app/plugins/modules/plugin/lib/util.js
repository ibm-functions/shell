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
 * Return a message for the REPL, asking the user to reload
 *
 */
exports.success = (operation, availableMessage, updatedCommands) => {
    const msg = document.createElement('div'),
          clicky = document.createElement('span')

    if (operation !== false) {
        msg.appendChild(document.createTextNode((operation ? `The plugin ${name} has been ${operation}.` : '') + ' Please '))
        msg.appendChild(clicky)
        msg.appendChild(document.createTextNode(' to complete the installation.'))
    }

    clicky.innerText = 'reload'
    clicky.className = 'clickable clickable-blatant'
    clicky.onclick = () => require('electron').remote.getCurrentWindow().reload()

    if (availableMessage && updatedCommands && updatedCommands.length > 0) {
        const available = document.createElement('div'),
              leadIn = document.createElement('span'),
              list = document.createElement('span')

        if (operation !== false) {
            available.style.paddingTop = '1em'
        }

        msg.appendChild(available)
        available.appendChild(leadIn)
        available.appendChild(list)

        leadIn.innerText = `The following commands are ${availableMessage}:`

        list.style.display = 'flex'
        list.style.flexWrap = 'wrap'

        updatedCommands.forEach(cmd => {
            const cmdDom = document.createElement('span')
            cmdDom.innerText = cmd
            cmdDom.className = 'clickable clickable-blatant'
            cmdDom.onclick = () => repl.partial(cmd)
            cmdDom.style.paddingLeft = '1em'

            list.appendChild(cmdDom)
        })
    }

    return msg
}
