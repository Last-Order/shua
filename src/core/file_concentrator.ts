import * as fs from "fs";
import { TaskStatus } from "../types";
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

    outputPath: string;

    writeStream: fs.WriteStream;

    lastFinishIndex: number = -1;

    isCheckingWritableFiles = false;

    deleteAfterWritten = false;

    constructor({ taskStatusRecord, outputPath, deleteAfterWritten }: FileConcentratorParams) {
        this.taskStatusRecords = taskStatusRecord;
        this.outputPath = outputPath;
        this.writeStream = fs.createWriteStream(outputPath);
        if (deleteAfterWritten) {
            this.deleteAfterWritten = true;
        }
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
                // 文件未下载 但是任务已经被丢弃 忽略空缺
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

    public async waitAllFilesWritten() {
        if (this.isCheckingWritableFiles) {
            while (this.isCheckingWritableFiles) {
                await sleep(200);
            }
        }
        await this.checkWritableTasks();
    }

    public getOutputPath(): string {
        return this.outputPath;
    }
}

export default FileConcentrator;
