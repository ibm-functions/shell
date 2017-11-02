#!/usr/bin/env bash

# install node and npm
sudo apt-get -y install nodejs npm

cd $HOME

# shallow clone OpenWhisk repo.
git clone --depth 1 https://github.com/apache/incubator-openwhisk.git openwhisk

cd openwhisk
./tools/travis/setup.sh
