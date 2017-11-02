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
 * Tray menu: e.g. upper-right menu on MacOS, or lower-right widget on Windows
 *
 */

const path = require('path')

/**
 * Returns the tray object. The caller is responsible for grabbing a
 * durable reference to the return value. For example, you might stash
 * it in a BrowserWindow object.
 *
 */
module.exports = ({Tray, Menu}, app, createWindow) => {
    const screen = require('electron').screen,
          screenSize = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea,
          dimensions = { width: 800, height: 600 }

    const template = [
        {
            label: 'Visualize a Composition',
            //icon: path.join(__dirname, '../assets/icons/png/activity-timeline-icon-50.png'),
            click: () => createWindow(true, 'app viz --select', true, {
                title: 'App Visualization', sidecarOnly: true, theme: 'dark',
                width: 1024, height: 768
            })
        },
        {type: 'separator'},

        {
            label: 'Activity Timeline',
            icon: path.join(__dirname, '../assets/icons/png/activity-timeline-icon-50.png'),
            click: () => createWindow(true, 'loading activity timeline ...', true, Object.assign({
                title: 'Activity Timeline', theme: 'dark', 
                position: { x: screenSize.x + (screenSize.width - dimensions.width - 100),
                            y: screenSize.y /*+ screenSize.height - dimensions.height*/ }
            }, dimensions))
        },

        {
            label: 'Activity Grid',
            icon: path.join(__dirname, '../assets/icons/png/activity-grid-icon-50.png'),
            click: () => createWindow(true, 'loading activity grid ...', true, Object.assign({
                title: 'Activity Grid', theme: 'dark',
                position: { x: screenSize.x + (screenSize.width - dimensions.width - 100),
                            y: screenSize.y + /*screenSize.height -*/ dimensions.height }
            }, dimensions))
        },
        {
            label: 'CLI',
            icon: path.join(__dirname, '../assets/icons/png/cli-icon-50.png'),
            click: () => createWindow(true, '')
        },

        {type: 'separator'},
        {
            label: 'Run a Load Test',
            //icon: path.join(__dirname, '../assets/icons/png/activity-timeline-icon-50.png'),
            click: () => createWindow(true, 'lt <action> --numThreads 1 --numIters 10 -p key value', true, {
                title: 'Load Test', sidecarOnly: false,
                partialExec: true,
                width: dimensions.width,
                height: 130,
                /*position: { x: screenSize.x + (screenSize.width - 2 * dimensions.width - 100),
                            y: screenSize.y + screenSize.height - dimensions.height }*/
            })
        },
        {
            label: 'Switch Namespace',
            //icon: path.join(__dirname, '../assets/icons/png/activity-timeline-icon-50.png'),
            click: () => createWindow(true, 'auth list        # click on a namespace to switch', true, Object.assign({
                title: 'Namespace Chooser', sidecarOnly: false,
                /*position: { x: screenSize.x + (screenSize.width - 2 * dimensions.width - 100),
                            y: screenSize.y + screenSize.height - dimensions.height }*/
            }, dimensions))
        },
        {
            label: 'Quit OpenWhisk Shell',
            click: () => app.quit()
        }
    ]

    const platform = require('os').platform(),
          image = platform === 'win32' ? '../assets/icons/ico/openwhisk_512x512_jnb_icon.ico'
          : '../assets/icons/png/icon.png'

    // tray.setToolTip('Common OpenWhisk tasks')

    const tray = new Tray(path.join(__dirname, image))
    tray .setContextMenu(Menu.buildFromTemplate(template))

    // somebody has to grab a reference to this, otherwise it'll be GCd
    return tray
}
