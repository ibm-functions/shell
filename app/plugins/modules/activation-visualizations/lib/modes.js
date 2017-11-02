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
 * View modes
 *
 */
const mode = mode => ({
    mode,
    direct: entity => entity && entity.name ? repl.qexec(`${mode} --name ${entity.name}`) : repl.qexec(mode)
})
const modes = [
    mode('table'),
    mode('timeline'),
    mode('grid')
]

/**
 * Return a view mode model, crafted for the given default mode
 *
 */
exports.modes = defaultMode => modes.map(_ => {
    if (_.mode === defaultMode) {
        return Object.assign({defaultMode: true}, _)
    } else {
        return _
    }
})
