export abstract class Logger {
    public abstract debug(message: string);
    public abstract info(message: string, infoObj?: any);
    public abstract warning(message: string);
    public abstract error(message: string, error?: any);
    public abstract enableDebug(): void;
}

export class ConsoleLogger extends Logger {
    debugFlag = false;
    debug(message: any) {
        if (!this.debugFlag) {
            return;
        }
        console.debug(message);
    }

    info(message: any) {
        console.info(message);
    }

    warning(message: any) {
        console.warn(message);
    }

    error(message: string, error?: Error) {
        console.error(`${message}`);
        if (error) {
            console.log(error);
        }
    }
    enableDebug() {
        this.debugFlag = true;
    }
}

export default new ConsoleLogger();
