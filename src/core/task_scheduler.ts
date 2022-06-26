import * as crypto from "crypto";
import { EventEmitter } from "events";
import PriorityQueue from "../utils/priority_queue";

interface SchedulerOptions<T> {
    threads: number;
    autoStop?: boolean;
    taskErrorHandler?: (err: Error, task: SchedulerTask<T>) => TaskFailDecision;
}

interface Task<T> {
    handler: (payload: T) => Promise<any>;
    payload?: T;
}

export interface SchedulerTask<T = Record<string, unknown>> extends Task<T> {
    priority: number;
    retryCount: number;
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

/** 任务失败决策 */
export enum TaskFailDecision {
    /** 重试 */
    RETRY,
    /** 放弃 */
    DROP,
    /** 提升优先级并重试 */
    INCREASE_PRIORITY,
}

class TaskScheduler<T> extends EventEmitter {
    private queue: PriorityQueue<SchedulerTask<T>>;

    private nowRunningThreadsCount = 0;

    private threads: number;

    private isFinished = false;

    private finishCount = 0;

    private dropCount = 0;

    private totalCount = 0;

    private taskErrorHandler: (err: Error, task: SchedulerTask<T>) => TaskFailDecision = () => TaskFailDecision.RETRY;

    constructor(options: SchedulerOptions<T>) {
        super();
        this.threads = options.threads;
        this.queue = new PriorityQueue<SchedulerTask<T>>();

        if (options.taskErrorHandler) {
            this.taskErrorHandler = options.taskErrorHandler;
        }
    }

    get isQueueEmpty(): boolean {
        return this.queue.size === 0;
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
                                this.emit("task-drop", {
                                    task: currentTask,
                                    finishCount: this.finishCount,
                                    dropCount: this.dropCount,
                                    totalCount: this.totalCount,
                                });
                                break;
                            }
                            case TaskFailDecision.INCREASE_PRIORITY: {
                                currentTask.priority++;
                                currentTask.retryCount++;
                                this.addTasks(currentTask);
                                break;
                            }
                            default: {
                                currentTask.retryCount++;
                                this.addTasks(currentTask);
                            }
                        }
                    }
                })
                .finally(() => {
                    this.nowRunningThreadsCount--;
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
        if (this.isQueueEmpty) {
            return;
        }
        return this.queue.getMaxPriorityItem();
    }

    private async runTask(task: Task<T>): Promise<void> {
        return await task.handler(task.payload as T);
    }

    public addTasks(tasks: Task<T> | Task<T>[]): void {
        if (Array.isArray(tasks)) {
            this.queue.insertMulti(
                tasks.map((task) => ({ uuid: crypto.randomUUID(), retryCount: 0, priority: 1, ...task }))
            );
            this.totalCount += tasks.length;
        } else {
            this.queue.insert({ uuid: crypto.randomUUID(), retryCount: 0, priority: 1, ...tasks });
            this.totalCount += 1;
        }
    }

    public start() {
        this.checkQueue();
    }

    public waitAllFinished(): Promise<void> {
        if (this.nowRunningThreadsCount === 0 && this.isQueueEmpty) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            this.once("finished", resolve);
        });
    }
}

export default TaskScheduler;
