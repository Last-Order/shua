import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';
import { EventEmitter } from 'events';
import { downloadFile } from '../utils/file';
import ExpressionParser from './expression_parser';
import Logger from '../utils/logger';

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
}

class Downloader extends EventEmitter {
    // Config
    threads: number = 8;
    timeout: number = 30000;
    headers: object = {};
    output: string = './shua_download_' + new Date().valueOf().toString();
    ascending: boolean = false;

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

    constructor({ threads, headers, output, ascending, timeout }: Partial<DownloaderOptions>) {
        super();
        this.logger = new Logger();
        if (threads) {
            this.threads = threads;
        }
        if (timeout) {
            this.timeout = timeout;
        }
        if (headers) {
            for (const h of headers.toString().split('\n')) {
                const header = h.split(':');
                if (header.length < 2) {
                    throw new Error(`HTTP Headers invalid.`);
                }
                this.headers[header[0]] = header.slice(1).join(':');
            }
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
    }

    /**
     * 从文件添加下载文件 URL
     * @param path 文件路径
     */
    loadUrlsFromFile(path: string) {
        const text = fs.readFileSync(path).toString();
        this.tasks.push(...text.split('\n').filter(line => !!line).map(line => {
            return {
                url: line,
                retryCount: 0
            };
        }));
        this.checkAscending();
    }

    /**
     * 从表达式添加任务
     * @param expression 表达式
     */
    loadUrlsFromExpression(expression: string) {
        const expressionParser = new ExpressionParser(expression);
        this.tasks.push(...expressionParser.getUrls().map(url => {
            return {
                url,
                retryCount: 0
            }
        }));
        this.checkAscending();
    }

    /**
     * 从URL数组添加任务
     * @param urls URL数组
     */
    loadUrlsFromArray(urls: string[]) {
        this.tasks.push(...urls.map(url => {
            return {
                url,
                retryCount: 0
            }
        }));
        this.checkAscending();
    }

    checkAscending() {
        if (this.ascending) {
            // 增序重命名文件
            const maxLength = this.tasks.length.toString().length;
            let counter = 0;
            for (const task of this.tasks) {
                const urlPath = new URL(task.url).pathname.slice(1).split('.');
                const ext = urlPath[urlPath.length - 1];
                task.filename = counter.toString().padStart(maxLength, '0') + `.${ext}`;
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
                output: process.stdout
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
                    this.logger.info(`${this.finishCount} / ${this.totalCount} or ${(this.finishCount / this.totalCount * 100).toFixed(2)}% finished | ETA: ${this.getETA()}`);
                } catch (e) {
                    this.logger.warning(`Download ${task.url} failed, retry later.`);
                    this.unfinishedTasks.push(task);
                    this.nowRunningThreadsCount--;
                } finally {
                    this.checkQueue();
                }
            }
        }
        if (this.nowRunningThreadsCount === 0 && this.unfinishedTasks.length === 0) {
            this.isEnd = true;
            this.logger.info(`All finished. Please checkout your files at [${this.output}]`);
            this.emit('finish');
        }
    }

    async handleTask(task: DownloadTask) {
        const filename = new URL(task.url).pathname.slice(1);
        const p = filename.split('/');
        return await downloadFile(task.url, path.resolve(this.output, task.filename !== undefined ? task.filename : p[p.length - 1]), {
            ...(Object.keys(this.headers).length > 0 ? this.headers : {}),
            timeout: this.timeout
        });
    }

    getETA() {
        const usedTime = new Date().valueOf() - this.startTime.valueOf();
        const remainingTimeInSeconds = Math.round(((usedTime / this.finishCount * this.totalCount) - usedTime) / 1000)
        if (remainingTimeInSeconds < 60) {
            return `${remainingTimeInSeconds}s`;
        } else if (remainingTimeInSeconds < 3600) {
            return `${Math.floor(remainingTimeInSeconds / 60)}m ${remainingTimeInSeconds % 60}s`;
        } else {
            return `${Math.floor(remainingTimeInSeconds / 3600)}h ${Math.floor((remainingTimeInSeconds % 3600) / 60)}m ${remainingTimeInSeconds % 60}s`;
        }
    }
}

export default Downloader;
