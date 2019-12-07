class Logger {
    debug(message) {
        console.debug(`[DEBUG] ${message}`);
    }
    info(message) {
        console.log(`[INFO] ${message}`);
    }
    warning(message) {
        console.log(`[WARN] ${message}`);
    }
    error(message) {
        console.log(`[ERROR] ${message}`);
    }
}

export default Logger;