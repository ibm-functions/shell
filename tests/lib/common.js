const Application = require('spectron').Application,
      electron = require('../../app/node_modules/electron'),
      appMain = process.env.APP_MAIN || '../app/main.js',
      wsk = require('./openwhisk'),
      ui = require('./ui'),
      rp = require('request-promise'),
      withRetry = require('promise-retry'),
      cli = ui.cli

/**
 * Mimic the request-promise functionality, but with retry
 *
 */
exports.rp = opts => {
    return withRetry((retry, iter) => {
        return rp(Object.assign({ timeout: 10000 }, typeof opts === 'string' ? { url: opts } : opts))
            .catch(err => {
                const isNormalError = err && (err.statusCode === 400 || err.statusCode === 404 || err.statusCode === 409)
                if (!isNormalError && (iter < 10)) {
                    console.error(err)
                    retry()
                } else {
                    console.error(`Error in rp with opts=${JSON.stringify(opts)}`)
                    throw err
                }
            })
    })
}

/**
 * This is the method that will be called before a test begins
 *   fuzz lets us blank out certain portions of the world
 *
 */
exports.before = (ctx, {fuzz}={}) => {
    ctx.retries(10)

    return function() {
    const env = {}
    if (fuzz) {
        env.___IBM_FSH_FUZZ = JSON.stringify(fuzz)
    }

    const opts = {
	path: electron,
	env,
        chromeDriverArgs: [ '--no-sandbox' ],
        waitTimeout: process.env.TIMEOUT || 60000,
	args: [ appMain ]
    }
    if (process.env.CHROMEDRIVER_PORT) {
        opts.port = process.env.CHROMEDRIVER_PORT
    }
    if (process.env.WSKNG_NODE_DEBUG) {
	// pass WSKNG_DEBUG on to NODE_DEBUG for the application
	opts.env.NODE_DEBUG = process.env.WSKNG_NODE_DEBUG
    }

    ctx.app = new Application(opts)
    return Promise.all([ wsk.cleanAll(process.env.AUTH), wsk.cleanAll(process.env.AUTH2) ])  // clean openwhisk assets from previous runs
        .then(() => ctx.app.start())                                                         // this will launch electron
        .then(() => ctx.title && ctx.app.browserWindow.setTitle(ctx.title))                  // set the window title to the name of the current test
        .then(() => ctx.app.client.localStorage('DELETE'))                                   // clean out local storage
    }
}

/**
 * This is the method that will be called when a test completes
 *
 */
exports.after = (ctx, f) => () => {
    if (f) f()

    // when we're done with a test suite, look for any important
    // SEVERE errors in the chrome console logs. try to ignore
    // intentional failures as much as possible!
    ctx.app.client.getRenderProcessLogs().then(logs => logs.forEach(log => {
        if (log.level === 'SEVERE'                     // only console.error messages
            && log.message.indexOf('ENOENT') < 0       // we probably caused file not found errors
            && log.message.indexOf('UsageError') < 0   // we probably caused repl usage errors
            && log.message.indexOf('Usage:') < 0       // we probably caused repl usage errors
            && log.message.indexOf('Unepxected option') < 0   // we probably caused command misuse
           ) {
            console.log(`${log.source} ${log.level} ${log.message}`)
        }
    }))

    if (ctx.app && ctx.app.isRunning()) {
	return ctx.app.stop()
    }
}

exports.oops = ctx => err => {
    console.log(err)

    ctx.app.client.getMainProcessLogs().then(logs => logs.forEach(log => {
        if (log.indexOf('INFO:CONSOLE') < 0) {
            // don't log console messages, as these will show up in getRenderProcessLogs
            console.log(`MAIN ${log}`)
        }
    }))
    ctx.app.client.getRenderProcessLogs().then(logs => logs.forEach(log => console.log(`RENDER ${log.source} ${log.level} ${log.message}`)))
    
    ctx.app.client.getText(ui.selectors.OOPS)
	.then(anyErrors => {
	    if (anyErrors) {
		console.log('Error from the UI', anyErrors)
	    }
	})

    // swap these two if you want to debug failures locally
    //return new Promise((resolve, reject) => setTimeout(() => { reject(err) }, 100000))
    throw err
}
