export class PriorityHeap {
  private heap: string[] = []
  private pos: Map<string, number> = new Map()
  private readonly getPriority: (id: string) => number

  constructor(getPriority: (id: string) => number) {
    this.getPriority = getPriority
  }

  private swap(i: number, j: number): void {
    const ai = this.heap[i]
    const aj = this.heap[j]
    this.heap[i] = aj
    this.heap[j] = ai
    this.pos.set(this.heap[i], i)
    this.pos.set(this.heap[j], j)
  }

  private heapifyUp(i: number): void {
    let k = i
    while (k > 0) {
      const p = (k - 1) >> 1
      if (this.getPriority(this.heap[p]) >= this.getPriority(this.heap[k]))
        break
      this.swap(k, p)
      k = p
    }
  }

  private heapifyDown(i: number): void {
    let k = i
    const n = this.heap.length
    while (true) {
      const l = k * 2 + 1
      const r = k * 2 + 2
      let m = k
      if (l < n && this.getPriority(this.heap[l]) > this.getPriority(this.heap[m]))
        m = l
      if (r < n && this.getPriority(this.heap[r]) > this.getPriority(this.heap[m]))
        m = r
      if (m === k)
        break
      this.swap(k, m)
      k = m
    }
  }

  insert(id: string): void {
    this.heap.push(id)
    this.pos.set(id, this.heap.length - 1)
    this.heapifyUp(this.heap.length - 1)
  }

  remove(id: string): void {
    const index = this.pos.get(id)
    if (index === undefined)
      return
    const lastIndex = this.heap.length - 1
    if (index === lastIndex) {
      this.heap.pop()
      this.pos.delete(id)
      return
    }
    this.swap(index, lastIndex)
    this.heap.pop()
    this.pos.delete(id)
    if (index < this.heap.length) {
      this.heapifyDown(index)
      this.heapifyUp(index)
    }
  }

  update(id: string): void {
    const index = this.pos.get(id)
    if (index === undefined)
      return
    this.heapifyDown(index)
    this.heapifyUp(index)
  }

  orderedSnapshot(): string[] {
    const temp = [...this.heap]
    const result: string[] = []
    const getP = (id: string): number => this.getPriority(id)
    const swapLocal = (i: number, j: number): void => {
      const ai = temp[i]
      const aj = temp[j]
      temp[i] = aj
      temp[j] = ai
    }
    const heapifyDownLocal = (i: number): void => {
      let k = i
      const n = temp.length
      while (true) {
        const l = k * 2 + 1
        const r = k * 2 + 2
        let m = k
        if (l < n && getP(temp[l]) > getP(temp[m]))
          m = l
        if (r < n && getP(temp[r]) > getP(temp[m]))
          m = r
        if (m === k)
          break
        swapLocal(k, m)
        k = m
      }
    }
    while (temp.length > 0) {
      const top = temp[0]
      result.push(top)
      const last = temp.pop()
      if (temp.length > 0 && last !== undefined) {
        temp[0] = last
        heapifyDownLocal(0)
      }
    }
    return result
  }
}
