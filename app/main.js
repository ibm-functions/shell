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

/**
 *
 *
 */
let electron, app
function initGraphics(command=[], subwindowPlease, subwindowPrefs) {
    debug('initGraphics', command, subwindowPlease, subwindowPrefs)

    // handle squirrel install and update events
    try {                                                                                                     
        if (require('electron-squirrel-startup')) return                                                      
    } catch (err) {                                                                                           
        debug('electron components not installed')                                                            
        require('colors')
        console.log('Graphical components are not yet installed. You may do so via ' + 'npm run install-ui'.red.bold)
        process.exit(1)                                                                                       
    }

    if (!electron) {
        debug('loading electron')
        electron = require('electron'),
        { app } = electron

        if (!app) {
            // then we're still in pure headless mode; we'll need to fork ourselves to spawn electron
            const path = require('path')
            const { spawn } = require('child_process')
            const appHome = path.resolve(__dirname)

            const args = [appHome, ...command]
            debug('spawning electron', appHome, args)

            // pass through any window options, originating from the command's usage model, on to the subprocess
            const windowOptions = {}
            if (subwindowPlease) {
                debug('passing through subwindowPlease', subwindowPlease)
                windowOptions.subwindowPlease = subwindowPlease
            }
            if (subwindowPrefs && Object.keys(subwindowPrefs).length > 0) {
                debug('passing through subwindowPrefs', subwindowPrefs)
                windowOptions.subwindowPrefs = JSON.stringify(subwindowPrefs)
            }

            // note how we ignore the subprocess's stdio if debug mode
            // is not enabled this allows you (as a developer) to
            // debug issues with spawning the subprocess by passing
            // DEBUG=* or DEBUG=main
            const env = Object.assign({},
                                      process.env,
                                      windowOptions)
            delete env.FSH_HEADLESS
            const child = spawn(electron, args, { stdio: debug.enabled ? 'inherit' : 'ignore',
                                                  env })

            if (!debug.enabled) {
                // as with the "ignore stdio" comment immediately
                // above: unless we're in DEBUG mode, let's disown
                // ("unref" in nodejs terms) the subprocess
                child.unref()
            }

            debug('spawning electron done, this process will soon exit')
            process.exit(0)

        } else {
            debug('loading electron done')
        }
    }

    // linux oddities
    //   "context mismatch in svga_sampler_view_destroy"
    if (process.platform === 'linux') {
        app.disableHardwareAcceleration()
    }

    // This method will be called when Electron has finished
    // initialization and is ready to create browser windows.
    // Some APIs can only be used after this event occurs.
    app.on('ready', () => {
        createWindow(true, command.length > 0 && command, subwindowPlease, subwindowPrefs)
    })

    if (process.env.RUNNING_SHELL_TEST) {
        app.on('before-quit', function() {
            const config = { tempDirectory: require('path').join(__dirname, '../tests/.nyc_output') },
                  nyc = new (require('nyc'))(config)      // create the nyc instance
            nyc.createTempDirectory()                     // in case we are the first to the line
            nyc.writeCoverageFile()                       // write out the coverage data for the renderer code

            mainWindow.webContents.send('/coverage/dump', config)
        })
    }

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
} /* initGraphics */

function initHeadless() {
    if (/*noHeadless !== true &&*/ isRunningHeadless) {
        debug('initHeadless')

        app = {
            quit: () => process.exit(0),
            getPath: which => {
                if (which === 'userData') {
                    const { join } = require('path')
                    const { name } = require('./package.json')

                    switch (process.platform) {
                    case 'darwin':
                        return join(process.env.HOME, 'Library', 'Application Support', name)
                    case 'linux':
                        const home = process.env.XDG_CONFIG_HOME || require('expand-home-dir')('~/.config')
                        return join(home, name)
                    case 'windows':
                        return join(process.env.APPDATA, name)
                    }
                } else {
                    throw new Error(`Unsupported getPath request ${which}`)
                }
            }
        }

        //
        // HEADLESS MODE
        //
        try {
            //app.dock.hide()
            return require('./headless').main(app, {
                createWindow: (executeThisArgvPlease, subwindowPlease, subwindowPrefs) => {
                    // craft a createWindow that has a first argument of true, which will indicate `noHeadless`
                    // because this will be called for cases where we want a headless -> GUI transition
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
} /* initHeadless */

/**
 * Should our BrowerWindows have a window frame?
 *
 */
const useWindowFrame = true

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow


/**
 * Were we spawned in headless mode?
 *
 */
const fshShell = process.argv.find(arg => arg === 'shell')
const isRunningHeadless = process.env.FSH_HEADLESS && !fshShell
if (!isRunningHeadless) {
    // then spawn the electron graphics
    const dashDash = process.argv.indexOf('--')
    const rest = dashDash === -1 ? [] : process.argv.slice(dashDash + 1)
    debug('using args', rest)
    initGraphics(rest, process.env.subwindowPlease, process.env.subwindowPrefs && JSON.parse(process.env.subwindowPrefs))

} else {
    // otherwise, don't spawn the graphics; stay in headless mode
    process.argv.splice(0, 1)
    initHeadless()
}

//try {
//    if (isRunningHeadless && app.dock) app.dock.hide()
//} catch (e) {
//}
debug('isRunningHeadless %s', isRunningHeadless)

function createWindow(noHeadless, executeThisArgvPlease, subwindowPlease, subwindowPrefs) {
    debug('createWindow')

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

    if (!electron) {
        debug('we need to spawn electron', subwindowPlease, subwindowPrefs)
        initGraphics(['--'].concat(executeThisArgvPlease), subwindowPlease, subwindowPrefs)
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
        const path = require('path'),
              { productName } = require(path.join(__dirname, './build/config.json'))

        mainWindow.setTitle(productName)
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
            require('opn')(url)
        }
    })

    if (noHeadless === true && executeThisArgvPlease) mainWindow.executeThisArgvPlease = executeThisArgvPlease
    /*if (subwindowPlease === true)*/ {
        //app.dock.hide() // no ideal, as the dock icon still shows for a small amount of time https://github.com/electron/electron/issues/422
        debug('subwindowPrefs', subwindowPrefs)
        mainWindow.subwindow = subwindowPrefs
    }

    // and load the index.html of the app.
  debug('mainWindow::loadURL')
  mainWindow.loadURL(require('url').format({
      pathname: require('path').join(__dirname, 'build/index.html'),
      protocol: 'file:',
      slashes: true
  }))

    debug('install menus')
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

    //
    // take a screenshot; note that this has to be done in the main
    // process, due to the way clipboard.writeImage is implemented on
    // Linux. on macOS, this could be done entirely in the renderer
    // process. on Linux, however, the nativeImages aren't
    // translatable between the renderer and main processes as fluidly
    // as they are on macOS. oh well! this is why the screenshot
    // plugin has to pollute main.js
    //
    debug('ipc registration')
    ipcMain.on('capture-page-to-clipboard', (event, contentsId, rect) => {
	try {
	    const { clipboard, nativeImage, webContents } = electron
	    webContents.fromId(contentsId).capturePage(rect, image => {
		try {
		    const buf = image.toPNG()
		    clipboard.writeImage(nativeImage.createFromBuffer(buf))
		    event.sender.send('capture-page-to-clipboard-done', buf)
		} catch (err) {
		    console.log(err)
		    event.sender.send('capture-page-to-clipboard-done')
		}
	    })
	} catch (err) {
	    console.log(err)
	    event.sender.send('capture-page-to-clipboard-done')
	}
    })
    // end of screenshot logic

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

    debug('createWindow done')
}

debug('all done here, the rest is async')
