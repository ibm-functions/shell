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

const debug = require('debug')('about')

/**
 * The repl allows plugins to provide their own window, via the
 * `bringYourOwnWindow` attribute. Here, we define our
 * bringYourOwnWindow behavior, for the `about` command.
 *
 */
const aboutWindow = () => {  /* bringYourOwnWindow impl */
    debug('aboutWindow')

    const path = require('path'),
          root = path.join(__dirname, '..', '..')

    const foo = require('electron-about-window').default({
        icon_path: path.join(root, 'content/icons/svg/blue-dolphin.svg'),
        package_json_dir: root,
        use_inner_html: true,
        css_path: path.join(root, 'content/css/about.css'),
        win_options: { width: 600, height: 600 }
    })

    // remove the click handler from the title element
    foo.webContents.on('did-finish-load', () => {
        foo.webContents.executeJavaScript("const t = document.querySelector('.title'), c=t.cloneNode(false); while (t.hasChildNodes()) c.appendChild(t.firstChild); t.parentNode.replaceChild(c, t);")
    })
}

/**
  * Load the package.json for the tool
  *
  */
const readPackageDotJson = () => {
    debug('readPackageDotJson')
    return require(require('path').join(__dirname, '../../package.json'))
}

/**
 * Return, textually, the current version of the tool
 *
 */
const getVersion = () => {
    debug('getVersion')
    return readPackageDotJson().version
}

/**
 * Report the current version, and availability of updates
 *    For headless, return a textual concatenation of the two.
 */
const reportVersion = (_1, _2, argv) => {
    debug('reportVersion')

    const checkForUpdates = argv.find(_ => _ === '-u'),
          version = getVersion()

    if (!checkForUpdates) {
        return version
    }

    if (ui.headless) {
        console.log('You are currently on version ' + version.blue)
    }

    if (ui.headless) {
        process.stdout.write('Checking for updates... '.dim)
    }

    return repl.qexec('updater check')
      .then(updates => {
          if (updates === true) {
              // then we're up to date, so just report the version
              if (ui.headless) {
                  return 'you are up to date!'
              } else {
                  return version
              }
          } else {
              // then updates are available, so report the updates available message
              return updates
          }
      })
}

/**
 * Here we install the command handlers for /version and /about
 *
 */
module.exports = (commandTree, prequire) => {
    debug('init')

    // for menu
    if (!commandTree) {
        return aboutWindow()
    }

    // these commands don't require any auth
    const noAuthOk = true

    /**
     * Print out the current version of the tool, as text
     *
     */
    commandTree.listen('/version',      // the command path
                       reportVersion,   // the command handler
                       { noAuthOk })    // the command options

    /**
     * Open a graphical window displaying more detail about the tool
     *
     */
    commandTree.listen('/about', () => {
        if (!ui.headless) {
            aboutWindow()
        }
        return true // tell the REPL we succeeded
    }, { hidden: true,                        // don't list about in the help menu
         needsUI: true,                       // about requires a window
         bringYourOwnWindow: aboutWindow,     // about will manage its own window
         noAuthOk                             // about doesn't require openwhisk authentication
       })

    debug('init done')
}
