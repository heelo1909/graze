// Spatial trail occupancy. Each cell records which car laid it (owner, -1 = empty)
// and when (seconds). Stamping only fills empty cells, so the first trail to claim
// a cell keeps it; crossing your own older trail is therefore deadly.
export class Grid {
  private readonly cell: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly owner: Int8Array;
  private readonly time: Float32Array;

  constructor(w: number, h: number, cell: number) {
    this.cell = cell;
    this.cols = Math.ceil(w / cell);
    this.rows = Math.ceil(h / cell);
    this.owner = new Int8Array(this.cols * this.rows);
    this.time = new Float32Array(this.cols * this.rows);
    this.clear();
  }

  clear(): void {
    this.owner.fill(-1);
    this.time.fill(0);
  }

  // Marks the 3x3 block of cells around (x, y). Occupied cells are left untouched.
  stamp(x: number, y: number, owner: number, time: number): void {
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const col = cx + dx;
        const row = cy + dy;
        if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) continue;
        const i = row * this.cols + col;
        if (this.owner[i] !== -1) continue;
        this.owner[i] = owner;
        this.time[i] = time;
      }
    }
  }

  // Returns the owner of the cell at (x, y), or -1 if the cell is empty, out of range,
  // or is the caller's own trail laid less than freshS seconds ago.
  hitAt(x: number, y: number, self: number, now: number, freshS: number): number {
    const col = Math.floor(x / this.cell);
    const row = Math.floor(y / this.cell);
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return -1;
    const i = row * this.cols + col;
    const o = this.owner[i] ?? -1;
    if (o === -1) return -1;
    if (o === self && now - (this.time[i] ?? 0) < freshS) return -1;
    return o;
  }
}
