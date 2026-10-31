// Debug overlay (?debug): frame timing, nose samples, bounds and occupied grid cells.
// Occupied cells live on a 1-pixel-per-cell canvas updated from 'trail' events,
// so the 228k-cell grid is only scanned once (when the overlay is switched on).
import { TUNING } from '../config';
import type { Grid } from '../sim/grid';
import type { SimEvent, World } from '../sim/types';
import { ctx2d, font, makeCanvas } from './glow';

const COLS = Math.ceil(TUNING.ARENA_W / TUNING.CELL);
const ROWS = Math.ceil(TUNING.ARENA_H / TUNING.CELL);
const WINDOW = 120;
const NOBODY = -2; // never a car id, so hitAt reports every owner (fresh trail included)

export class DebugLayer {
  enabled = false;
  private cells = makeCanvas(COLS, ROWS);
  private cg = ctx2d(this.cells);
  private intervals = new Float32Array(WINDOW);
  private costs = new Float32Array(WINDOW);
  private n = 0;

  clear(): void {
    this.cg.clearRect(0, 0, COLS, ROWS);
  }

  /** Full rebuild from the grid: only when the overlay is switched on or the world changes. */
  rebuild(grid: Grid, colors: string[]): void {
    this.clear();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) this.paintCell(grid, c, r, colors);
    }
  }

  /** Paints the 3x3 cells around each new trail point, reading their owner from the grid. */
  onTrail(e: Extract<SimEvent, { type: 'trail' }>, grid: Grid, colors: string[]): void {
    const cx = Math.floor(e.x1 / TUNING.CELL);
    const cy = Math.floor(e.y1 / TUNING.CELL);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) this.paintCell(grid, cx + dx, cy + dy, colors);
    }
  }

  private paintCell(grid: Grid, c: number, r: number, colors: string[]): void {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return;
    const o = grid.hitAt((c + 0.5) * TUNING.CELL, (r + 0.5) * TUNING.CELL, NOBODY, 0, 0);
    if (o < 0) return;
    this.cg.fillStyle = colors[o] ?? '#ffffff';
    this.cg.fillRect(c, r, 1, 1);
  }

  /** Frame interval and render cost, both in ms. */
  record(intervalMs: number, costMs: number): void {
    const i = this.n % WINDOW;
    this.intervals[i] = intervalMs;
    this.costs[i] = costMs;
    this.n++;
  }

  /** Arena-space layer. Call with the arena transform set. */
  drawArena(ctx: CanvasRenderingContext2D, w: World): void {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.cells, 0, 0, COLS * TUNING.CELL, ROWS * TUNING.CELL);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 1;
    const b = w.bounds;
    ctx.strokeStyle = '#ffe14d';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
    ctx.setLineDash([]);
    for (const c of w.cars) {
      if (!c.alive) continue;
      const m = Math.hypot(c.vx, c.vy) || 1;
      ctx.fillStyle = '#ffffff';
      for (const off of TUNING.NOSE_OFFSETS) {
        ctx.fillRect(c.x + (c.vx / m) * off - 0.75, c.y + (c.vy / m) * off - 0.75, 1.5, 1.5);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, TUNING.HEAD_ON_DIST, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,225,77,0.25)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, TUNING.GRAZE_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Screen-space stats panel (CSS px transform set). */
  drawStats(ctx: CanvasRenderingContext2D, w: World, particles: number): void {
    const k = Math.min(this.n, WINDOW);
    if (k === 0) return;
    let iSum = 0, iMax = 0, cSum = 0, cMax = 0;
    for (let i = 0; i < k; i++) {
      const a = this.intervals[i]!;
      const c = this.costs[i]!;
      iSum += a; cSum += c;
      if (a > iMax) iMax = a;
      if (c > cMax) cMax = c;
    }
    const iAvg = iSum / k;
    const lines = [
      `FPS ${(1000 / Math.max(0.001, iAvg)).toFixed(0)}`,
      `frame ${iAvg.toFixed(1)} avg / ${iMax.toFixed(1)} max ms`,
      `render ${(cSum / k).toFixed(2)} avg / ${cMax.toFixed(2)} max ms`,
      `tick ${w.tick}  t ${w.time.toFixed(1)}s  fx ${particles}`,
    ];
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(8, 52, 250, lines.length * 16 + 10);
    ctx.font = font(600, 12, 'ui-monospace, Menlo, monospace');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = iMax > 16.7 * 1.5 ? '#ff6b6b' : '#7dff6a';
    lines.forEach((l, i) => ctx.fillText(l, 14, 57 + i * 16));
    ctx.restore();
  }
}
