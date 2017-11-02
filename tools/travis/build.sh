#!/bin/bash
set -e

# Build script for Travis-CI.

SCRIPTDIR=$(cd $(dirname "$0") && pwd)
ROOTDIR="$SCRIPTDIR/../.."
WHISKDIR="$ROOTDIR/../openwhisk"

# Install OpenWhisk
cd $WHISKDIR/ansible

ANSIBLE_CMD="ansible-playbook -i environments/local -e docker_image_prefix=openwhisk "

$ANSIBLE_CMD setup.yml
$ANSIBLE_CMD prereq.yml
$ANSIBLE_CMD couchdb.yml
$ANSIBLE_CMD initdb.yml
$ANSIBLE_CMD apigateway.yml

cd $WHISKDIR
 ./gradlew  -PdockerImagePrefix=openwhisk
cd $WHISKDIR/ansible

$ANSIBLE_CMD wipe.yml
$ANSIBLE_CMD openwhisk.yml  -e '{"openwhisk_cli":{"installation_mode":"remote","remote":{"name":"OpenWhisk_CLI","dest_name":"OpenWhisk_CLI","location":"https://github.com/apache/incubator-openwhisk-cli/releases/download/latest"}}}'
$ANSIBLE_CMD postdeploy.yml

cd $WHISKDIR
cat whisk.properties

APIHOST=$(cat $WHISKDIR/whisk.properties | grep edge.host= | sed s/edge\.host=//)
#key=$(cat $WHISKDIR/ansible/files/auth.guest)

echo "APIHOST=$APIHOST" > ~/.wskprops
echo "INSECURE_SSL=true" >> ~/.wskprops

