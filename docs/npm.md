# Setting up Cloud Function Shell 

## Installing Shell
Shell is currently distributed through the [Node
package manager](https://www.npmjs.com/package/@ibm-functions/shell).

```bash
$ npm install -g @ibm-functions/shell
```

We recommend that you install the shell globally (`npm install
-g`). If you prefer to keep the installation private to your
workspace, you can add this line to your `$HOME/.npmrc`.

```bash
prefix=$HOME/.node
```

We also recommend using the `Node.js`
[installers](https://nodejs.org/en/), and installing `npm v5` and
`node v8`. If you're using `npm v3.10.x` you may encounter permissions
issues. In this case, upgrade your `npm` and try again.

## Using Shell with IBM Cloud Functions or Apache OpenWhisk
Currently, most Shell commands are for interacting with [Apache OpenWhisk](https://openwhisk.apache.org/), an open source serverless cloud platform. You can setup Shell to communicate with [IBM Cloud Functions](https://console.bluemix.net/openwhisk/) which is based on OpenWhisk, or your own locally deployed OpenWhisk instance. 

Note that if you are an exiting `bx wsk` or `wsk` CLI user, you should be able to [run Shell right away](../README.md#starting-shell). If you have never installed `bx wsk` or `wsk` CLI before, follow the instructions below to set up your environment: 

* _Run Shell with IBM Cloud Functions_: You need to have an [IBM Cloud account](https://www.ibm.com/cloud/), and follow the instructions [here](https://console.bluemix.net/openwhisk/learn/cli) to login to the IBM Cloud and verify your setup. 

* _Run Shell with Apache OpenWhisk_: you need a valid `$HOME/.wskprops` file and a [locally deployed OpenWhisk instance](https://github.com/apache/incubator-openwhisk#quick-start).

## Updating Shell
We roll out frequent updates and bug fixes. You can check for new
releases via `fsh version -u`.

```
$ fsh version -u
You are currently on version x.y.z
Checking for updates... you are up to date!
```

We recommend updating the shell via the same `npm install` command
shown earlier.

