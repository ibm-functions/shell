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
 * This command is no longer needed. See shell issue #662. We leave a
 * bit of a welcome mat in its place.
 *
 */
module.exports = (commandTree, prequire) => {
    // Install the routes
    commandTree.listen(`/wsk/app/init`, () => {
        const msg = document.createElement('div'),
              clicky = document.createElement('span')

        msg.appendChild(document.createTextNode('Welcome to Composer. To begin, you can try '))

        clicky.innerText = 'app create'
        clicky.className = 'clickable clickable-blatant'
        msg.appendChild(clicky)

        msg.appendChild(document.createTextNode(' and select one of the samples.'))

        return msg
    })
}
