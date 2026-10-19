/**
 * Fixed-capacity ring buffer for the response curve.
 *
 * The physics never reads from this buffer - it only exists so the UI can draw
 * the last N seconds of the same state stream that drives the animation.
 */

export const DEFAULT_HISTORY_CAPACITY = 6000; // 60 s at 100 Hz

export class HistoryBuffer {
  readonly capacity: number;
  private readonly bufferT: Float64Array;
  private readonly bufferY: Float64Array;
  private readonly bufferR: Float64Array;
  private readonly bufferU: Float64Array;
  private head = 0;
  private length = 0;
  /** Bumped on every push so React can detect changes cheaply. */
  version = 0;

  constructor(capacity = DEFAULT_HISTORY_CAPACITY) {
    this.capacity = capacity;
    this.bufferT = new Float64Array(capacity);
    this.bufferY = new Float64Array(capacity);
    this.bufferR = new Float64Array(capacity);
    this.bufferU = new Float64Array(capacity);
  }

  get size(): number {
    return this.length;
  }

  clear(): void {
    this.head = 0;
    this.length = 0;
    this.version += 1;
  }

  push(t: number, y: number, r: number, u: number): void {
    this.bufferT[this.head] = t;
    this.bufferY[this.head] = y;
    this.bufferR[this.head] = r;
    this.bufferU[this.head] = u;
    this.head = (this.head + 1) % this.capacity;
    if (this.length < this.capacity) this.length += 1;
    this.version += 1;
  }

  private physicalIndex(i: number): number {
    const start = (this.head - this.length + this.capacity) % this.capacity;
    return (start + i) % this.capacity;
  }

  /** Read in chronological order. */
  at(i: number): { t: number; y: number; r: number; u: number } {
    const idx = this.physicalIndex(i);
    return {
      t: this.bufferT[idx],
      y: this.bufferY[idx],
      r: this.bufferR[idx],
      u: this.bufferU[idx]
    };
  }

  toArray(): Array<{ t: number; y: number; r: number; u: number }> {
    const out: Array<{ t: number; y: number; r: number; u: number }> = new Array(this.length);
    for (let i = 0; i < this.length; i += 1) out[i] = this.at(i);
    return out;
  }

  /** First index whose timestamp is >= t (binary search over chronological data). */
  indexAtOrAfter(t: number): number {
    let lo = 0;
    let hi = this.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.at(mid).t < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  last(): { t: number; y: number; r: number; u: number } | null {
    if (this.length === 0) return null;
    return this.at(this.length - 1);
  }
}
