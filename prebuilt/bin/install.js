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

const fs = require('fs'),
      spawn = require('child_process').spawn,
      colors = require('colors'),
      osTmpDir = require('os-tmpdir'),
      tmp = require('tmp'),
      path = require('path'),
      extract = require('extract-zip'),
      nugget = require('nugget')

const config = require(path.join(__dirname, '..', 'config.json')),
      version = process.argv[2] || config.latest,
      platform = process.argv[3] || process.platform,
      files = version && config.files[version],
      url = files && files[platform]

/**
 * Some severe error occurred
 *
 */
const handleError = (err, cleanup, reject) => {
    // done in main.catch console.error(err)
    if (cleanup) cleanup()
    reject(err)
}

const download = (url, tmpPath) => new Promise((resolve, reject) => {
    nugget(url, { target: tmpPath }, err => {
        if (err) {
            reject(err)
        } else {
            resolve()
        }
    })
})

/**
 * Main routine
 *
 */
const main = () => new Promise((resolve, reject) => {
    if (!url || process.argv[2] === 'help' || process.argv.find(_ => _ === '-help' || _ === '-h')) {
        return reject('Usage: install.js <version> [platform]')
    }

    // npm tries to make a fsh.cmd for us. it doesn't work with our bat file.
    if (process.platform === 'win32') {
        const cmd = require('path').join(process.cwd(), '..', '..', '..', 'fsh.cmd')
        if (require('fs').existsSync(cmd)) {
            require('fs').writeFileSync(cmd, '@ECHO OFF\r\n"%~dp0\\node_modules\\@ibm-functions\\shell\\bin\\fsh" %*')
        }
    }

    console.log()
    //console.log('Installing IBM Cloud Functions Shell'.green)

    tmp.dir({ dir: osTmpDir() }, (err, tmpDir, removeTmpDir) => {
        if (err) throw err

        try {
            const tmpPath = path.join(tmpDir, 'IBM-Cloud-Functions' + (process.platform === 'darwin' ? '.dmg' : '.zip'))

            /** make a best-effort attempt to remove our temporary bits */
            const cleanup = () => {
                try {
                    fs.unlinkSync(tmpPath)
                    removeTmpDir()
                } catch (err) {
                }
            }

            download(url, tmpPath)
                .then(() => {
                    // download done

                    // and now extract the zip
                    process.stdout.write('Extracting...')
                    const destDir = path.join(__dirname, '..', 'dist')

                    if (process.platform === 'darwin') {
                        const child = spawn('hdiutil', ['attach', '-readonly', '-nobrowse', tmpPath], { stderr: 'inherit' })
                        let out = ''
                        child.on('close', () => {
                            const mountPoint = out.substring(out.lastIndexOf('Apple_HFS') + 'Apple_HFS'.length).trim()
                                  || '/Volumes/IBM Cloud Functions Shell'

                            // console.error('mountPoint', mountPoint)
                            // console.error(out)

                            const pathForMac = path.join(destDir, 'IBM Cloud Functions Shell-darwin-x64'),
                                  pathForMac2 = path.join(pathForMac, 'IBM Cloud Functions Shell.app')
                            try {
                                fs.mkdirSync(destDir)
                            } catch (err) {
                            }
                            try {
                                fs.mkdirSync(pathForMac)
                            } catch (err) {
                            }
                            try {
                                fs.mkdirSync(pathForMac2)
                            } catch (err) {
                            }
                            require('fs-extra').copySync(path.join(mountPoint, 'IBM Cloud Functions Shell.app'),
                                                         pathForMac2)

                            const child = spawn('hdiutil', ['detach', mountPoint], { stderr: 'inherit' })
                            child.on('close', () => {
                                //console.log('Finished extracting for darwin')
                                console.log(' done'.green)
                                cleanup()
                                resolve()
                            })

                        })
                        child.stdout.on('data', data => {
                            out += data.toString()
                        })
                    } else {
                        extract(tmpPath, { dir: destDir }, err => {
                            if (err) {
                                handleError(err, cleanup, reject)
                            }
                            cleanup()
                            resolve()
                        })
                    }
                })
                .catch(err => handleError(err, cleanup, reject))
        } catch (err) {
            handleError(err, undefined, reject)
        }
    })
})

/**
 * Welcome the user
 *
 */
const welcome = () => {
    console.log()
    console.log()
    console.log('\tWelcome to the ' + 'Functional Programming Shell'.green + ' for the IBM Cloud')
    console.log('\tTo get started, try ' + 'fsh help'.green + ' or ' + 'fsh app preview @demos/hello.js'.green)
    console.log()
    console.log('\tSupport: ' + 'GitHub'.yellow + ' ibm.biz/composer-support '.dim + 'Slack'.yellow + ' ibm.biz/composer-users'.dim)
    console.log()
    console.log('\tWe ask early adopters to help improve the Shell by providing ' + 'anonymous'.blue)
    console.log('\tdiagnostic and usage information. If you disagree, please let us know,')
    console.log('\tand remove the tool via ' + 'npm uninstall -g @ibm-functions/shell'.dim)
    console.log()
    
    process.exit(0)
}

// if invoked from the CLI, all we do is call main
main()
    .then(welcome)
    .catch(err => {
        console.error(err)
        process.exit(1)
    })
        
