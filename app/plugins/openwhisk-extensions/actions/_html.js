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

const fs = require('fs'),
      path = require('path'),
      expandHomeDir = require('expand-home-dir'),
      htmlparser = require('htmlparser2')

/**
 * Deploy a linked asset
 *
 */
const link = (dir, file, name) => new Promise((resolve, reject) => {
    const filepath = path.resolve(dir, file)
    fs.exists(filepath, exists => {
        if (exists) {
            const mime = file.endsWith('.js') ? '.webjs' : ''
            repl.qexec(`let ${file}${mime} = ${filepath}`).then(resolve, reject)
        } else {
            resolve()
        }
    })
})

/**
 * Turn an attribute map into a key=value string
 *
 */
const mapToString = map => {
    let str = ''
    for (let key in map) {
        str += ` ${key}="${map[key]}"`
    }
    return str
}

/**
 * If we store certain content as OpenWhisk actions, they will need to
 * be served with a .http extension
 *
 */
const webbify = uri => {
    if (uri.endsWith('.css') || uri.endsWith('.png')) {
        return `${uri.substring(0, uri.lastIndexOf('.'))}.http`}
    else {
        return uri
    }
}

/**
 * Deploy an HTML page, along with any locally linked scripts and stylesheets
 *
 */
const deploy = location => new Promise((resolve, reject) => {
    try {
        const filepath = expandHomeDir(location),
              dir = path.dirname(filepath)

        fs.readFile(filepath, (err, data) => {
            try {
                if (err) {
                    reject(err)
                }

                const Ps = []   // for any other assets we may need to create
                let text = ''  // we may need to rewrite the content

                const parser = new htmlparser.Parser({
                    onopentag: (name, attribs) => {
                        if (name === 'script' && attribs.src) {
                            const webbed = webbify(attribs.src)
                            Ps.push(link(dir, attribs.src, webbed))
                            attribs.src = webbed
                        } else if (name === 'link' && attribs.href) {
                            const webbed = webbify(attribs.href)
                            Ps.push(link(dir, attribs.href, webbed))
                            attribs.href = webbed
                        }

                        text += `<${name}${mapToString(attribs)}>`
                    },
                    ontext: txt => {
                        text += txt
                    },
                    onclosetag: tagname => {
                        if (tagname !== 'img' && tagname !== 'link') {
                            text += `</${tagname}>`
                        }
                    }
                }/*, {decodeEntities: true}*/)

                parser.write(data)
                parser.end()

                // wait for the promises to complete
                Promise.all(Ps)
                    .then(() => resolve({ location, text }))  // return the location and updated text
                    .catch(reject)
            } catch (err) {
                reject(err)
            }
        })
    } catch (err) {
        reject(err)
    }
})

module.exports = () => {
    return {
        deploy
    }
}
