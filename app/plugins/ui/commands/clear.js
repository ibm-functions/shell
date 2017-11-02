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
 * This plugin introduces the /clear command, which clear the consoles
 *
 */

module.exports = commandTree => {
    commandTree.listen('/clear', (_1, _2, _3, modules) => {
        modules.ui.removeAllDomChildren(document.querySelector('#main-repl .repl-inner'))

        //Array.prototype.forEach.call(document.querySelectorAll('#main-repl .repl-block:not(.processing)'),
          //                           node => node.parentNode.removeChild(node))

        return true // tell the repl we're all good
    }, { docs: 'Clear the console' })
}

