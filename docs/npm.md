## Installing the shell with `npm`

The programming shell is currently distributed through the [Node
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

We roll out frequent updates and bug fixes. You can check for new
releases via `fsh version -u`.

```
$ fsh version -u
You are currently on version x.y.z
Checking for updates... you are up to date!
```

We recommend updating the shell via the same `npm install` command
shown earlier.

