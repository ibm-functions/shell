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

const help = fullHelp => function(_1,_2, _3, _4, _5, _6, _7, options) {
    if (options.full || options.all || options.f || options.a) {
        //
        // user asked for full (not just composer) help
        //
        return fullHelp.apply(undefined, arguments)
    }

    const path = require('path')

    // inject the CSS we depend upon
    ui.injectCSS(path.join(__dirname, '..', 'web', 'css', 'help.css'))
    ui.injectCSS(path.join(__dirname, '../../../../content/css/grid.css'))

    // inject our HTML content
    return ui.loadHTML(path.join(__dirname, '..', 'web', 'html', 'help.html'))
        .then(html => {
            const wrapper = document.createElement('div')
            wrapper.id = 'composer-help'
            wrapper.innerHTML = html
            return {
                type: 'custom',
                sidecarHeader: false,
                modes: [
                    { mode: 'Report an Issue', actAsButton: true, direct: () => window.open('https://ibm.biz/shell-support') },
                    { mode: 'Chat on Slack', actAsButton: true, direct: () => window.open('https://ibm.biz/composer-users') }
                ],
                content: wrapper
            }
        })
        .catch(err => {
            console.error(err)
            throw new Error('Internal Error')
        })
}

/**
 * Here is the app kill entry point. Here we register command
 * handlers.
 *
 */
module.exports = (commandTree, prequire) => {
    // we're overriding the built-in help; this is the built-in
    // command impl that we'll delegate to
    const fullHelp = commandTree.find('/help').$

    // install the command handler
    commandTree.listen('/help', help(fullHelp), { docs: 'Here you are!',
                                                  needsUI: true,
                                                  fullscreen: false,
                                                  placeholder: 'Loading Help...' })
}
