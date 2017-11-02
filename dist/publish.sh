#!/usr/bin/env bash

# 1. bump the version
VERSION=`cd ../prebuilt && npm version patch`
echo "Bumping to $VERSION"
(cd ../app && npm version $VERSION)


# 2. build the platform binary bundles
./build.sh


# 3. push the builds to a new OS container
./push.sh $VERSION "IBM Cloud Functions Shell-linux-x64.zip" "IBM Cloud Functions Shell-win32-x64.zip" "IBM Cloud Functions Shell.dmg"


# 4. tag git
git tag $VERSION
