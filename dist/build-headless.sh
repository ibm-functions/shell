#!/usr/bin/env bash

#
# Copyright 2017-2018 IBM Corporation
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

# product name
export PRODUCT_NAME="${PRODUCT_NAME-`cat ../app/build/config.json | jq --raw-output .productName`}"

export BUILDDIR=build

function init {
    # make the build directory
    if [ ! -d $BUILDDIR ]; then
	mkdir $BUILDDIR
	if [ $? != 0 ]; then
	    exit 1
	fi
    fi

    if [ ! -d node_modules ]; then
	npm install
    fi

    if [ ! -d ../app/node_modules/electron ]; then
        # in case we had a failed build-headless in the past
        (cd ../app && npm install electron nyc)
    fi
         
    # assemble plugins
    ./compile.js

    # minify the css
    cp ../app/content/css/ui.css /tmp
    ./node_modules/.bin/minify /tmp/ui.css
    cp /tmp/ui.min.css ../app/content/css/ui.css

    VERSION=`cat ../app/package.json | jq --raw-output .version`
    echo "$VERSION" > ../app/.version

    (cd ../app && npm prune --production)
}

function cleanup {
#    rm ../app/plugins/.pre-scanned
    rm ../app/.version

    cp /tmp/ui.css ../app/content/css/ui.css

    ./compile.js cleanup

    (cd ../app && npm install electron nyc) # ugh, i wish there were a prune --dev
}

function build {
    DEST="${PRODUCT_NAME}-headless.zip"
    
    rm -f "$BUILDDIR/$DEST"
    (cd .. && mv app cloudshell && \
         zip -x "cloudshell/node_modules/electron*/*" \
             -x "cloudshell/plugins/modules/wskflow/*" \
             -x "cloudshell/plugins/modules/editor/*" \
             -x "cloudshell/plugins/node_modules/elkjs/*" \
             -x "cloudshell/plugins/node_modules/d3/*" \
             -x "cloudshell/plugins/node_modules/jquery/*" \
             -x "**/node_modules/**/*.md" \
             -x "**/node_modules/**/*.DOCS" \
             -x "**/node_modules/**/LICENSE" \
             -x "**/node_modules/docs/**/*.html" \
             -x "**/node_modules/**/test/*" \
             -r "dist/$BUILDDIR/$DEST" cloudshell && \
        mv cloudshell app)
}

init && build && cleanup
