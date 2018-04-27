function foo() {
    const fs = require('fs');
    const authorMap = JSON.parse(fs.readFileSync('author-map.json', 'utf8'));
    return composer.let({ am: authorMap }, p => {
        return am[p.author] == undefined ? {} : am[p.author]
    })
}
composer.sequence(foo())
