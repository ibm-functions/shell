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

#
# This script runs a give layer, or list of layers, and runs them in
# parallel, isolated within docker containers. You will see the mocha
# output of how the tests proceed, but you will not be able to see the
# tests run visually. If this is what you need, then use `runLocal.sh`
# directly.
#

if [ -z "$API_HOST" ]; then
    . ~/.wskprops
    export API_HOST=$APIHOST
fi

if [ -z "$REDIS_URL" ]; then
    REDIS_IP='192.168.33.13'
    #redis-cli -h ${REDIS_IP} ping
    export REDIS_URL="redis://${REDIS_IP}:6379"
fi

if [ -z "$REDIS_URL" ]; then
    echo "Could not find redis"
    exit 1
else
    echo "Using this redis: ${REDIS_URL}"
fi

WHICH=${@-tests/passes/*}

idx=0
for i in $WHICH; do
    LAYER=`basename $i`
    NAME="shell-test-${LAYER}"

    # make sure each layer has its own DISPLAY
    idx=$((idx + 1))
    DISPLAY=$(( 90 + $idx ))
    PORT=$((9515 + $idx ))

    docker rm "${NAME}" 2> /dev/null

    echo -n "Starting layer=${LAYER} name=${NAME} DISPLAY=$DISPLAY containerId="

    docker run \
           --name "${NAME}" \
           -d \
           --net=host \
           -e CHROMEDRIVER_PORT=$PORT \
           -e KEY_FROM_LAYER=true \
           -e DISPLAY=":$DISPLAY" \
           -e LAYER=$LAYER \
           -e REDIS_URL=$REDIS_URL \
           -e API_HOST=$API_HOST \
           shell-test
done

# wait for them to complete
for i in $WHICH; do
    LAYER=`basename $i`
    NAME="shell-test-${LAYER}"

    docker logs -f "${NAME}" 2> /dev/null &
    TAIL=$!
    EXITCODE=`docker wait "${NAME}"`
    kill $TAIL 2> /dev/null

    if [ $EXITCODE != 0 ]; then
        exit 1
    fi

    # optionally remove the docker container when the test is done
    # docker rm "${NAME}"
done
