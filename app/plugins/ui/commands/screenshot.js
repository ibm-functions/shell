/*
 * Copyright 2017 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// for future reference, this is how we could write to a file:
//    remote.require('fs').writeFile('Screenshot.png', img.toPng(), callback...)

/**
 * Usage message
 *
 */
const usage = () => `Capture a screenshot to the clipboard.

\tscreenshot [sidecar | repl]

Required parameters:
\tsidecar        capture the sidecar contents
\trepl           capture the REPL contents
\tfull           capture the entire page, including header
\t<no params>    capture the entire page, except for header`

/**
 * Round a dom coordinate to make the electron API happy.
 *
 */
const round = Math.round

/** this is the handler body */
module.exports = (commandTree, prequire) => {
    const sidecarVisibility = prequire('/views/sidecar/visibility')

    commandTree.listen('/screenshot', (_1, _2, _3, modules, _5, _6, argv, options) => new Promise((resolve, reject) => {
        try {
            const { ipcRenderer, nativeImage, remote } = require('electron')

            // which dom to snap?
            const which = argv[1] && argv[1].toLowerCase(),
                  dom = !which ? document.querySelector('body > .page')
                  : which === 'full' ? document.body
                  : which === 'sidecar' ? document.getElementById('sidecar')
                  : which === 'repl' ? document.querySelector('.main > .repl')
                  : undefined // user passed some unknown string

            if (!dom || options.help) {
                return reject(new modules.errors.usage(usage()))

            } else if (which === 'sidecar' && !sidecarVisibility.isVisible()) {
                return reject('You requested to screenshot the sidecar, but it is not currently open')
            }
        
            // which rectangle to snap; electron's rect schema differs
            // from the underlying dom's schema. sigh
            // https://github.com/electron/electron/blob/master/docs/api/structures/rectangle.md
            // note that all four values must be integral, hence the rounding bits
            const domRect = dom.getBoundingClientRect(),
                  rect = { x: round(domRect.left),
                           y: round(domRect.top),
                           width: round(domRect.width),
                           height: round(domRect.height)
                         }

            if (which === 'sidecar') {
                // bump up by 1 pixel, we don't care about the left border
                rect.x += 1
                rect.width -= 1
            }

            // capture a screenshot
            const listener = (event, buf) => {
		if (!buf) {
		    // some sort of internal error in the main process
		    return reject('Internal Error')
		}

		const img = nativeImage.createFromBuffer(buf),
		      snapDom = document.createElement('div'),
                      snapHeader = document.createElement('header'),
                      snapFooter = document.createElement('div'),
                      snapImg = document.createElement('img'),
                      message = document.createElement('div'),
                      check = document.createElement('div'),
                      imgSize = img.getSize(),
                      widthPx = 600,
                      width = `${widthPx}px`,
                      heightPx = imgSize.height / imgSize.width * widthPx,
                      height = heightPx + 'px'
	    
		document.body.appendChild(snapDom)
		snapDom.appendChild(snapHeader)
		snapDom.appendChild(snapImg)
		snapDom.appendChild(snapFooter)
		snapDom.appendChild(check)
		snapDom.appendChild(message)

		snapDom.id = 'screenshot-captured'
		snapDom.classList.add('go-away-able')
		snapDom.classList.add('go-away') // initially hidden
		setTimeout(() => snapDom.classList.remove('go-away'), 0)
		snapDom.style.background = 'rgba(0,0,0,0.85)'
		snapDom.style.position = 'absolute'
		snapDom.style.width = '100%'
		snapDom.style.height = '100%'
		snapDom.style.top = 0
		snapDom.style.left = 0
		snapDom.style.display = 'flex'
		snapDom.style.flexDirection = 'column'
		snapDom.style.justifyContent = 'center'
		snapDom.style.alignItems = 'center'
		snapDom.style.zIndex = 5

                snapHeader.classList.add('header')
                snapHeader.style.paddingLeft = '1.5em'
                snapHeader.style.width = width
                snapHeader.style.maxWidth = '100%'
                snapHeader.style.border = 'none'
                const headerTitle = document.createElement('div')
                headerTitle.classList.add('application-name')
                headerTitle.innerText = 'Screenshot'
                snapHeader.appendChild(headerTitle)

                snapFooter.classList.add('sidecar-bottom-stripe')
                snapFooter.style.width = width
                snapFooter.style.justifyContent = 'flex-end'
                const closeButton = document.createElement('div')
                closeButton.innerText = 'Done'
                closeButton.className = 'sidecar-bottom-stripe-button sidecar-bottom-stripe-close'
                snapFooter.appendChild(closeButton)

                // the image; chrome bug: if we use width and height,
                // there is a white border that is not defeatible; if
                // we trick chrome into thinking the image has no
                // width and height (but fake it with padding), the
                // border goes away: https://stackoverflow.com/a/14709695
		snapImg.style.background = `url(${img.resize({width, height}).toDataURL()}) no-repeat center/cover`
                snapImg.style.maxWidth = '100%'
                snapImg.style.maxHeight = '100%'
                snapImg.style.filter = 'blur(1px) grayscale(0.5) contrast(0.5)'
		snapImg.style.width = '0px'
		snapImg.style.height = '0px'
                snapImg.style.padding = `${heightPx/2}px ${widthPx/2}px`

		message.style.position = 'absolute'
                message.style.fontSize = '2.25em'
                message.style.fontWeight = 600
                message.style.top = 'calc(50% + 2em)'
                message.innerText = 'Screenshot copied to clipboard'

		check.classList.add('go-away-button')
		check.style.position = 'absolute'
		check.innerText = '\u2714'
		check.style.color = 'var(--color-ok)'
		check.style.fontSize = '7em'

                // temporarily disable the repl
                modules.ui.getCurrentPrompt().readonly = true

                // temporarily override escape
                const oldHandler = document.onkeyup

                // when we're done, re-enable the things we messed with and hide the snapDom
                const finish = () => {
                    document.onkeyup = oldHandler
                    modules.ui.getCurrentPrompt().readonly = false
                    snapDom.classList.add('go-away')
                    setTimeout(() => document.body.removeChild(snapDom), 1000) // match go-away-able transition-duration; see ui.css
                }

                // we'll do a finish when the user hits escape
                document.onkeyup = evt => {
                    if (evt.keyCode === modules.ui.keys.ESCAPE) {
                        finish()
                    }
                }
                
                // also, if the user clicks on the close button, finish up
		closeButton.onclick = finish

                // we can no unregister our listener; this is
                // important as subsequent listener registrations
                // stack, rather than replace
                ipcRenderer.removeListener('capture-page-to-clipboard-done', listener)

		resolve('Successfully captured a screenshot to the clipboard')
	    }

            //
            // register our listener, and tell the main process to get
            // started (in that order!)
            //
	    ipcRenderer.on('capture-page-to-clipboard-done', listener)
	    ipcRenderer.send('capture-page-to-clipboard',
			     remote.getCurrentWebContents().id,
			     rect)
        } catch (e) {
            console.error(e)
            reject('Internal Error')
        }
    }))
}
