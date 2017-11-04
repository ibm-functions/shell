#!/usr/bin/env bash

SCRIPTDIR=$(cd $(dirname "$0") && pwd)

Xvfb ${DISPLAY-99} -ac &
sleep 5

$SCRIPTDIR/runLocal.sh $@
