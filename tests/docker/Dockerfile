FROM node:8.9-slim

# install debian packages
# note: git is needed by npm install in tests
RUN wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - \
 && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
 && apt-get update \
 && apt-get install -y \
    git xvfb dbus dbus-x11 google-chrome-stable libnotify-cil-dev make g++
