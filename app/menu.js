const isDev = false//require('electron-is-dev');
const path = require('path')

exports.install = (app, Menu, createWindow) => {
    if (!isDev) {
        const fileMenuItems = [
            { label: 'New Window',
              click: () => createWindow(),
              accelerator: 'CommandOrControl+N'
            },
            { role: 'close' }
        ]
        if (process.platform !== 'darwin') {
            fileMenuItems.push({type: 'separator'})
            fileMenuItems.push({role: 'quit'})
        }

        const helpMenuItems = [
            {
                label: 'Help with Commands',
                click: () => {
                    try {
                        const { webContents } = require('electron')
                        webContents.getFocusedWebContents().send('/repl/pexec', { command: 'help' })
                    } catch (err) {
                        console.log(err);
                    }
                }
            },
            {type: 'separator'},
            {
                label: 'Report Issue...',
                click () { require('electron').shell.openExternal('https://ibm.biz/shell-support') }
            },
            {
                label: 'Learn More',
                click () { require('electron').shell.openExternal('https://ibm.biz/serverless-research') }
            }
        ]
        
        const menuTemplate = [
            {
                label: 'File',
                submenu: fileMenuItems
            },
            {
                label: 'Edit',
                submenu: [
                    {role: 'undo'},
                    {role: 'redo'},
                    {type: 'separator'},
                    {role: 'cut'},
                    {role: 'copy'},
                    {role: 'paste'},
                    {role: 'pasteandmatchstyle'},
                    {role: 'delete'},
                    {role: 'selectall'}
                ]
            },

            {
                label: 'View',
                submenu: [
                    {role: 'reload'},
                    {role: 'forcereload'},
                    {role: 'toggledevtools'},
                    {type: 'separator'},
                    {role: 'resetzoom'},
                    {role: 'zoomin'},
                    {role: 'zoomout'},
                    {type: 'separator'},
                    {role: 'togglefullscreen'}
                ]
            },

            {
                role: 'window',
                submenu: [
                    {role: 'minimize'},
                    {role: 'close'}
                ]
            },

            {
                role: 'help',
                submenu: helpMenuItems
            }
        ]

        const about = { label: 'About IBM Cloud Functions Shell',
                        click: () => {
                            try {
                                require('./plugins/welcome/about')()
                            } catch (err) {
                                console.log(err)
                            }
                        }
                      }
        
        if (process.platform === 'darwin') {
            menuTemplate.unshift({
                label: 'IBM Cloud Functions Shell',
                submenu: [
                    about,
                    {type: 'separator'},
                    {role: 'services', submenu: []},
                    {type: 'separator'},
                    {role: 'hide'},
                    {role: 'hideothers'},
                    {role: 'unhide'},
                    {type: 'separator'},
                    {role: 'quit'}
                ]
            })
        } else {
            // for windows and linux, put About in the Help menu
            helpMenuItems.push({type: 'separator'})
            helpMenuItems.push(about)
        }

        const menu = Menu.buildFromTemplate(menuTemplate);
        Menu.setApplicationMenu(menu);
    }
}
