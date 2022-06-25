class PriorityQueue<T extends { priority: number }> {
    heap: T[] = [];

    get size() {
        return this.heap.length;
    }

    private getParentIndex(index: number): number {
        return Math.floor(index / 2);
    }

    private getLeftChildIndex(index: number): number {
        return index * 2;
    }

    private getRightChildIndex(index: number): number {
        return index * 2 + 1;
    }

    private swap(index1: number, index2: number): void {
        const temp = this.heap[index1];
        this.heap[index1] = this.heap[index2];
        this.heap[index2] = temp;
    }

    private shiftUp(index: number): void {
        while (index > 0 && this.heap[this.getParentIndex(index)].priority < this.heap[index].priority) {
            this.swap(index, this.getParentIndex(index));
            this.shiftUp(this.getParentIndex(index));
        }
    }

    private shiftDown(index: number): void {
        let targetIndex = index;
        const leftChildIndex = this.getLeftChildIndex(index);
        const rightChildIndex = this.getRightChildIndex(index);
        if (leftChildIndex <= this.size - 1 && this.heap[leftChildIndex].priority > this.heap[targetIndex].priority) {
            targetIndex = leftChildIndex;
        }
        if (rightChildIndex <= this.size - 1 && this.heap[rightChildIndex].priority > this.heap[targetIndex].priority) {
            targetIndex = rightChildIndex;
        }
        if (targetIndex !== index) {
            this.swap(targetIndex, index);
            this.shiftDown(targetIndex);
        }
    }

    public insert(item: T): void {
        this.heap.push(item);
        this.shiftUp(this.size - 1);
    }

    public insertMulti(items: T[]): void {
        for (const item of items) {
            this.insert(item);
        }
    }

    public getMaxPriorityItem(): T {
        const result = this.heap[0];
        this.heap[0] = this.heap[this.size - 1];
        this.heap.pop();
        this.shiftDown(0);
        return result;
    }
}

export default PriorityQueue;
