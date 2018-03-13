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

const all = ['wsk action', 'wsk activation', 'wsk package', 'wsk rule', 'wsk trigger' ]
all.except = str => all.filter(_ => _ !== str)

const aliases = {
    get: ['open'],
    list: ['ls']
}

/** required action parameter */
const action = [{ name: 'action', docs: 'an action name' }],
      actionImplicitOK = [ Object.assign({}, action[0], { implicitOK: ['actions', 'activations'] }) ]

/** required activationId parameter */
const activationID = [{ name: 'activationId', docs: 'an activation ID' }]

/** optional parameters having to do with parameter bindings */
const params = [{ name: '--param', alias: '-p', example: 'key value', docs: 'bind a variable to a value', narg: 2, key: 'parameters' },
                { name: '--param-file', alias: '-P', advanced: true, docs: 'a local path to a bindings file' }]

/** optional parameters having to do with annotations */
const annotations = [{ name: '--annotation', alias: '-a', example: 'key value', docs: 'annotate a variable with a value', narg: 2, key: 'annotations' },
                     { name: '--annotation-file', alias: '-A', advanced: true, docs: 'a local path to a bindings file' }]

/** timeout parameter */
const timeout = [{ name: '--timeout', alias: '-t', docs: 'max milliseconds to wait for blocking invoke', defaultValue: 60000 }]

/** resource limit parameters */
const limits = timeout.concat([
    { name: '--memory', alias: '-m', numeric: true, docs: 'the maximum memory in MB', defaultValue: 256 },
    { name: '--logsize', alias: '-l', numeric: true, docs: 'the maximum log size in MB', defaultValue: 10 }
])

/** common action parameters */
const actionMix = params.concat(annotations).concat(limits).concat([
    { name: '--kind', allowed: ['nodejs', 'python', 'swift', 'php'], allowedIsPrefixMatch: true, defaultValue: 'nodejs', docs: 'the action runtime' },
    { name: '--sequence', boolean: true, example: 'a1,a2,a3', docs: 'create a sequence of the given actions' },
    { name: '--copy', boolean: true, advanced: true, docs: 'copy the action named by the second parameter to a new action named by the first' },
    { name: '--web', boolean: true, docs: 'web export the action' },
    { name: '--content-type', hidden: true }
])

/** optional skip and limit parameters */
const skipAndLimit = [{ name: '--limit', alias: '-l', numeric: true, docs: 'show at most N'},
                      { name: '--skip', alias: '-s', numeric: true, docs: 'start from N'}]

/**
 * Usage strings. TODO externalize
 *
 */
module.exports = {
    skipAndLimit,

    // this is the ascii art for OpenWhisk, with backslashes escaped
    wsk: { //header: `        ____      ___                   _    _ _     _     _\r\n       /\\   \\    / _ \\ _ __   ___ _ __ | |  | | |__ (_)___| | __\r\n  /\\  /__\\   \\  | | | | '_ \\ / _ \\ '_ \\| |  | | '_ \\| / __| |/ /\r\n /  \\____ \\  /  | |_| | |_) |  __/ | | | |/\\| | | | | \\__ \\   <\r\n \\   \\  /  \\/    \\___/| .__/ \\___|_| |_|__/\\__|_| |_|_|___/_|\\_\\\r\n  \\___\\/ tm           |_|`,
           breadcrumb: 'OpenWhisk',
           title: 'The fundamental OpenWhisk operations',
           header: 'These commands will help you work with OpenWhisk assets.',
           example: 'wsk <command>',
           commandPrefix: 'wsk',
           available: [{ command: 'action', docs: 'work with actions', dir: true },
                       { command: 'activation', docs: 'work with activations', dir: true, aliases: ['$'] },
                       { command: 'package', docs: 'work with packages', dir: true },
                       { command: 'rule', docs: 'work with rules', dir: true },
                       { command: 'trigger', docs: 'work with triggers', dir: true },
                       { command: 'list', docs: 'list all entities in the current namespace', aliases: aliases.list }],
         },

    bind: 'Usage: bind <packageName> <bindName> [-p key value]...',

    // ACTION OPERATIONS
    actions: { title: 'Action operations',
               header: 'These commands will help you to work with actions.',
               example: 'wsk action <command>',
               commandPrefix: 'wsk action',
               available: [
                   // ACTION CREATE
                   { command: 'create', docs: 'create a new action', strict: 'create',
                     example: 'wsk action create <action> <sourceFile>',
                     required: [{ name: 'name', docs: 'the name of your new action' }],
                     optional: [{ name: 'sourceFile', positional: true, docs: 'a local path to the action source' }].concat(actionMix),
                     parents: [{ command: 'wsk' }, { command: 'wsk action' }],
                   },
                   // ACTION UPDATE
                   { command: 'update', docs: 'update an existing action, or create one if it does not exist', strict: 'update',
                     example: 'wsk action update <action> [sourceFile]',
                     required: action,
                     optional: [{ name: 'sourceFile', positional: true, docs: 'a local path to the action source' }]
                     .concat(actionMix),
                     parents: [{ command: 'wsk' }, { command: 'wsk action' }]
                   },
                   // ACTION INVOKE
                   { command: 'invoke', docs: 'invoke a given action', strict: 'invoke',
                     example: 'wsk action invoke <action>',
                     required: actionImplicitOK,
                     optional: params.concat([
                         { name: '--blocking', alias: '-b', boolean: true, docs: 'blocking invocation' },
                         { name: '--result', alias: '-r', boolean: true, docs: 'return only the activation result' }].concat(timeout)),
                     parents: [{ command: 'wsk' }, { command: 'wsk action' }]
                   },
                   // ACTION GET
                   { command: 'get', fn: (command, syn='action') => ({
                       strict: command,
                       breadcrumb: 'get',
                       command,
                       aliases: aliases.get,
                       docs: 'get the details of a given action',
                       example: `wsk ${syn} ${command} <action>`,
                       required: action,
                       parents: [{ command: 'wsk' }, { command: 'wsk action' }]
                   }) },
                   // ACTION DELETE
                   { command: 'delete', docs: 'delete a given action', strict: 'delete',
                     example: 'wsk action delete <action>',
                     required: action,
                     parents: [{ command: 'wsk' }, { command: 'wsk action' }]
                   },
                   // ACTION LIST
                   { command: 'list', fn: (command, syn='action') => ({
                       breadcrumb: 'list',
                       command, docs: 'list all actions', aliases: aliases.list, strict: command,
                       example: `wsk ${syn} ${command}`,
                       optional: [{ name: 'package', positional: true, docs: 'list all actions in a given package' }].concat(skipAndLimit),
                       parents: [{ command: 'wsk' }, { command: 'wsk action' }]
                   }) }
               ],
               parents: [{ command: 'wsk' }],
               related: all.except('wsk action')
             },

    rules: { title: 'Rule operations',
             header: 'These commands will help you to work with rules.',
             example: 'wsk rule <command>',
             commandPrefix: 'wsk rule',
             available: [{ command: 'create', docs: 'create a new rule', partial: '<rule> <trigger> <action>' },
                         { command: 'enable', docs: 'enable a given rule', partial: '<rule>' },
                         { command: 'disable', docs: 'disable a given rule', partial: '<rule>' },
                         { command: 'status', docs: 'get the status (enabled or disabled) of given rule', partial: '<rule>' },
                         { command: 'update', docs: 'update an existing rule, or create one if it does not exist', partial: true },
                         { command: 'get', docs: 'get the details of a given rule', partial: '<rule>' },
                         { command: 'delete', docs: 'delete a given rule', partial: '<rule>' },
                         { command: 'list', docs: 'list all rules', aliases: aliases.list }],
             parents: [{ command: 'wsk' }],                
             related: all.except('wsk rule')
           },

    triggers: { title: 'Trigger operations',
                header: 'These commands will help you to work with triggers.',
                example: 'wsk trigger <command>',
                commandPrefix: 'wsk trigger',
                available: [{ command: 'fire', docs: 'fire trigger event', partial: '<trigger>' },
                            { command: 'create', docs: 'create new trigger', partial: '<trigger>' },
                            { command: 'update', docs: 'update an existing an trigger, or create one if it does not exist', partial: '<trigger>' },
                            { command: 'get', docs: 'get the details of a trigger', partial: '<trigger>' },
                            { command: 'delete', docs: 'delete a given trigger', partial: '<trigger>' },
                            { command: 'list', docs: 'list all triggers', aliases: aliases.list }],
                parents: [{ command: 'wsk' }],                
                related: all.except('wsk trigger')
           },

    packages: { title: 'Package operations',
                header: 'These commands will help you to work with packages.',
                example: 'wsk package <command>',
                commandPrefix: 'wsk package',
                available: [{ command: 'bind', docs: 'bind parameters to a package', partial: true },
                            { command: 'create', docs: 'create a new package', partial: '<package>' },
                            { command: 'update', docs: 'update an existing package, or create one if it does not exist', partial: true },
                            { command: 'get', docs: 'get the details of a given package', partial: '<package>' },
                            { command: 'delete', docs: 'delete a given package', partial: '<package>' },
                            { command: 'list', docs: 'list all packages', aliases: aliases.list,
                              optional: [{ name: 'namespace', docs: 'list all packages in a given namespace', positional: true }]
                            },
                            //{ command: 'refresh', docs: 'refresh package bindings' }
                           ],
                parents: [{ command: 'wsk' }],
                related: all.except('wsk package')
              },

    activations: alias => ({ title: 'Activation operations',
                             header: 'These commands will help you to work with activations.',
                             example: `wsk ${alias} <command>`,
                             commandPrefix: `wsk ${alias}`,
                             available: [{ command: 'get', docs: 'get the full details of an activation', strict: 'get',
                                           example: `wsk ${alias} get <activationID>`,
                                           required: activationID,
                                           parents: [{ command: 'wsk' }, { command: 'wsk activation' }]
                                         },
                                         { command: 'list', docs: 'list recent activations', aliases: aliases.list },
                                         { command: 'logs', docs: 'get the logs of an activation', partial: '<activationId>' },
                                         { command: 'result', docs: 'get the result, i.e. return value, of an activation', partial: '<activationId>' },
                                         //{ command: 'poll', docs: 'poll continuously for log messages from currently running actions' },
                                        ],
                             parents: [{ command: 'wsk' }],
                             related: all.except('wsk activation')
                           })
}
