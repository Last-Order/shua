import * as fs from "fs";
import { TaskStatus } from "../types";
import { getFileExt } from "../utils/file";
import { sleep } from "../utils/helper";

interface FileConcentratorParams {
    taskStatusRecord: TaskStatus[];
    outputPath: string;
    deleteAfterWritten: boolean;
}

interface ConcentrationTask {
    filePath: string;
    index: number;
}

class FileConcentrator {
    taskStatusRecords: TaskStatus[];

    tasks: ConcentrationTask[] = [];

    outputFilename: string;

    outputFileExt: string;

    writeStream: fs.WriteStream;

    lastFinishIndex: number = -1;

    writeSequence: number = 0;

    isCheckingWritableFiles = false;

    deleteAfterWritten = false;

    constructor({ taskStatusRecord, outputPath, deleteAfterWritten }: FileConcentratorParams) {
        this.taskStatusRecords = taskStatusRecord;

        const ext = getFileExt(outputPath);
        this.outputFilename = outputPath.slice(0, -ext.length - 1);
        this.outputFileExt = ext;
        if (deleteAfterWritten) {
            this.deleteAfterWritten = true;
        }
        this.createNextWriteStream();
    }

    private async createNextWriteStream(): Promise<void> {
        return new Promise(async (resolve) => {
            const createWriteStream = () => {
                this.writeStream = fs.createWriteStream(
                    `${this.outputFilename}_${this.writeSequence}${this.outputFileExt ? `.${this.outputFileExt}` : ""}`
                );
            };
            if (this.writeStream) {
                this.writeStream.end(() => {
                    createWriteStream();
                    resolve();
                });
            } else {
                createWriteStream();
                resolve();
            }
        });
    }

    private waitStreamWritable(stream: fs.WriteStream): Promise<void> {
        return new Promise((resolve) => {
            stream.once("drain", resolve);
        });
    }

    private async checkWritableTasks() {
        if (this.isCheckingWritableFiles) {
            return;
        }
        this.isCheckingWritableFiles = true;
        const writableTasks: ConcentrationTask[] = [];
        for (let i = this.lastFinishIndex + 1; i <= this.tasks.length; i++) {
            if (!this.tasks[i] && this.taskStatusRecords[i] === TaskStatus.DROPPED) {
                // 文件未下载 但是任务已经被丢弃 忽略空缺 同时分割文件
                this.writeSequence++;
                await this.createNextWriteStream();
                continue;
            }
            if (!this.tasks[i]) {
                break;
            }
            writableTasks.push(this.tasks[i]);
        }
        if (writableTasks.length > 0) {
            await this.writeFiles(writableTasks);
            if (this.deleteAfterWritten) {
                for (const task of writableTasks) {
                    fs.unlinkSync(task.filePath);
                }
            }
        }
        this.isCheckingWritableFiles = false;
    }

    private writeFiles(tasks: ConcentrationTask[]): Promise<void> {
        this.lastFinishIndex = tasks[tasks.length - 1].index;
        return new Promise(async (resolve) => {
            let writable = true;
            let counter = 0;
            for (const task of tasks) {
                writable = this.writeStream.write(fs.readFileSync(task.filePath), () => {
                    counter++;
                    if (counter === tasks.length) {
                        resolve();
                    }
                });
                if (!writable) {
                    // handle back pressure
                    await this.waitStreamWritable(this.writeStream);
                }
            }
        });
    }

    public addTasks(tasks: ConcentrationTask[]) {
        for (const task of tasks) {
            this.tasks[task.index] = task;
        }
        this.checkWritableTasks();
    }

    /**
     * 注意：必须在所有任务添加后调用
     */
    public async waitAllFilesWritten() {
        while (this.isCheckingWritableFiles) {
            await sleep(200);
        }
        await this.checkWritableTasks();
    }

    public async closeWriteStream() {
        return new Promise((resolve) => {
            this.writeStream.end(resolve);
        });
    }

    public getOutputFilePaths(): string[] {
        const result = [];
        for (let i = 0; i <= this.writeSequence; i++) {
            result.push(`${this.outputFilename}_${i}${this.outputFileExt ? `.${this.outputFileExt}` : ""}`);
        }
        return result;
    }
}

export default FileConcentrator;
