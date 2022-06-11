import * as crypto from "crypto";
import { EventEmitter } from "events";

interface SchedulerOptions {
    threads: number;
}

interface Task<T> {
    handler: (payload: T) => Promise<any>;
    payload?: T;
}

export interface SchedulerTask<T = Record<string, unknown>> extends Task<T> {
    priority: number;
    retry: number;
    uuid: string;
}

export interface TaskFinishEvent<T> {
    task: SchedulerTask<T>;
    finishCount: number;
    totalCount: number;
    dropCount: number;
}

export interface TaskErrorEvent<T, E = Error> {
    task: SchedulerTask<T>;
    error: E;
    decision: TaskFailDecision;
}

enum TaskFailDecision {
    RETRY,
    DROP,
    INCREASE_PRIORITY,
}

class TaskScheduler<T> extends EventEmitter {
    private tasks: SchedulerTask<T>[] = [];

    private nowRunningThreadsCount = 0;

    private threads: number;

    private isFinished = false;

    private finishCount = 0;

    private dropCount = 0;

    private taskErrorHandler: (err: Error, task: Task<T>) => TaskFailDecision = () => TaskFailDecision.RETRY;

    constructor(options: SchedulerOptions) {
        super();
        this.threads = options.threads;
    }

    get isQueueEmpty(): boolean {
        return this.tasks.length === 0;
    }

    get totalCount(): number {
        return this.tasks.length;
    }

    private async checkQueue(): Promise<void> {
        if (this.isFinished) {
            return;
        }
        const currentTask = this.getNextTask();
        if (!currentTask) {
            if (this.nowRunningThreadsCount === 0) {
                this.isFinished = true;
                this.emit("finish");
            } else {
                setTimeout(() => {
                    this.checkQueue();
                }, 200);
            }
        } else {
            this.nowRunningThreadsCount++;
            this.runTask(currentTask)
                .then(() => {
                    this.nowRunningThreadsCount--;
                    this.finishCount++;
                    this.emit("task-finish", {
                        task: currentTask,
                        finishCount: this.finishCount,
                        dropCount: this.dropCount,
                        totalCount: this.totalCount,
                    } as TaskFinishEvent<T>);
                })
                .catch((e) => {
                    if (e instanceof Error) {
                        const decision = this.taskErrorHandler(e, currentTask);
                        this.emit("task-error", { task: currentTask, error: e, decision } as TaskErrorEvent<T>);
                        switch (decision) {
                            case TaskFailDecision.DROP: {
                                this.dropCount++;
                                break;
                            }
                            case TaskFailDecision.INCREASE_PRIORITY: {
                                currentTask.priority++;
                                currentTask.retry++;
                                this.addTasks(currentTask);
                                break;
                            }
                            default: {
                                currentTask.retry++;
                                this.addTasks(currentTask);
                            }
                        }
                    }
                })
                .finally(() => {
                    this.checkQueue();
                });
            this.checkQueue();
        }
    }

    private getNextTask(): SchedulerTask<T> | undefined {
        if (this.isFinished) {
            return;
        }
        if (this.nowRunningThreadsCount > this.threads) {
            return;
        }
        if (this.tasks.length === 0) {
            return;
        }
        return this.tasks.shift();
    }

    private async runTask(task: Task<T>): Promise<void> {
        return await task.handler(task.payload as T);
    }

    public addTasks(tasks: Task<T> | Task<T>[]): void {
        if (Array.isArray(tasks)) {
            this.tasks.push(...tasks.map((task) => ({ ...task, uuid: crypto.randomUUID(), retry: 0, priority: 1 })));
        } else {
            this.tasks.push({ ...tasks, uuid: crypto.randomUUID(), retry: 0, priority: 1 });
        }
    }

    public start() {
        this.checkQueue();
    }

    public waitAllFinished(): Promise<void> {
        if (this.nowRunningThreadsCount === 0 && this.tasks.length == 0) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            this.once("finished", resolve);
        });
    }
}

export default TaskScheduler;
