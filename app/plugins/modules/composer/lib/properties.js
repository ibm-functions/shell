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


const { properties } = require('./composer')

const usage = cmd => `Print out the details of your configuration.

\tapp ${cmd}`

const getProperties = cmd => (_1, _2, _a, modules, _3, execOptions, args, options) => {
    if (options.help || args[args.indexOf(cmd) + 1] === 'help') {
        throw new modules.errors.usage(usage(cmd))
    }

    return properties()
        .then(resp => resp.message)
        .then(package => {
            //ui.showEntity(package, { show: 'parameters' })
            const config = Object.assign({}, package.parameters.find(({key}) => key === '$config').value)
            delete config.notify // don't show internal property
            return config
        })
}

/**
 * Here is the app kill entry point. Here we register command
 * handlers.
 *
 */
module.exports = (commandTree, prequire) => {
    const cmd = commandTree.listen('/wsk/app/properties', getProperties('properties'),
                                   { docs: 'Show the access credentials for the backing store' })

    // synonyms of app properties
    commandTree.synonym('/wsk/app/props', getProperties('props'), cmd)
    commandTree.synonym('/wsk/app/config', getProperties('config'), cmd)
}
