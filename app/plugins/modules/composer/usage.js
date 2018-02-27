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
 * Usage model for the composer plugin
 *
 */
module.exports = {
    composer: {
        title: 'OpenWhisk composer operations',
        header: 'These commands will help you work with OpenWhisk Compositions',
        example: 'composer <command>',
        commandPrefix: 'composer',
        available: [{ command: 'app', docs: 'create and invoke compositions', dir: true },
                    { command: 'session', docs: 'inspect the results of composition activations', dir: true },
                    { command: 'config', docs: 'print the details of your configuration' }],
        related: ['help', 'wsk']
    },

    app: {
        title: 'Composer create and invoke operations',
        header: 'These commands will help you create and invoke OpenWhisk Compositions',
        example: 'wsk app <command>',
        commandPrefix: 'wsk app',
        available: [{ command: 'create', docs: 'create a new composition', partial: '<app> <sourceFile>' },
                    { command: 'get', docs: 'get the details of a given composition', partial: '<app>' },
                    { command: 'invoke', docs: 'invoke a given composition', partial: '<app> -p <param> <value>' },
                    { command: 'list', docs: 'list all compositions' }],
        related: ['composer', 'composer session']
    },

    session: {
        title: 'Composer activation operations',
        header: 'These commands will help you inspect the activation results of OpenWhisk Compositions',
        example: 'wsk session <command>',
        commandPrefix: 'wsk session',
        available: [{ command: 'get', docs: 'get the details of a given Composer activation', partial: '<sessionId>' },
                    { command: 'list', docs: 'list recent Composer activations' }],
        related: ['composer', 'composer app']
    }
}

