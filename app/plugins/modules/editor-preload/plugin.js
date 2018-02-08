/*
 * Copyright 2018 IBM Corporation
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

const debug = require('debug')('editor-preload')
debug('loading')

const path = require('path'),
      { lockIcon, edit } = require(path.join(__dirname, '../editor/lib/readonly'))

debug('done loading prereqs')

/**
 * A preloaded plugin that enhances the view modes for actions
 *
 */
module.exports = (commandTree, prequire) => {
    debug('initializing')
    const wsk = prequire('/ui/commands/openwhisk-core'),
          getAction = ui.currentSelection

    wsk.addActionMode(lockIcon({wsk,
                                getAction,
                                mode: 'unlock',
                                icon: 'fas fa-lock',
                                tooltip: 'You are in read-only mode.\u000aClick to edit.',  // TODO externalize string
                                direct: edit({wsk, getAction})
                               }), 'unshift')
}

debug('finished loading')
