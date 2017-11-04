#!/usr/bin/env bash

SCRIPTDIR=$(cd $(dirname "$0") && pwd)

Xvfb ${DISPLAY-:99} -screen 0 ${WINDOW_WIDTH}x${WINDOW_HEIGHT}x24 -ac &
sleep 5

$SCRIPTDIR/runLocal.sh $@
