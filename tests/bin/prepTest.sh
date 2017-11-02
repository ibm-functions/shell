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

if [ -z "${DO_NOT_SET_WSKPROPS}" ]; then
    if [ -z "${TEST_ORG}" ]; then
        echo "Please define TEST_ORG"
        exit 1
    fi

    if [ -z "${TEST_ORG}" ]; then
        echo "Please define TEST_SPACE"
        exit 1
    fi

    wsk property set --apihost "${WSK_API_HOST-https://openwhisk.ng.bluemix.net}" \
        && cf target -o ${TEST_ORG} -s ${TEST_SPACE} \
	&& ./bin/changeWhiskKey.sh
fi
