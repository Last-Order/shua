import * as fs from "fs";
import * as path from "path";
import { URL } from "url";
import { EventEmitter } from "events";
import axios from "axios";
import { downloadFile, loadRemoteFile } from "../utils/file";
import ExpressionParser from "./expression_parser";
import { ConsoleLogger, Logger } from "../utils/logger";
import { DEFAULT_USER_AGENT } from "../constants";

export interface DownloaderOptions {
    /** 并发数量 */
    threads: number;
    /** 超时阈值 */
    timeout: number;
    /** Custom HTTP Headers */
    headers: string;
    /** 输出目录 */
    output: string;
    /** 是否以数字增序重命名文件 */
    ascending: boolean;
    /** 是否启用调试输出 */
    verbose?: boolean;
    /** 自定义 Logger */
    logger?: Logger;
}
/**
 * 下载任务结构
 */
export interface DownloadTask {
    /** URL */
    url: string;
    /** 重试计数 */
    retryCount: number;
    /** 输出文件名 */
    filename?: string;
    /** 自定义 Headers */
    headers?: Record<string, string>;
}

export class JSONParseError extends Error {}
export class LoadRemoteFileError extends Error {}

class Downloader extends EventEmitter {
    // Config
    threads: number = 8;
    timeout: number = 30000;
    headers: Record<string, unknown> = {};
    output: string = "./shua_download_" + new Date().valueOf().toString();
    ascending: boolean = false;
    verbose: boolean = false;

    // Deps
    logger: Logger;

    // Runtime Status
    /** 当前运行并发数量 */
    nowRunningThreadsCount: number = 0;
    /** 全部任务数 */
    totalCount: number;
    /** 已完成任务数 */
    finishCount: number = 0;
    startTime: Date;
    isEnd: boolean = false;
    /**
     * 所有需要下载的任务
     * 开始后不修改
     */
    tasks: DownloadTask[] = [];
    /**
     * 未完成的任务
     */
    unfinishedTasks: DownloadTask[] = [];

    constructor({ threads, headers, output, ascending, timeout, verbose, logger }: Partial<DownloaderOptions>) {
        super();
        this.logger = logger || new ConsoleLogger();
        if (threads) {
            this.threads = threads;
        }
        if (timeout) {
            this.timeout = timeout;
        }
        this.headers = {
            "User-Agent": DEFAULT_USER_AGENT,
        };
        if (headers) {
            const headerConfigArr = Array.isArray(headers) ? headers : [headers];
            for (const headerConfig of headerConfigArr) {
                for (const h of headerConfig.split("\\n")) {
                    try {
                        const header = /^([^ :]+):(.+)$/.exec(h).slice(1);
                        this.headers[header[0]] = header[1].trim();
                    } catch (e) {
                        logger.warning(`HTTP Headers invalid. Ignored.`);
                    }
                }
            }
            // // Apply global custom headers
            // axios.defaults.headers.common = {
            //     ...axios.defaults.headers.common,
            //     "User-Agent": DEFAULT_USER_AGENT,
            //     ...this.headers,
            // };
        }
        if (output) {
            if (!fs.existsSync(output)) {
                throw new Error(`Output path is not exist.`);
            }
            this.output = output;
        }
        if (ascending) {
            this.ascending = ascending;
        }
        if (verbose) {
            this.verbose = verbose;
            this.logger.enableDebug();
        }
    }

    /**
     * 从文件添加下载文件 URL
     * @param path 文件路径
     */
    async loadUrlsFromFile(path: string) {
        let text;
        let isLoadFromRemote = false;
        if (path.startsWith("http://") || path.startsWith("https://")) {
            try {
                this.logger.debug(`Load file from ${path}`);
                isLoadFromRemote = true;
                text = await loadRemoteFile(path);
            } catch (e) {
                throw new LoadRemoteFileError(`Load remote file failed.`);
            }
        } else {
            text = fs.readFileSync(path).toString();
        }
        const tasks: DownloadTask[] = [];
        const lines = text
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => !!line);
        for (const line of lines) {
            let url;
            if (line.startsWith("#")) {
                continue;
            }
            if (line.startsWith("http://") || line.startsWith("https://")) {
                url = line;
            } else if (isLoadFromRemote) {
                try {
                    url = new URL(line, path).href;
                } catch (e) {
                    // ignore
                }
            }
            if (url) {
                tasks.push({ url, retryCount: 0 });
            }
        }
        this.tasks.push(...tasks);
        this.checkAscending();
    }

    /**
     * 从表达式添加任务
     * @param expression 表达式
     */
    loadUrlsFromExpression(expression: string) {
        const expressionParser = new ExpressionParser(expression);
        this.tasks.push(
            ...expressionParser.getUrls().map((url) => {
                return {
                    url,
                    retryCount: 0,
                };
            })
        );
        this.checkAscending();
    }

    /**
     * 从URL数组添加任务
     * @param urls URL数组
     */
    loadUrlsFromArray(urls: string[]) {
        this.tasks.push(
            ...urls.map((url) => {
                return {
                    url,
                    retryCount: 0,
                };
            })
        );
        this.checkAscending();
    }

    /**
     * 从 JSON 文件添加任务
     * @param path
     */
    loadUrlsFromJSON(path: string) {
        const text = fs.readFileSync(path).toString();
        const tasks = JSON.parse(text);
        if (!tasks?.length) {
            throw new JSONParseError(`Invalid JSON file.`);
        }
        if (tasks.some((task) => !task.url)) {
            throw new JSONParseError(`Missing URL for tasks in JSON file.`);
        }
        this.tasks.push(
            ...tasks.map((task) => ({
                ...task,
                retryCount: 0,
            }))
        );
        this.checkAscending();
    }

    checkAscending() {
        if (this.ascending) {
            // 增序重命名文件
            const maxLength = this.tasks.length.toString().length;
            let counter = 0;
            for (const task of this.tasks) {
                const urlPath = new URL(task.url).pathname.slice(1).split("/");
                let ext;
                if (urlPath[urlPath.length - 1].includes(".")) {
                    ext = urlPath[urlPath.length - 1].split(".").slice(-1)[0];
                }
                if (ext) {
                    task.filename = counter.toString().padStart(maxLength, "0") + `.${ext}`;
                } else {
                    task.filename = counter.toString().padStart(maxLength, "0");
                }
                counter++;
            }
        }
    }

    /**
     * 开始下载
     */
    start() {
        this.startTime = new Date();
        this.unfinishedTasks = [...this.tasks];
        this.totalCount = this.tasks.length;

        if (process.platform === "win32") {
            const rl = require("readline").createInterface({
                input: process.stdin,
                output: process.stdout,
            });

            rl.on("SIGINT", function () {
                // @ts-ignore
                process.emit("SIGINT");
            });
        }

        process.on("SIGINT", () => {
            process.exit();
        });

        if (!fs.existsSync(this.output)) {
            fs.mkdirSync(this.output);
        }

        this.checkQueue();
    }

    /**
     * 检查下载队列
     */
    async checkQueue() {
        if (this.isEnd) {
            return;
        }
        if (this.nowRunningThreadsCount < this.threads && this.unfinishedTasks.length > 0) {
            // 有空余的并发可供使用
            if (this.unfinishedTasks.length > 0) {
                // 有剩余任务 执行
                const task = this.unfinishedTasks.shift();
                this.nowRunningThreadsCount++;
                this.checkQueue();
                try {
                    await this.handleTask(task);
                    this.nowRunningThreadsCount--;
                    this.finishCount++;
                    this.logger.info(
                        `${this.finishCount} / ${this.totalCount} or ${(
                            (this.finishCount / this.totalCount) *
                            100
                        ).toFixed(2)}% finished | ETA: ${this.getETA()}`
                    );
                    this.emit("progress", this.finishCount, this.totalCount);
                    this.emit("task-finish", task);
                } catch (e) {
                    this.logger.warning(
                        `Download ${task.url} failed, retry later. [${
                            e.code ||
                            (e.response ? `${e.response.status} ${e.response.statusText}` : undefined) ||
                            e.message ||
                            e.constructor.name ||
                            "UNKNOWN"
                        }]`
                    );
                    this.logger.debug(e.request);
                    this.unfinishedTasks.push(task);
                    this.nowRunningThreadsCount--;
                    this.emit("task-error", e, task);
                } finally {
                    this.checkQueue();
                }
            }
        }
        if (this.nowRunningThreadsCount === 0 && this.unfinishedTasks.length === 0) {
            this.isEnd = true;
            this.logger.info(`All finished. Please checkout your files at [${this.output}]`);
            this.emit("finish");
        }
    }

    async handleTask(task: DownloadTask) {
        const filename = new URL(task.url).pathname.slice(1);
        const p = filename.split("/");
        return await downloadFile(
            task.url,
            path.resolve(this.output, task.filename !== undefined ? task.filename : p[p.length - 1]),
            {
                ...(task.headers
                    ? {
                          headers: {
                              ...this.headers,
                              ...task.headers,
                          },
                      }
                    : {
                          headers: { ...this.headers },
                      }),
                timeout: this.timeout,
            }
        );
    }

    getETA() {
        const usedTime = new Date().valueOf() - this.startTime.valueOf();
        const remainingTimeInSeconds = Math.round(((usedTime / this.finishCount) * this.totalCount - usedTime) / 1000);
        if (remainingTimeInSeconds < 60) {
            return `${remainingTimeInSeconds}s`;
        } else if (remainingTimeInSeconds < 3600) {
            return `${Math.floor(remainingTimeInSeconds / 60)}m ${remainingTimeInSeconds % 60}s`;
        } else {
            return `${Math.floor(remainingTimeInSeconds / 3600)}h ${Math.floor(
                (remainingTimeInSeconds % 3600) / 60
            )}m ${remainingTimeInSeconds % 60}s`;
        }
    }
}

export default Downloader;
