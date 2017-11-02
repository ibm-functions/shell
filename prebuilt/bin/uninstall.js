// npm tries to make a fsh.cmd for us. it doesn't work with our bat file.
if (process.platform === 'win32') {
    const cmd = require('path').join(process.cwd(), '..', '..', '..', 'fsh.cmd')
    if (require('fs').existsSync(cmd)) {
        require('fs').unlinkSync(cmd)
    }
}
