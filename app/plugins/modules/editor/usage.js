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

/**
 * Usage model for the editor plugin
 *
 */
module.exports = {
    title: 'In-shell editing operations',
    header: 'These commands will help you create new OpenWhisk assets from within the Shell',
    example: 'editor <command>',
    commandPrefix: 'editor',
    available: [{ command: 'compose', docs: 'Begin editing a new OpenWhisk Composition' },
                { command: 'edit', docs: 'Edit an existing OpenWhisk action' },
                { command: 'new', docs: 'Begin editing a new Openwhisk action' }],
    related: ['help', 'wsk', 'composer']
}
