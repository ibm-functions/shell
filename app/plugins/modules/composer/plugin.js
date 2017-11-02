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

module.exports = (commandTree, prequire) => {
    require('./lib/help')(commandTree, prequire)
    require('./lib/init')(commandTree, prequire)

    // CRUD commands
    require('./lib/get')(commandTree, prequire)
    require('./lib/create')(commandTree, prequire)
    require('./lib/delete')(commandTree, prequire)
    require('./lib/invoke')(commandTree, prequire)
    require('./lib/list')(commandTree, prequire)
    require('./lib/kill')(commandTree, prequire)
    require('./lib/sessions')(commandTree, prequire)
    require('./lib/properties')(commandTree, prequire)
    require('./lib/viz')(commandTree, prequire)

    // combinator commands
    require('./lib/if')(commandTree, prequire)
    require('./lib/await-app')(commandTree, prequire)
    require('./lib/sequence')(commandTree, prequire)
    require('./lib/try')(commandTree, prequire)
    require('./lib/while')(commandTree, prequire)
}
