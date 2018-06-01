#!/bin/bash
set -e

# Build script for Travis-CI.

SCRIPTDIR=$(cd $(dirname "$0") && pwd)
ROOTDIR="$SCRIPTDIR/../.."
WHISKDIR="$ROOTDIR/../openwhisk"
IMAGE_PREFIX=openwhisk

# Pull down images
echo "pulling images"
docker pull openwhisk/controller &
docker pull openwhisk/invoker &
docker pull openwhisk/nodejs6action &
docker pull openwhisk/python3action &
docker pull openwhisk/action-nodejs-v8 &
docker pull openwhisk/java8action &
docker pull zookeeper:3.4 &
docker pull redis:3.2 &
docker pull nginx:1.13 &
wait
docker tag openwhisk/controller ${IMAGE_PREFIX}/controller
docker tag openwhisk/invoker ${IMAGE_PREFIX}/invoker
docker tag openwhisk/nodejs6action ${IMAGE_PREFIX}/nodejs6action
echo "done pulling images"

# disable controller1 and invoker1
cd $WHISKDIR/ansible/environments/local/
cp hosts.j2.ini hosts.bak
grep -vE 'controller1|invoker1' hosts.bak > hosts.j2.ini

# Install OpenWhisk
cd $WHISKDIR/ansible

# note that we increase the quotas on invocations per minute and concurrent invocations (per namespace)
ANSIBLE_CMD="ansible-playbook -i environments/local -e docker_image_prefix=$IMAGE_PREFIX -e limit_invocations_per_minute=600 -e limit_invocations_concurrent=100"

$ANSIBLE_CMD setup.yml
$ANSIBLE_CMD prereq.yml
$ANSIBLE_CMD couchdb.yml
$ANSIBLE_CMD initdb.yml
$ANSIBLE_CMD apigateway.yml  # interesting side node: this also provides a redis on the standard port, if you ever need it

# these lines are not needed, as we do the docker pulls of the openwhisk prebuilts above
# cd $WHISKDIR
# ./gradlew  -PdockerImagePrefix=$IMAGE_PREFIX

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
