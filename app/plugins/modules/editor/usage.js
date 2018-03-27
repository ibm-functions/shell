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

/** list of related commands */
const all = ['compose', 'new', 'edit']
const allExcept = cmd => all.filter(_ => _ !== cmd)

/**
 * Usage model for the editor plugin
 *
 */
module.exports = {
    toplevel: {
        title: 'In-shell editing operations',
        header: 'These commands will help you create new OpenWhisk assets from within the Shell',
        example: 'editor <command>',
        commandPrefix: 'editor',
        available: [{ command: 'compose', docs: 'Begin editing a new OpenWhisk Composition' },
                    { command: 'edit', docs: 'Edit an existing OpenWhisk action' },
                    { command: 'new', docs: 'Begin editing a new Openwhisk action' }],
        related: ['wsk', 'composer']
    },

    edit: {
        strict: 'edit',
        command: 'edit',
        title: 'Edit action',
        header: 'Open a given action or composition in the sidecar for editing.',
        example: 'edit <actionName>',
        required: [{ name: '<actionName>', docs: 'The OpenWhisk action to edit', implicitOK: ['actions', 'activations'] }],
        parents: [{command: 'editor'}],
        related: allExcept('edit')
    },

    compose: {
        strict: 'compose',
        command: 'compose',
        title: 'New composition',
        header: 'For quick prototyping of compositions, this command opens an editor in the sidecar.',
        example: 'compose <appName>',
        required: [{ name: '<appName>', docs: 'The name of your new composition' }],
        parents: [{command: 'editor'}],
        related: allExcept('compose')
    },

    new: {
        strict: 'new',
        command: 'new',
        title: 'New action',
        header: 'For quick prototyping of actions, this command opens an editor in the sidecar.',
        example: 'new <actionName>',
        required: [{ name: '<actionName>', docs: 'The name of your new action' }],
        optional: [{ name: '--kind', alias: '-k', docs: 'The OpenWhisk kind of the new action',
                     allowed: ['nodejs', 'python', 'php', 'swift'],
                     allowedIsPrefixMatch: true,
                     defaultValue: 'nodejs'
                   }],
        parents: [{command: 'editor'}],
        related: allExcept('new')
    }
}
