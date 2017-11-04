#
# Copyright 2017 IBM Corporation
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#

#!/usr/bin/env bash

SCRIPTDIR=$(cd $(dirname "$0") && pwd)
ROOTDIR="$SCRIPTDIR/../.."

if [ -n "$LAYER" ]; then
    # user asked to run tests in just one specified layer, e.g. "07"

    if [ -n "$KEY_FROM_LAYER" ]; then
        # user asked to pick up a previously configured auth key
        DIR=$ROOTDIR/.openwhisk-shell/keys

        export AUTH=`cat $DIR/${LAYER}`
        export __OW_API_KEY="$AUTH"
        export TEST_ORG=""
        export TEST_SPACE="ns${LAYER}"

        echo "Key from layer $TEST_SPACE"

        if [ -f "$DIR/${LAYER}b" ]; then
            # some layers need a second auth and namespace
            export AUTH2=`cat $DIR/${LAYER}b`
            export TEST_SPACE2="ns${LAYER}b"
        fi

        # echo "LAYER=$LAYER; KEY=${__OW_API_KEY}"
    fi

    LAYER="passes/${LAYER}"
fi

# --bail means we fail fast
NO_USAGE_TRACKING=true mocha -c --bail --recursive --timeout ${TIMEOUT-60000} tests/$LAYER
