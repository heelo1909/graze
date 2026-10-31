// Static and per-frame arena drawing: the background layer, the walls (with the
// shrink warning), and the cars (body, glow, afterimage, boost streaks, labels).
import { TUNING } from '../config';
import { shrinkWarning } from '../sim/arena';
import type { Car, World } from '../sim/types';
import { hexA } from './color';
import { BODY_FONT, ctx2d, font, makeCanvas } from './glow';
import type { View } from './viewport';

const W = TUNING.ARENA_W;
const H = TUNING.ARENA_H;
const BG = '#04050a';
const WARN = '#ff3d6e';
/** Car outline in arena units: 16 long, 8 wide (narrower than 2 x HEAD_ON_DIST + margin). */
const BODY: ReadonlyArray<readonly [number, number]> = [[9, 0], [-7, 4], [-4, 0], [-7, -4]];
export const HISTORY = 8;

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Screen background + arena floor + faint grid + original-arena outline, in device px. */
export function buildBase(sw: number, sh: number, dpr: number, v: View): HTMLCanvasElement {
  const c = makeCanvas(sw * dpr, sh * dpr);
  const g = ctx2d(c);
  g.fillStyle = BG;
  g.fillRect(0, 0, c.width, c.height);
  g.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, v.ox * dpr, v.oy * dpr);
  roundRect(g, 0, 0, W, H, 14);
  g.fillStyle = '#080a12';
  g.fill();
  g.strokeStyle = 'rgba(120,140,200,0.05)';
  g.lineWidth = 1 / v.scale;
  g.beginPath();
  for (let x = 40; x < W; x += 40) { g.moveTo(x, 0); g.lineTo(x, H); }
  for (let y = 40; y < H; y += 40) { g.moveTo(0, y); g.lineTo(W, y); }
  g.stroke();
  roundRect(g, 0, 0, W, H, 14);
  g.strokeStyle = 'rgba(140,170,255,0.16)';
  g.lineWidth = 2;
  g.stroke();
  return c;
}

/** Small radial vignette, drawn stretched over the whole screen on top of the scene. */
export function buildVignette(): HTMLCanvasElement {
  const c = makeCanvas(256, 256);
  const g = ctx2d(c);
  const gr = g.createRadialGradient(128, 128, 50, 128, 128, 182);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  return c;
}

/** 0..1 glow strength of the wall: pulses during the warning, steady while shrinking. */
export function wallHeat(w: World, t: number): number {
  const warn = shrinkWarning(w.time);
  if (warn <= 0) return 0;
  if (w.time < TUNING.SHRINK_START_S) return warn * (0.55 + 0.45 * Math.sin(t * 14));
  return 0.65 + 0.12 * Math.sin(t * 5);
}

/** Dims everything outside the live bounds and draws the wall. Arena transform set. */
export function drawWalls(ctx: CanvasRenderingContext2D, w: World, heat: number): void {
  const b = w.bounds;
  const bw = b.right - b.left;
  const bh = b.bottom - b.top;
  if (bw < W - 0.5) {
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.rect(b.left, b.top, bw, bh);
    ctx.fillStyle = 'rgba(4,5,10,0.45)';
    ctx.fill('evenodd');
  }
  if (heat > 0) {
    ctx.strokeStyle = hexA(WARN, 0.3 * heat);
    ctx.lineWidth = 4;
    ctx.strokeRect(b.left, b.top, bw, bh);
  }
  ctx.strokeStyle = heat > 0 ? hexA('#ffc2d1', 0.4 + 0.6 * heat) : 'rgba(150,180,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(b.left, b.top, bw, bh);
}

function bodyPath(ctx: CanvasRenderingContext2D, x: number, y: number, h: number): void {
  const cs = Math.cos(h);
  const sn = Math.sin(h);
  ctx.beginPath();
  for (let i = 0; i < BODY.length; i++) {
    const [px, py] = BODY[i]!;
    const X = x + px * cs - py * sn;
    const Y = y + px * sn + py * cs;
    if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
  }
  ctx.closePath();
}

/** Fading afterimage from the car's recent positions (x, y, heading triplets, oldest first). */
export function drawAfterimage(ctx: CanvasRenderingContext2D, c: Car, hist: Float32Array, n: number, head: number): void {
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = c.color;
  ctx.lineWidth = 1;
  for (let k = 0; k < n; k++) {
    const i = ((head - n + k + HISTORY) % HISTORY) * 3;
    ctx.globalAlpha = 0.12 * ((k + 1) / (n + 1));
    bodyPath(ctx, hist[i]!, hist[i + 1]!, hist[i + 2]!);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

export function drawCar(ctx: CanvasRenderingContext2D, c: Car, label: string, countdown: boolean): void {
  if (countdown) {
    ctx.strokeStyle = hexA(c.color, 0.35);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + Math.cos(c.heading) * 70, c.y + Math.sin(c.heading) * 70);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (c.boost > 0.25) {
    const m = Math.hypot(c.vx, c.vy) || 1;
    const dx = c.vx / m;
    const dy = c.vy / m;
    const len = 12 + 30 * c.boost;
    ctx.strokeStyle = hexA(c.color, c.boost * 0.55);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const off of [-3.5, 3.5]) {
      ctx.moveTo(c.x - dx * 10 - dy * off, c.y - dy * 10 + dx * off);
      ctx.lineTo(c.x - dx * len - dy * off, c.y - dy * len + dx * off);
    }
    ctx.stroke();
  }
  bodyPath(ctx, c.x, c.y, c.heading);
  ctx.fillStyle = c.color;
  ctx.fill();
  ctx.strokeStyle = c.color;
  ctx.lineWidth = 1.2;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.font = font(700, 10, BODY_FONT);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = hexA(c.color, 0.7);
  ctx.fillText(label, c.x, c.y - 17);
}
