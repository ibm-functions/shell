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
exports.success = (operation, message) => {
    const msg = document.createElement('div'),
          clicky = document.createElement('span')

    msg.appendChild(document.createTextNode((operation ? `The plugin ${name} has been ${operation}.` : '') + ' Please '))
    msg.appendChild(clicky)
    msg.appendChild(document.createTextNode(' to complete the installation.'))

    clicky.innerText = 'reload'
    clicky.className = 'clickable clickable-blatant'
    clicky.onclick = () => require('electron').remote.getCurrentWindow().reload()

    return msg
}
