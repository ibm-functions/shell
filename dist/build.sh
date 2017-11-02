#!/usr/bin/env bash

PLATFORM=${1-all}
VERSION=`git rev-parse master`
BUILDDIR=build
APP_NAME="IBM Cloud Functions Shell"

# openwhisk icons
#ICON_MAC=../assets/icons/icns/OpenWhisk-512x512.icns
#ICON_WIN32=../assets/icons/ico/openwhisk_512x512_jnb_icon.ico

# dolphin icons
ICON_MAC=../assets/icons/icns/blue-dolphin-transparent.icns
ICON_WIN32=../assets/icons/ico/blue-dolphin-transparent.ico
ICON_LINUX=../assets/icons/png/blue-dolphin-transparent.png

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
    UGLIFY=true ./compile.js

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

    UGLIFY=true ./compile.js cleanup
}

function win32 {
    if [ "$PLATFORM" == "all" ] || [ "$PLATFORM" == "win32" ] || [ "$PLATFORM" == "windows" ]; then
        # create the bundles
        ./node_modules/.bin/electron-packager \
	    ../app \
	    "$APP_NAME" \
	    --asar=true \
            --build-version=$VERSION \
	    --out=$BUILDDIR \
	    --platform=win32 \
	    --icon=$ICON_WIN32 \
	    --protocol=wsk --protocol-name="Execute ${APP_NAME} commands" \
	    --overwrite \
	    --win32metadata.CompanyName="Apache" \
	    --win32metadata.ProductName="${APP_NAME}"

        # CLI scripts
        cp ../app/bin/fsh "$BUILDDIR/${APP_NAME}-win32-x64/fsh"
        cp ../app/bin/fsh.bat "$BUILDDIR/${APP_NAME}-win32-x64"

        #
        # deal with win32 packaging
        #
        if [ -z "$NO_INSTALLER" ]; then
            (cd $BUILDDIR && zip -q -r "${APP_NAME}-win32-x64" "${APP_NAME}-win32-x64" -x \*~)
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
	    "${APP_NAME}" \
	    --asar=true \
            --build-version=$VERSION \
	    --ignore='~$' \
	    --out=$BUILDDIR \
	    --platform=darwin \
	    --icon=$ICON_MAC \
	    --protocol=wsk --protocol-name="Execute ${APP_NAME} commands" \
	    --overwrite

        # use a custom icon for mac
        cp $ICON_MAC "$BUILDDIR/${APP_NAME}-darwin-x64/${APP_NAME}.app/Contents/Resources/electron.icns"

        # CLI script
        cp ../app/bin/fsh "$BUILDDIR/${APP_NAME}-darwin-x64/${APP_NAME}.app/Contents/MacOS/"

        # create the installers
        if [ -n "$ZIP_INSTALLER" ]; then
            (cd $BUILDDIR && zip -q -r "${APP_NAME}-darwin-x64" "${APP_NAME}-darwin-x64" -x \*~)

        elif [ -z "$NO_INSTALLER" ]; then
            ./node_modules/.bin/electron-installer-dmg \
	        "$BUILDDIR/${APP_NAME}-darwin-x64/${APP_NAME}.app" \
	        "${APP_NAME}" \
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
	    "${APP_NAME}" \
	    --asar=true \
            --build-version=$VERSION \
	    --out=$BUILDDIR \
	    --platform=linux \
	    --protocol=wsk --protocol-name="Execute ${APP_NAME} commands" \
            --icon=$ICON_LINUX \
	    --overwrite

        # CLI script
        cp ../app/bin/fsh "$BUILDDIR/${APP_NAME}-linux-x64"

        if [ -z "$NO_INSTALLER" ]; then
            (cd $BUILDDIR && zip -q -r "${APP_NAME}-linux-x64" "${APP_NAME}-linux-x64" -x \*~)
        fi
    fi
}


# line up the work
init
win32
mac
linux
cleanup

# TODO:
# upload to OS
# (cd ../prebuilt && npm version publish)
