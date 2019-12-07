const util = require('util');
export const exec = util.promisify(require('child_process').exec);

export const deleteDirectory = (path: string) => {
    if (process.platform === "win32") {
        return exec(`rd /s /q "${path}"`);
    } else {
        return exec(`rm -rf "${path}"`);
    }
}