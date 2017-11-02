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

const debug = require('debug')('main')
debug('starting')

const electron = require('electron'),
      { app } = electron

debug('modules loaded')

/**
 * Should our BrowerWindows have a window frame?
 *
 */
const useWindowFrame = true

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

// linux oddities
//   context mismatch in svga_sampler_view_destroy
if (process.platform === 'linux') {
    app.disableHardwareAcceleration()
}

/**
 * Were we spawned in headless mode?
 *
 */
const isRunningHeadless = process.argv.find(arg => arg === '--fsh-headless')
try {
    if (isRunningHeadless && app.dock) app.dock.hide()
} catch (e) {
}
debug('isRunningHeadless %s', isRunningHeadless)

function createWindow(noHeadless, executeThisArgvPlease, subwindowPlease, subwindowPrefs) {
    debug('createWindow')

    if (noHeadless !== true && isRunningHeadless) {
        //
        // HEADLESS MODE
        //
        try {
            //app.dock.hide()
            return require('./headless').main(app, {
                createWindow: (executeThisArgvPlease, subwindowPlease, subwindowPrefs) => {
                    // craft a createWindow that has a first argument of true, which will indicate `noHeadless`
                    // because this will be called for cases where we want a headless -> GUI transition
                    if (app.dock) {
                        app.dock.show()
                    }
                    return createWindow(true, executeThisArgvPlease, subwindowPlease, subwindowPrefs)
                }
            })
        } catch (err) {
            // oof, something real bad happened
            console.error('Internal Error, please report this bug:')
            console.error(err)
            process.exit(1)
        }
    } else {
        // in case the second argument isn't undefined...
	if (noHeadless !== true) {
            executeThisArgvPlease = undefined
        }
    }

    if (subwindowPrefs && subwindowPrefs.bringYourOwnWindow) {
        return subwindowPrefs.bringYourOwnWindow()
    }

    // Create the browser window.
    let width = subwindowPrefs && subwindowPrefs.width || 1280,
        height = subwindowPrefs && subwindowPrefs.height || 960
    if (process.env.WINDOW_WIDTH) {
        width = parseInt(process.env.WINDOW_WIDTH)
        if (isNaN(width)) {
            console.error('Cannot parse WINDOW_WIDTH ' + process.env.WINDOW_WIDTH)
            width = 1280
        }
    }
    if (process.env.WINDOW_HEIGHT) {
        height = parseInt(process.env.WINDOW_HEIGHT)
        if (isNaN(height)) {
            console.error('Cannot parse WINDOW_HEIGHT ' + process.env.WINDOW_HEIGHT)
            height = 960
        }
    }

    const { BrowserWindow } = electron
    const opts = Object.assign({width: width, height: height,
                                frame: useWindowFrame,
                                titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default'},
                               subwindowPrefs && subwindowPrefs.position)
    debug('createWindow::new BrowserWindow')
    mainWindow = new BrowserWindow(opts)
    debug('createWindow::new BrowserWindow success')

    // install tray menu [DISABLED FOR NOW]
    /*if (noHeadless !== true && !executeThisArgvPlease) {
        mainWindow.tray = require('./tray')(electron, app, createWindow)
    }*/

    // remember certain classes of windows, so we don't have multiple
    // open; e.g. one for docs, one for videos...
    let fixedWindows = {}
    const openFixedWindow = ({type, event, url, options, size=mainWindow.getBounds(), position=mainWindow.getBounds()}) => {
        const existing = fixedWindows[type] || {},
              { window:existingWindow, url:currentURL }  = existing

        if (!existingWindow || existingWindow.isDestroyed()) {
            const window = new BrowserWindow({ width: size.width, height: size.height, frame: true/*, titleBarStyle: 'hidden,'*/ /*parent: mainWindow*/ })
            fixedWindows[type] = { window, url }
            window.setPosition(position.x + 62, position.y + 62)
            window.on('closed', () => { docsWindow = null })
            window.loadURL(url)
        } else {
            if (currentURL !== url) {
                existingWindow.loadURL(url)
                existing.url = url
            }
            existingWindow.focus()
        }

        event.preventDefault()
    }

    /** this event handler will be called when the window's content finishes loading */
    mainWindow.webContents.on('did-finish-load', () => {
        // for some reason, adding the title attribute to the new
        // BrowserWindow opts doesn't stick; and... this has to be on
        // did-finish-load, for some reason... at least these are true
        // statements for electron 1.6.x
        mainWindow.setTitle('IBM Cloud Functions Shell')
    })
    
    /** jump in and manage the way popups create new windows */
    mainWindow.webContents.on('new-window', (event, url, frameName, disposition, options, additionalFeatures) => {
        if (url.endsWith('/HELP')) {
            url = (process.env.HELP_URL || 'https://openwhisk.ng.bluemix.net/api/v1/web/nickm_wskng_demos/public/index.html') + '?upper_right_link=close&upper_right_text=close'
            openFixedWindow({ type: 'docs', event, url, options })

        } else if (url.startsWith('https://youtu.be')) {
            // special handling of youtube links
            openFixedWindow({ type: 'videos', event, url, options, size: { width: 800, height: 600 } })

        } else {
            event.preventDefault()
            require('open')(url)
        }
    })

    if (noHeadless === true && executeThisArgvPlease) mainWindow.executeThisArgvPlease = executeThisArgvPlease
    /*if (subwindowPlease === true)*/ {
        //app.dock.hide() // no ideal, as the dock icon still shows for a small amount of time https://github.com/electron/electron/issues/422
        mainWindow.subwindow = subwindowPrefs
    }

    // and load the index.html of the app.
  debug('mainWindow::loadURL')
  mainWindow.loadURL(require('url').format({
    pathname: require('path').join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }))

    require('./menu').install(app, electron.Menu, createWindow)

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })

    //
    // set up ipc from renderer
    //
    const { ipcMain } = electron
    ipcMain.on('synchronous-message', (event, arg) => {
        const message = JSON.parse(arg)
        switch (message.operation) {
        case 'quit': app.quit(); break;
        case 'open-graphical-shell': createWindow(true); break;
        case 'enlarge-window': mainWindow.setContentSize(1400, 1050, { animate: true }); break;
        case 'reduce-window': mainWindow.setContentSize(1024, 768, { animate: true }); break;
        case 'maximize-window': mainWindow.maximize(); break;
        case 'unmaximize-window': mainWindow.unmaximize(); break;
        }
        event.returnValue = 'ok'
    })
    ipcMain.on('asynchronous-message', (event, arg) => {
        const message = JSON.parse(arg)
        switch (message.operation) {
        }
    })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin' || isRunningHeadless) { // if we're running headless, then quit on window closed, no matter which platform we're on
    app.quit()
  }
})

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
})

debug('all done here, the rest is async')
