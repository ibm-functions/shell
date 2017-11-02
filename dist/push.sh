#!/usr/bin/env bash

export CONTAINER=$1

export OS_PROJECT_ID=
export OS_USER_ID=
export OS_PASSWORD=
export OS_REGION_NAME=
export OS_AUTH_URL=https://identity.open.softlayer.com/v3
export OS_IDENTITY_API_VERSION=3
export OS_AUTH_VERSION=3

# create container, making it public
swift post "$CONTAINER" --read-acl ".r:*"

shift

# upload the binaries
cd build
for file in "$@"; do
    echo "Uploading $file"
    swift upload "$CONTAINER" "$file" &
done

wait

# OS_STORAGE_URL is defined by `swift auth`
export BASE_URL=`swift auth | grep OS_STORAGE_URL | awk -F = '{print $2}'`
export LINUX=$1
export WIN32=$2
export DARWIN=$3

cd ../../prebuilt
node -e '
const version = process.env.CONTAINER
const base = `${process.env.BASE_URL}/${version}`
const config = require("./config.json")
config.latest = version
config.files[version] = {
   linux: `${base}/${encodeURIComponent(process.env.LINUX)}`,
   win32: `${base}/${encodeURIComponent(process.env.WIN32)}`,
   darwin: `${base}/${encodeURIComponent(process.env.DARWIN)}`,
}
require("fs").writeFileSync("config.json", JSON.stringify(config, undefined, 4))
'
