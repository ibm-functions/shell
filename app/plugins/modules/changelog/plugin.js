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

const debug = require('debug')('changelog')
debug('loading')

const changelog = require('changelog')

debug('finished loading modules')

/** translations */
const messages = {
    doc: 'Report the changes of recent versions of the Shell'
}

/**
 * Extract a Fixes #nnn from a commit message
 *
 */
const fixesPattern = /Fixes #([\d]+)/
const fixes = message => {
    const match = message.match(fixesPattern)
    if (match) {
        return match[1]
    }
}
const fixesMessage = message => {
    const issue = fixes(message)
    return issue ? `Issue ${issue}` : ''
}

/**
 * Try to extract a PR link, otherwise use a SHA link
 *
 */
const linkTo = (message, sha) => {
    const issue = fixes(message)
    if (issue) {
        return `issues/${issue}`
    } else {
        return `commit/${sha}`
    }
}

const showChanges = ui => data => {
    const { project, versions } = data,
          {version, date, changes} = versions[0]

    return changes.map(({date, message, sha}, idx) => ({
        noSort: true,
        type: 'changes',
        name: fixesMessage(message) || '',
        onclick: () => window.open(`${project.repository}/${linkTo(message, sha)}`),
        attributes: [
            { value: message, css: 'deemphasize wrap-normal' },
            { value: ui.prettyPrintTime(date, 'short', idx > 0 && changes[idx - 1].date), css: 'deemphasize' }
        ]
    }))
}

/**
 * Install the command handlers and background checker
 *
 */
module.exports = (commandTree, require) => {
    commandTree.listen(`/updater/changelog`,
                       (_1, _2, _3, { ui }, _5, _6, argv, options) => changelog.generate('@ibm-functions/shell').then(showChanges(ui)),
                       { docs: messages.doc })
}
                      
debug('loading done')
