#
# Copyright 2018 IBM Corporation
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
# Find plugin-hosted tests
#

# are we setting up links or tearing them down (a.k.a. clean)?
if [ "$1" == "clean" ]; then
    CLEAN=true
fi

# make sure we are independent of the working directory
SCRIPTDIR=$(cd $(dirname "$0") && pwd)
ROOTDIR="$SCRIPTDIR/../.."
cd "$SCRIPTDIR/.."

# scan for tests
TESTS=`find "$ROOTDIR/app/plugins/modules" -maxdepth 2 -name tests`

# set up (or tear down) links
for test in $TESTS; do
    echo "Scanning $test"

    if [ -d "$test/data" ]; then
        echo
        echo "  - found test input data"

        for data in "$test"/data/*; do
            base=`basename $data`
            if [ -n "$CLEAN" ]; then
                echo "    * unlinking data $base"
                (cd data && rm -f $base)
            else
                echo "    * linking data $base"
                (cd data && ln -s "$data" .)
            fi
        done
    fi

    if [ -d "$test/lib" ]; then
        echo
        echo "  - found test library files"

        for lib in "$test"/lib/*; do
            base=`basename $lib`
            if [ -n "$CLEAN" ]; then
                echo "    * unlinking lib $base"
                (cd lib && rm -f $base)
            else
                echo "    * linking lib $base"
                (cd lib && ln -s "$lib" .)
            fi
        done
    fi

    if [ -d "$test/tests/passes" ]; then
        echo
        echo "  - found tests"

        for pass in "$test"/tests/passes/*; do
            base=`basename $pass`
            if [ -n "$CLEAN" ]; then
                echo "    * unlinking pass $base"
                (cd tests/passes && rm -f $base)
            else
                echo "    * linking pass $base"
                (cd tests/passes && ln -s "$pass" .)
            fi
        done
    fi
done
