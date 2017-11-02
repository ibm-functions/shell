# IBM Cloud Functions Shell

Composer is an IBM Cloud Functions programming model for composing
individual functions into larger applications. Compositions,
informally named apps, run in the cloud using automatically managed
compute and memory resources. Composer is an extension of the
function-as-a-service computing model, and enables stateful
computation, control flow, and rich patterns of data flow.

This npm package provides the **IBM Cloud Functions Shell**, an
Electron-based development tool for Composer.

## Getting Started

First, install the Shell:

```bash
npm install -g @ibm-functions/shell
```

This will provide you with a `fsh` command.  From there, you can begin
to program your compositions. For more detailed documentation, please
consult
[the main docs page](https://github.com/ibm-functions/composer/tree/master/docs).

As a first task, you may use one of the built-in demo apps:

```bash
fsh app preview @demos/hello.js
```

You should then see a visualization of this simple hello world app:
|<img src="https://github.com/ibm-functions/composer/blob/master/docs/hello-composition.png?raw=true" width="50%" title="Hello app">|
|:--:|
|Composition preview showing the control flow for the app.|

From there, you can visit the Code tab, copy it into your favorite
editor, and modify it to your liking. The `app preview` visualization
will automatically update as you edit and save the source file.

Next, you may deploy and invoke your app:

```bash
fsh app create hello @demos/hello.js
fsh app invoke hello -p name composer
```

Finally, if you wish to visualize the execution flow:

```bash
fsh session get --last
```

Or, more generally, you can use `fsh session list` recent sessions,
and do a `fsh session get` against a specific session id from that list.

For more information, we encourge you to consult the 
[the full docs page](https://github.com/ibm-functions/composer/tree/master/docs).

## Launching the Full Experience

The tool has an internal REPL that can be helpful for exploring and
refining your creations. To launch this experience:

```bash
fsh shell
```

On MacOS, you can pin the app to your dock. From there, you need only
click on the dock icon to launch the tool.

## Activity Visualization

The shell also includes visualizations of execution activity. For
example, you can use `fsh grid` to see a grid view of your recent
activity. If you specify `fsh grid compName`, the view will be limited
to the functions used by the given composition.

<img src="https://github.com/ibm-functions/shell/blob/master/images/grid.png?raw=true" width="75%" title="Activity Grid Visualization">|
