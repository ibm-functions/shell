#!/usr/bin/env bash

#
# input params: choose a platform to build for (default: all)
#
PLATFORM=${1-all}

# product name
PRODUCT_NAME="${PRODUCT_NAME-`cat ../app/build/config.json | jq --raw-output .productName`}"

# filesystem icons
ICON_MAC=`cat ../app/build/config.json | jq --raw-output .filesystemIcons.darwin`
ICON_WIN32=`cat ../app/build/config.json | jq --raw-output .filesystemIcons.win32`
ICON_LINUX=`cat ../app/build/config.json | jq --raw-output .filesystemIcons.linux`

VERSION=`git rev-parse master`
BUILDDIR=build

# if we're running a test against a dist build, then we need to tell
# electron-packager to keep around devDependencies
if [ -n "${TEST_FROM_BUILD}" ]; then
    NO_PRUNE=--no-prune
    NO_INSTALLER=true
else
    # by default, we want to uglify the javascript
    UGLIFY=true
fi

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

    # assemble plugins
    ./compile.js

    # minify the css
    cp ../app/content/css/ui.css /tmp
    ./node_modules/.bin/minify /tmp/ui.css
    cp /tmp/ui.min.css ../app/content/css/ui.css

    VERSION=`cat ../app/package.json | jq --raw-output .version`
    echo "$VERSION" > ../app/.version
}

function cleanup {
#    rm ../app/plugins/.pre-scanned
    rm ../app/.version

    cp /tmp/ui.css ../app/content/css/ui.css

    ./compile.js cleanup
}

function win32 {
    if [ "$PLATFORM" == "all" ] || [ "$PLATFORM" == "win32" ] || [ "$PLATFORM" == "windows" ]; then
        # create the bundles
        ./node_modules/.bin/electron-packager \
	    ../app \
	    "$PRODUCT_NAME" \
	    --asar=true \
            --build-version=$VERSION \
	    --out=$BUILDDIR \
	    --platform=win32 \
	    --icon=$ICON_WIN32 \
	    --protocol=wsk --protocol-name="Execute ${PRODUCT_NAME} commands" \
	    --overwrite \
	    --win32metadata.CompanyName="Apache" \
	    --win32metadata.ProductName="${PRODUCT_NAME}"

        # CLI scripts
        cp ../app/bin/fsh "$BUILDDIR/${PRODUCT_NAME}-win32-x64/fsh"
        cp ../app/bin/fsh.bat "$BUILDDIR/${PRODUCT_NAME}-win32-x64"

        #
        # deal with win32 packaging
        #
        if [ -z "$NO_INSTALLER" ]; then
            (cd $BUILDDIR && zip -q -r "${PRODUCT_NAME}-win32-x64" "${PRODUCT_NAME}-win32-x64" -x \*~)
        fi
    fi
}


#
# deal with darwin/macOS packaging
#
function mac {
    if [ "$PLATFORM" == "all" ] || [ "$PLATFORM" == "mac" ] || [ "$PLATFORM" == "macos" ] || [ "$PLATFORM" == "darwin" ]; then
        ./node_modules/.bin/electron-packager \
	    ../app \
	    "${PRODUCT_NAME}" \
	    --asar=true \
            --build-version=$VERSION \
	    --ignore='~$' \
	    --out=$BUILDDIR \
	    --platform=darwin \
	    --icon=$ICON_MAC \
	    --protocol=wsk --protocol-name="Execute ${PRODUCT_NAME} commands" \
	    --overwrite

        # use a custom icon for mac
        cp $ICON_MAC "$BUILDDIR/${PRODUCT_NAME}-darwin-x64/${PRODUCT_NAME}.app/Contents/Resources/electron.icns"

        # CLI script
        cp ../app/bin/fsh "$BUILDDIR/${PRODUCT_NAME}-darwin-x64/${PRODUCT_NAME}.app/Contents/MacOS/"

        # create the installers
        if [ -n "$ZIP_INSTALLER" ]; then
            (cd $BUILDDIR && zip -q -r "${PRODUCT_NAME}-darwin-x64" "${PRODUCT_NAME}-darwin-x64" -x \*~)

        elif [ -z "$NO_INSTALLER" ]; then
            ./node_modules/.bin/electron-installer-dmg \
	        "$BUILDDIR/${PRODUCT_NAME}-darwin-x64/${PRODUCT_NAME}.app" \
	        "${PRODUCT_NAME}" \
	        --out=$BUILDDIR \
	        --icon=$ICON_MAC \
	        --icon-size=128 \
	        --overwrite
        fi
    fi
}

#
# deal with linux packaging
#
function linux {
    if [ "$PLATFORM" == "all" ] || [ "$PLATFORM" == "linux" ]; then
        ./node_modules/.bin/electron-packager \
	    ../app \
	    "${PRODUCT_NAME}" \
            ${NO_PRUNE} \
	    --asar=true \
            --build-version=$VERSION \
	    --out=$BUILDDIR \
	    --platform=linux \
	    --protocol=wsk --protocol-name="Execute ${PRODUCT_NAME} commands" \
            --icon=$ICON_LINUX \
	    --overwrite

        # CLI script
        cp ../app/bin/fsh "$BUILDDIR/${PRODUCT_NAME}-linux-x64"

        if [ -z "$NO_INSTALLER" ]; then
            (cd $BUILDDIR && zip -q -r "${PRODUCT_NAME}-linux-x64" "${PRODUCT_NAME}-linux-x64" -x \*~)
        fi
    fi
}


# line up the work
init && win32 && mac && linux && cleanup
