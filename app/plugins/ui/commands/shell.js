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
 * This plugin introduces !, which executes a given shell command.
 *
 */

const debug = require('debug')('shell plugin'),
      shell = require('shelljs')

const doShell = (argv, options, execOptions) => new Promise((resolve, reject) => {
    if (argv.length < 2) {
        reject('Please provide a bash command')
    }

    debug('argv', argv)

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

        if (!args.find(arg => arg.charAt(0) === '-') && cmd !== 'ls') {
            // shelljs doesn't like dash args
            // otherwise, shelljs has a built-in handler for this

            debug('using internal shelljs', cmd, args)

            const output = shell[cmd](args)
            if (cmd === 'cd') {
                // special case: if the user asked to change working
                // directory, respond with the new working directory
                process.env.OLDPWD = OLDPWD
                resolve(shell.pwd().toString())
            } else {
                // otherwise, respond with the output of the command;
                if (output) {
                    // add a line-wrapping wrapper
                    const wrapper = document.createElement('div')
                    wrapper.classList.add('whitespace')
                    wrapper.innerText = cmd === 'ls' ? output.toString().replace(/,/g,' ') : output.toString()
                    resolve(wrapper)

                } else {
                    resolve(true)
                }
            }
        }
    }

    //
    // otherwise, we use exec to implement the shell command; here, we
    // cross our fingers that the platform implements the requested
    // command
    //
    
    const cmdLine = argv.slice(1).join(' ')
    debug('cmdline', cmdLine)
    const proc = shell.exec(cmdLine, {async: true, silent: true, env: process.env})

    // accumulate doms from the output of the subcommand
    const parentNode = document.createElement('div')
    let rawErr = ''

    proc.stdout.on('data', data => {
        if (execOptions.stdout) {
            execOptions.stdout(data.toString())
        } else {
            const span = document.createElement('span')
            parentNode.appendChild(span)
            span.setAttribute('class', 'whitespace')
            span.appendChild(document.createTextNode(data))
        }
    })

    proc.stderr.on('data', data => {
        rawErr += data

        if (execOptions.stderr) {
            execOptions.stderr(data.toString())
            //stderrLines += data.toString()
        } else {
            const span = document.createElement('span')
            parentNode.appendChild(span)
            span.setAttribute('class', 'whitespace oops')
            span.appendChild(document.createTextNode(data))
        }
    })

    proc.on('close', exitCode => {
        console.log('shell command done')
        if (exitCode === 0) {
            // great, the process exited normally. resolve!
            //resolve(execOptions.stdout ? stdoutLines : parentNode)
            resolve(parentNode)
        } else {
            // oops, non-zero exit code. reject!
            if (execOptions && execOptions.nested) {
                reject(rawErr)
            } else {
                reject(execOptions.stderr ? code : parentNode)
            }
        }
    })
})

const usage = {
    lcd: {
        strict: 'lcd',
        command: 'lcd',
        title: 'change working directory',
        header: 'Update the current working directory for local filesystem manipulations',
        optional: [{ name: 'path', docs: 'local file path', file: true, positional: true }]
    },
    lls: {
        strict: 'lls',
        command: 'lls',
        title: 'local file list',
        header: 'Directory listing of your local filesystem',
        optional: [{ name: 'path', docs: 'local file path', file: true, positional: true }]
    },
    lrm: {
        strict: 'lrm',
        command: 'lrm',
        title: 'local file remove',
        header: 'Remove a file in the local filesystem',
        required: [{ name: 'path', docs: 'local file path', file: true }]
    }
}

/**
 * Register command handlers
 *
 */
module.exports = commandTree => {
    // commandTree.subtree('/!', { usage: usage.toplevel })

    const shellFn = (_1, _2, fullArgv, _3, command, execOptions, argv, options) => doShell(repl.split(command, false), options, execOptions)
    const shellCmd = commandTree.listen('/!', shellFn, { docs: 'Execute a UNIX shell command' })

    commandTree.listen('/!/pwd', (_1, _2, fullArgv, _3, command, execOptions, argv, options) => {
        return doShell(['!', 'pwd', ...repl.split(command, false).slice(1)], options, execOptions)
    }, { docs: 'Print the current working directory' })

    commandTree.listen('/!/lcd', (_1, _2, fullArgv, _3, command, execOptions, argv, options) => {
        return doShell(['!', 'cd', ...repl.split(command, false).slice(1)], options, execOptions, Object.assign({}, execOptions, { nested: true }))
            .catch(message => { throw new errors.usage({ message, usage: usage.lcd }) })
    }, { usage: usage.lcd })

    commandTree.listen('/!/lls', (_1, _2, fullArgv, { errors }, command, execOptions, argv, options) => {
        return doShell(['!', 'ls', '-l', ...repl.split(command, false).slice(1)], options, Object.assign({}, execOptions, { nested: true }))
            .catch(message => { throw new errors.usage({ message, usage: usage.lls }) })
    }, { usage: usage.lls })

    commandTree.listen('/!/lrm', (_1, _2, fullArgv, _3, command, execOptions, argv, options) => {
        return doShell(['!', 'rm', ...repl.split(command, false).slice(1)], options, execOptions)
            .catch(message => { throw new errors.usage({ message, usage: usage.lrm }) })
    }, { usage: usage.lrm })

    return {
        exec: (_1, _2, argv, _3, _4, execOptions, _a, options) => doShell(['!', ...argv], options, execOptions)
    }
}
