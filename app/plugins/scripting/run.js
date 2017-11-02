const fs = require('fs')

const doRun = (_1, _2, argv) => new Promise((resolve, reject) => {
    //
    // first read the command file
    //
    fs.readFile(argv[argv.indexOf('run') + 1], (err, data) => {
        if (err) {
            reject(err)
        } else {
            //
            // evaluate each line, careful that each repl.pexec is an async
            //
            const lines = data.toString().split(/\n+/)

            let N = 0
            lines.reduce((promise, line) => promise.then(() => {
                const nextPromise = repl.qexec(line)
                if (!nextPromise.isBlank) {
                    N++
                    return nextPromise
                } else {
                    // blank or comment line
                    return Promise.resolve(true)
                }
            }), Promise.resolve(true))
                .then(() => resolve(`Successfully executed ${N} commands`))
                .catch(reject)
        }
    })
})

module.exports = commandTree => {
    commandTree.listen('/run', doRun, { docs: 'Evaluate shell commands in a given file' })
}
