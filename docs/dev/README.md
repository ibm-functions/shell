# Shell Development

The Shell is an [Electron](https://electron.atom.io/)
application. Electron is a framework for developing rich client
applications, using browser technologies. Electron applications are
cross-platform, at least to the extent that the framework has builds
for Windows, macOS, and Linux.

   - [Quick Start Guide](#quick-start-guide)
   - [Setting up a Local OpenWhisk](#setting-up-a-local-openwhisk)
   - [Lay of the land](lay-of-the-land.md) describes the structure and
     layout of the code.
   - [Running Local Tests](local-testing.md) shows how to run the test
     suite locally.

## Quick Start Guide

Developing against a local OpenWhisk is highly recommended. This is
not a strict requirement, for code editing. To run local tests,
however, a local OpenWhisk is required. Once you have configured your
`~/.wskprops` to point to your desired OpenWhisk service, you can
begin Shell development:

```
$ cd app
$ npm install
$ ./bin/fsh shell
```

If you see the Shell open up, then you are ready to go. For the most
part, any edits to UI code can be incorporated into that running
instance by simply reloading the Shell, as you would a browser window;
e.g. Command+R on macOS, or Control+R on Windows and Linux. This
allows you to quickly edit and debug changes, without slow rebuild and
restart steps.

## Setting up a Local OpenWhisk

For complete details, please consult
the
[OpenWhisk documentation](https://github.com/apache/incubator-openwhisk). Here,
we summarize one reliable way to do so. This recipe requires that you
have already installed [Vagrant](https://www.vagrantup.com)
and [VirtualBox](https://www.virtualbox.org/).

```
git clone --depth=1 https://github.com/apache/incubator-openwhisk.git openwhisk
cd openwhisk/tools/vagrant
./hello
wsk property set --apihost 192.168.33.13 --auth `vagrant ssh -- cat openwhisk/ansible/files/auth.guest`
```
