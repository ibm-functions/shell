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
 * This plugin introduces /shell, and a synonym !, which executes a
 * given shell command.
 *
 */

const shell = require('shelljs')
const request = require('request-promise')

const doShell = (argv, options) => new Promise((resolve, reject) => {
    if (argv.length < 2) {
        reject('Please provide a bash command')
    }

    const cmd = argv[1]
    if (shell[cmd]) {
        const args = argv.slice(2)

        // remember OLDPWD, so that `lcd -` works (shell issue #78)
        if (process.env.OLDPWD === undefined) {
            process.env.OLDPWD = ''
        }
        const OLDPWD = shell.pwd() // remember it for when we're done
        if (cmd === 'cd' && args[0] === '-') {
            // special case for "lcd -"
            args[0] = process.env.OLDPWD
        }

        if (!args.find(arg => arg.charAt(0) === '-')) {
            // shelljs doesn't like dash args
            // otherwise, shelljs has a built-in handler for this

            console.log(`shell.internal: ${cmd}`)

            const output = shell[cmd](args)
            if (cmd === 'cd') {
                // special case: if the user asked to change working
                // directory, respond with the new working directory
                process.env.OLDPWD = OLDPWD
                resolve(shell.pwd().toString())
            } else {
                // otherwise, respond with the output of the command
                resolve(output ? output.toString() : true)
            }
        }
    }

    //
    // otherwise, we use exec to implement the shell command; here, we
    // cross our fingers that the platform implements the requested
    // command
    //
    
    const cmdLine = argv.slice(1).join(' ')
    console.log(`shell.exec: ${cmdLine}`)
    const proc = shell.exec(cmdLine, {async: true, silent: true, env: process.env})

    // accumulate doms from the output of the subcommand
    const parentNode = document.createElement('div')

    proc.stdout.on('data', data => {
        const span = document.createElement('span')
        parentNode.appendChild(span)
        span.setAttribute('class', 'whitespace')
        span.appendChild(document.createTextNode(data))
    })

    proc.stderr.on('data', data => {
        const span = document.createElement('span')
        parentNode.appendChild(span)
        span.setAttribute('class', 'whitespace oops')
        span.appendChild(document.createTextNode(data))
    })

    proc.on('close', exitCode => {
        console.log('shell command done')
        if (exitCode === 0) {
            // great, the process exited normally. resolve!
            resolve(parentNode)
        } else {
            // oops, non-zero exit code. reject!
            reject(parentNode)
        }
    })
})

module.exports = commandTree => {
    const shellFn = (_1, _2, fullArgv, _3, _4, _5, argv, options) => doShell(fullArgv)
    const shellCmd = commandTree.listen('/!', shellFn, { docs: 'Execute a UNIX shell command' })
    // commandTree.synonym('/shell', shellFn, shellCmd)

    commandTree.listen('/pwd', (_1, _2, fullArgv, _3, _4, _5, argv, options) => doShell(['!', 'pwd', ...argv.slice(1)], options),
                       { docs: 'Print the current working directory' })

    commandTree.listen('/lcd', (_1, _2, fullArgv, _3, _4, _5, argv, options) => doShell(['!', 'cd', ...argv.slice(1)], options),
                       { docs: 'Change the current working directory for future shell commands' })

    commandTree.listen('/lls', (_1, _2, fullArgv, _3, _4, _5, argv, options) => doShell(['!', 'ls', '-l', ...argv.slice(1)]),
                       { docs: 'Directory listing of your local filesystem' })

    commandTree.listen('/lrm', (_1, _2, fullArgv, _3, _4, _5, argv, options) => doShell(['!', 'rm', ...argv.slice(1)]),
                       { docs: 'Remove a file from your local filesystem' })

    return {
        exec: (block, nextBlock, argv, modules) => doShell(['!', ...argv], modules)
    }
}
