import * as fs from "fs";
import * as path from "path";
import { URL } from "url";
import { EventEmitter } from "events";
import ExpressionParser from "./expression_parser";
import TaskScheduler, {
    SchedulerTask,
    TaskDropEvent,
    TaskErrorEvent,
    TaskFailDecision,
    TaskFinishEvent,
} from "./task_scheduler";
import { downloadFile, getFileExt, loadRemoteFile } from "../utils/file";
import consoleLogger, { Logger } from "../utils/logger";
import { DEFAULT_USER_AGENT } from "../constants";
import { TaskStatus } from "../types";
import FileConcentrator from "./file_concentrator";

export interface DownloaderOptions {
    /** 并发数量 */
    threads: number;
    /** 最大重试次数 */
    retries: number;
    /** 超时阈值 */
    timeout: number;
    /** Custom HTTP Headers */
    headers: string;
    /** 输出目录 */
    output: string;
    /** 是否以数字增序重命名文件 */
    ascending: boolean;
    /** 是否二进制连接下载文件 */
    concat?: boolean;
    /** 无视断点强行连接文件 */
    forceConcat?: boolean;
    /** 是否启用调试输出 */
    verbose?: boolean;
    /** 自定义 Logger */
    logger?: Logger;
}

export interface UrlTask {
    /** URL */
    url: string;
}

/**
 * 下载任务结构
 */
export interface DownloadTask extends UrlTask {
    /** 顺序编号 */
    index: number;
    /** 输出文件名 */
    filename: string;
    /** 自定义 Headers */
    headers?: Record<string, string>;
}

export class JSONParseError extends Error {}
export class LoadRemoteFileError extends Error {}

class Downloader extends EventEmitter {
    // Config
    threads: number = 8;
    retries: number = 5;
    timeout: number = 30000;
    headers: Record<string, unknown> = {};
    output: string = "./shua_download_" + new Date().valueOf().toString();
    concatOutput: string;
    ascending: boolean = false;
    concat: boolean = false;
    forceConcat: boolean = false;
    verbose: boolean = false;

    // Deps
    logger: Logger;

    // Runtime Status
    /** 当前运行并发数量 */
    nowRunningThreadsCount: number = 0;
    /** 全部任务数 */
    totalCount: number = 0;
    /** 已完成任务数 */
    finishCount: number = 0;
    /** 放弃任务数 */
    dropCount: number = 0;
    startTime: Date;
    isEnd: boolean = false;
    /**
     * 所有需要下载的任务
     * 开始后不修改
     */
    tasks: DownloadTask[] = [];

    taskStatusRecord: TaskStatus[] = [];

    scheduler: TaskScheduler<DownloadTask>;

    fileConcentrator: FileConcentrator;

    constructor({
        threads,
        retries,
        headers,
        output,
        ascending,
        concat,
        forceConcat,
        timeout,
        verbose,
        logger,
    }: Partial<DownloaderOptions>) {
        super();
        this.logger = logger || consoleLogger;
        if (verbose) {
            this.verbose = verbose;
            this.logger.enableDebug();
        }
        if (threads) {
            this.threads = threads;
        }
        if (retries) {
            this.retries = retries;
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
        }
        if (ascending) {
            this.ascending = ascending;
        }
        if (concat) {
            this.concat = concat;
        }
        if (forceConcat) {
            this.forceConcat = forceConcat;
        }
        if (output) {
            if (this.concat) {
                if (fs.existsSync(output)) {
                    throw new Error("Output path already exists. Please use a different path.");
                }
                this.concatOutput = output;
            } else {
                this.output = output;
                if (path.extname(output)) {
                    this.logger.warning("Please use a directory name as the output path.");
                }
            }
        }
        this.setupTaskScheduler();
    }

    onChunkNaming(task: Omit<DownloadTask, "filename">): string {
        if (this.ascending) {
            const ext = getFileExt(task.url);
            return task.index.toString().padStart(8, "0") + (ext ? `.${ext}` : "");
        }
        const filename = new URL(task.url).pathname.slice(1);
        const p = filename.split("/");
        return p[p.length - 1];
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
                text = await loadRemoteFile(path, { headers: this.headers });
                this.logger.info(`Load file from ${path} success.`);
            } catch (e) {
                throw new LoadRemoteFileError(`Load remote file failed.`);
            }
        } else {
            text = fs.readFileSync(path).toString();
        }
        const tasks: UrlTask[] = [];
        const lines = text
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => !!line);
        for (const index in lines) {
            let url;
            if (lines[index].startsWith("#")) {
                continue;
            }
            if (lines[index].startsWith("http://") || lines[index].startsWith("https://")) {
                url = lines[index];
            } else if (isLoadFromRemote) {
                try {
                    url = new URL(lines[index], path).href;
                } catch (e) {
                    // ignore
                }
            }
            if (url) {
                tasks.push({ url });
            }
        }
        this.addTasks(tasks);
    }

    /**
     * 从表达式添加任务
     * @param expression 表达式
     */
    loadUrlsFromExpression(expression: string) {
        const expressionParser = new ExpressionParser(expression);
        this.addTasks(expressionParser.getUrls().map((url) => ({ url })));
    }

    /**
     * 从URL数组添加任务
     * @param urls URL数组
     */
    loadUrlsFromArray(urls: string[]) {
        this.addTasks(urls.map((url) => ({ url })));
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
        this.addTasks(tasks);
    }

    setupTaskScheduler() {
        const scheduler = new TaskScheduler<DownloadTask>({
            threads: this.threads,
            taskErrorHandler: (error, task) => {
                if (task.retryCount > this.retries) {
                    return TaskFailDecision.DROP;
                }
                return TaskFailDecision.RETRY;
            },
        });
        scheduler.on("task-finish", ({ task, finishCount }: TaskFinishEvent<DownloadTask>) => {
            this.taskStatusRecord[task.payload.index] = TaskStatus.DONE;
            this.finishCount++;
            if (this.concat) {
                this.fileConcentrator.addTasks([
                    {
                        filePath: path.resolve(this.output, task.payload.filename),
                        index: task.payload.index,
                    },
                ]);
            }
            this.logger.info(
                `${this.finishCount} / ${this.totalCount} or ${((this.finishCount / this.totalCount) * 100).toFixed(
                    2
                )}% finished | ETA: ${this.getETA()}`
            );
            this.emit("progress", this.finishCount, this.totalCount);
        });
        scheduler.on("task-error", ({ task, error: e, decision }: TaskErrorEvent<DownloadTask, any>) => {
            this.logger.warning(
                `Download ${task.payload.url} failed, ${
                    decision === TaskFailDecision.DROP ? "max retries exceed, drop." : "retry later."
                } [${
                    (e.response ? `${e.response.status} ${e.response.statusText}` : undefined) ||
                    e.code ||
                    e.message ||
                    e.constructor.name ||
                    "UNKNOWN"
                }]`
            );
            // this.logger.debug(e);
            this.emit("task-error", e, task);
        });
        scheduler.on("task-drop", ({ task }: TaskDropEvent<DownloadTask, any>) => {
            this.taskStatusRecord[task.payload.index] = TaskStatus.DROPPED;
            this.dropCount++;
        });
        scheduler.once("finish", this.beforeFinish.bind(this));
        this.scheduler = scheduler;
    }

    addTasks(tasks: UrlTask[]) {
        this.logger.info(`${tasks.length} tasks added.`);
        this.scheduler.addTasks(
            tasks.map<Omit<SchedulerTask<DownloadTask>, "uuid">>((task, index) => ({
                handler: this.handleTask.bind(this),
                payload: {
                    ...task,
                    index: this.totalCount + index,
                    filename: this.onChunkNaming({
                        url: task.url,
                        index: this.totalCount + index,
                    }),
                },
                retryCount: 0,
                priority: -(this.totalCount + index), // 默认以添加顺
            }))
        );
        for (const index in tasks) {
            const task = tasks[index];
            const taskIndex = this.totalCount + +index;
            const newTask = {
                ...task,
                index: taskIndex,
                filename: this.onChunkNaming({
                    url: task.url,
                    index: taskIndex,
                }),
            };
            this.tasks.push(newTask);
            this.taskStatusRecord[taskIndex] = TaskStatus.PENDING;
        }
        this.totalCount += tasks.length;
    }

    /**
     * 开始下载
     */
    start() {
        if (this.tasks.length === 0) {
            return;
        }
        this.startTime = new Date();
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

        if (this.concat) {
            const ext = getFileExt(this.tasks[0].url);
            this.fileConcentrator = new FileConcentrator({
                outputPath:
                    this.concatOutput || path.resolve(this.output, `_shua_concat_${Date.now()}${ext ? `.${ext}` : ""}`),
                taskStatusRecord: this.taskStatusRecord,
                deleteAfterWritten: true,
                ignoreBreakpoints: this.forceConcat,
            });
        }

        this.scheduler.start();
    }

    async handleTask(task: DownloadTask) {
        return await downloadFile(task.url, path.resolve(this.output, task.filename), {
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
        });
    }

    async beforeFinish() {
        if (this.concat) {
            this.logger.info("Please wait...");
            await this.fileConcentrator.waitAllFilesWritten();
            const outputPaths = this.fileConcentrator.getOutputFilePaths();
            if (outputPaths.length === 1) {
                this.logger.info(`All finished. Please checkout your files at [${path.resolve(outputPaths[0])}]`);
            } else {
                this.logger.info(
                    `All finished. Please checkout your files at ${outputPaths
                        .map((p) => `[${path.resolve(p)}]`)
                        .join(", ")}.`
                );
            }
        } else {
            this.logger.info(`All finished. Please checkout your files at [${path.resolve(this.output)}]`);
        }
        if (this.dropCount > 0) {
            this.logger.warning(`${this.dropCount} files are dropped due to unrecoverable errors.`);
        }
        this.emit("finish");
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
