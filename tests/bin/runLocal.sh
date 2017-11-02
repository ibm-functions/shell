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

. ~/.wskprops

export API_HOST=$APIHOST
export KEY_FROM_LAYER=true
export PATH=./node_modules/.bin:$PATH

if [ -z "$REDIS_URL" ]; then
    # do we need to start redis ourselves?
    redis-server > /dev/null &
    REDIS_PID=$!
fi

# trap ctrl-c and call ctrl_c()
trap finished INT

function finished() {
    if [ -n "$REDIS_PID" ]; then
        kill ${REDIS_PID} >& /dev/null
    fi
}

if [ -z "$REDIS_URL" ]; then
    REDIS_IP=`netstat -rn | awk '$NF=="lo0" && $3=="UGSc" { print substr($1, 1, index($1, "/") - 1)}'`
    export REDIS_URL="redis://${REDIS_IP}:6379"
fi

if [ ! -d logs ]; then
    mkdir logs
fi

rm logs/* 2> /dev/null

LAYER=${1-"*"}

# the | tee should fail if runTest fails
set -o pipefail

for i in tests/passes/$LAYER; do
    LAYER=`basename $i`
    echo $LAYER
    LAYER=$LAYER ./bin/runTest.sh 2>&1 | tee logs/$LAYER.out

    if [ $? != 0 ]; then
        exit 1
    fi
done

finished
