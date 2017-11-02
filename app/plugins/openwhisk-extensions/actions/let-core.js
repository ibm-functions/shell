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

const ANON_KEY = 'anonymous-function',
      ANON_KEY_FQN = 'anonymous-function-fqn',
      ANON_CODE = 'anonymous-code'

/**
 * Is the given action entity an anonymous let
 *
 */
const isAnonymousLet = action => {
    if (action.annotations && action.annotations.find(kv => kv.key === ANON_KEY)) {
        const code = action.annotations.find(kv => kv.key == ANON_CODE)
        return code && code.value
    }
}

/** here is the module */
module.exports = () => {
    return {
        ANON_KEY,
        ANON_KEY_FQN,
        ANON_CODE,
        isAnonymousLet
    }
}
