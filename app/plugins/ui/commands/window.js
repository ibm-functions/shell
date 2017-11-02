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
 * This plugin introduces commands to control the window size.
 *
 */
module.exports = commandTree => {
    const window = commandTree.subtree('/window', { docs: 'Window sizing commands, e.g. "window max" and "window unmax"' })
    
    //commandTree.listen('/window/bigger', (x,y,z,modules) => modules.ui.tellMain('enlarge-window'))
    //commandTree.listen('/window/smaller', (x,y,z,modules) => modules.ui.tellMain('reduce-window'))
    commandTree.listen('/window/max', (x,y,z,modules) => modules.ui.tellMain('maximize-window'), { docs: 'Maximize the window' })
    commandTree.listen('/window/unmax', (x,y,z,modules) => modules.ui.tellMain('unmaximize-window'), { docs: 'Unmaximize the window' })
}
