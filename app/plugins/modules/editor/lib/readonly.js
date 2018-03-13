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
  * Enter read-only mode
  *
  */
exports.readonly = ({ wsk, getAction }) => () => Promise.resolve(getAction())
    .then(({ namespace, name }) => repl.qexec(`action get "/${namespace}/${name}"`))
    .then(ui.showEntity)

/**
 * Enter edit mode
 *
 */
exports.edit = ({ wsk, getAction }) => () => Promise.resolve(getAction())
    .then(x => { console.error("!!!!!!!!!!", getAction, x); return x})
    .then(({ namespace, name }) => repl.qexec(`edit "/${namespace}/${name}"`))
    .then(ui.showCustom)

/**
  * Render a lock/unlock icon as a mode button
  *
  */
exports.lockIcon = ({wsk, getAction,
                     mode='lock', // doesn't need to be translated, as we use an icon
                     icon='fas fa-unlock-alt',
                     tooltip='You are in edit mode.\u000aClick to return to view mode.', // TODO externalize string
                     direct=exports.readonly({wsk, getAction})
                    }) => ({
    mode,
    actAsButton: true,
    fontawesome: icon,
    data: { 'data-balloon': tooltip,
            'data-balloon-break': true,
            'data-balloon-pos': 'up-left' },
    direct
})
