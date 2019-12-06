import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { downloadFile } from '../utils/file'; 
import { URL } from 'url';
export interface DownloaderOptions {
    /** 并发数量 */
    threads: number;
    /** Custom HTTP Headers */
    headers: string;
    /** 输出目录 */
    output: string;
}
/**
 * 下载任务结构
 */
export interface DownloadTask {
    /** URL */
    url: string;
    /** 重试计数 */
    retryCount: number;
}

class Downloader extends EventEmitter {
    // Config
    threads: number = 8;
    headers: object = {};
    output: string = './shua_download_' + new Date().valueOf().toString();

    // Runtime Status
    /** 当前运行并发数量 */
    nowRunningThreadsCount: number = 0;
    /** 全部任务数 */
    totalCount: number;
    /** 已完成任务数 */
    finishCount: number = 0;
    startTime: Date;
    /** 
     * 所有需要下载的任务
     * 开始后不修改
     */
    tasks: DownloadTask[] = [];
    /**
     * 未完成的任务
     */
    unfinishedTasks: DownloadTask[] = [];

    constructor({ threads, headers, output }: DownloaderOptions) {
        super();
        if (threads) {
            this.threads = threads;
        }
        if (headers) {
            for (const h of headers.toString().split('\n')) {
                const header = h.split(':');
                if (header.length !== 2) {
                    throw new Error(`HTTP Headers invalid.`);
                }
                this.headers[header[0]] = header[1];
            }
        }
        if (output) {
            if (!fs.existsSync(output)) {
                throw new Error(`Output path is not exist.`);
            }
            this.output = output;
        }
        if (!fs.existsSync(this.output)) {
            fs.mkdirSync(this.output);
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
    }

    /**
     * 开始下载
     */
    start() {
        this.startTime = new Date();
        this.unfinishedTasks = [...this.tasks];
        this.totalCount = this.tasks.length;
        this.checkQueue();
    }

    /**
     * 检查下载队列
     */
    async checkQueue() {
        if (this.nowRunningThreadsCount < this.threads) {
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
                    console.log(`${this.finishCount} / ${this.totalCount}`);
                } catch (e) {
                    console.log(e.message);
                    console.log(`Download ${task.url} failed, retry later.`);
                    this.unfinishedTasks.push(task);
                    this.nowRunningThreadsCount--;
                } finally {
                    this.checkQueue();
                }
            } else {
                // 无未完成的任务了
            }
        }
        if (this.nowRunningThreadsCount === 0 && this.unfinishedTasks.length === 0) {
            console.log('Finished');
            process.exit();
        }
    }

    async handleTask(task: DownloadTask) {
        const filename = new URL(task.url).pathname.slice(1);
        const p = filename.split('/');
        return await downloadFile(task.url, path.resolve(this.output, p[p.length - 1]));
    }
}

export default Downloader;
