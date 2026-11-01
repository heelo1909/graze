// Draws a Match: stored trail layer, cars, walls, fx and HUD. Flat and minimal: no bloom.
// Driven only by Match state and SimEvents; never changes time or game state.
import { TUNING } from '../config';
import type { Match } from '../sim/match';
import type { Car, SimEvent, World } from '../sim/types';
import { darken, lighten } from './color';
import { DebugLayer } from './debug';
import { Fx } from './fx';
import { BODY_FONT, DISPLAY_FONT, ctx2d, makeCanvas } from './glow';
import { Hud, announce, soleLocal } from './hud';
import {
  HISTORY, buildBase, buildVignette, drawAfterimage, drawCar, drawWalls, wallHeat,
} from './scene';
import { HUD_BOTTOM, HUD_TOP, fitArena, type View } from './viewport';

const W = TUNING.ARENA_W;
const H = TUNING.ARENA_H;
/** Trail layer resolution relative to arena units. */
const TS = 2;
/** Trail passes (arena units): a faint edge the width of the collision zone (~6 units) and a solid core. */
const TRAIL_PASSES = [
  { width: 5.5, alpha: 0.18, light: 0 },
  { width: 2.4, alpha: 1, light: 0 },
] as const;
const HISTORY_EVERY_S = 1 / 40;
const FADE_S = 0.4;
const MAX_DT = 0.1;

export class Renderer {
  readonly fx = new Fx();
  readonly hud = new Hud();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly debug = new DebugLayer();
  private readonly trail = makeCanvas(W * TS, H * TS);
  private readonly tctx = ctx2d(this.trail);
  private readonly vignette = buildVignette();
  private base = makeCanvas(1, 1);
  private dpr = 1;
  private sw = 1;
  private sh = 1;
  private view: View = { scale: 1, ox: 0, oy: 0 };
  private world: World | null = null;
  private colors: string[] = [];
  private hist: Float32Array[] = [];
  private histN: number[] = [];
  private histHead: number[] = [];
  private histAcc = 0;
  private shake = 0;
  private lastReal = -1;
  private lastPhase = '';
  private lastPhaseTime = 0;
  private local: number[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = ctx2d(canvas);
    this.tctx.setTransform(TS, 0, 0, TS, 0, 0);
    this.tctx.lineJoin = 'round';
    addEventListener('resize', () => this.resize());
    this.resize();
    // Re-render cached glow text once the web fonts arrive (they load lazily).
    const fonts = document.fonts;
    if (fonts) {
      Promise.all([fonts.load(`800 40px ${DISPLAY_FONT}`), fonts.load(`600 13px ${BODY_FONT}`)])
        .then(() => this.hud.resetTextCache(), () => undefined);
    }
  }

  /** Car ids steered on this device: they get "YOU", banners and the big shake. */
  setLocal(local: number[]): void {
    this.local = [...local];
    this.hud.local = this.local;
  }

  /** Centred HUD message (online "Waiting for host…"); null clears it. */
  setNotice(text: string | null): void {
    this.hud.notice = text;
  }

  setDebug(on: boolean): void {
    this.debug.enabled = on;
    if (on && this.world) this.debug.rebuild(this.world.grid, this.colors);
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.sw = window.innerWidth;
    this.sh = window.innerHeight;
    this.canvas.width = Math.round(this.sw * this.dpr);
    this.canvas.height = Math.round(this.sh * this.dpr);
    this.canvas.style.width = `${this.sw}px`;
    this.canvas.style.height = `${this.sh}px`;
    this.view = fitArena(this.sw, this.sh, HUD_TOP, HUD_BOTTOM);
    this.base = buildBase(this.sw, this.sh, this.dpr, this.view);
    this.hud.dpr = this.dpr;
    this.hud.resetTextCache();
  }

  clearTrails(): void {
    this.tctx.clearRect(0, 0, W, H);
    this.debug.clear();
  }

  /** Resets per-round layers when the match moves to a new World. */
  private sync(m: Match): void {
    if (this.world === m.world) return;
    this.world = m.world;
    this.colors = m.slots.map((s) => s.color);
    this.clearTrails();
    this.fx.clear();
    const n = m.world.cars.length;
    this.hist = Array.from({ length: n }, () => new Float32Array(HISTORY * 3));
    this.histN = new Array<number>(n).fill(0);
    this.histHead = new Array<number>(n).fill(0);
    if (this.debug.enabled) this.debug.rebuild(m.world.grid, this.colors);
  }

  onEvents(events: SimEvent[], m: Match): void {
    this.sync(m);
    const w = m.world;
    // Batch each car's trail pieces into one path so each pass is a single stroke.
    let path: Path2D | null = null;
    let pathCar = -1;
    let px = NaN;
    let py = NaN;
    const flush = (): void => {
      if (path && pathCar >= 0) this.strokeTrail(path, this.colors[pathCar] ?? '#ffffff');
      path = null;
    };
    for (const e of events) {
      if (e.type === 'trail') {
        if (e.car !== pathCar) { flush(); pathCar = e.car; }
        if (!path) path = new Path2D();
        if (Math.abs(e.x0 - px) > 1e-3 || Math.abs(e.y0 - py) > 1e-3) path.moveTo(e.x0, e.y0);
        path.lineTo(e.x1, e.y1);
        px = e.x1;
        py = e.y1;
        if (this.debug.enabled) this.debug.onTrail(e, w.grid, this.colors);
      } else if (e.type === 'graze') {
        const color = e.source >= 0 ? (this.colors[e.source] ?? '#ffffff') : '#cfd8ff';
        this.fx.spray(e.x, e.y, lighten(color, 0.3), 2, 140, Math.random() * Math.PI * 2, Math.PI);
      } else if (e.type === 'crash') {
        this.crash(e, m);
      }
    }
    flush();
  }

  /** Opaque, pre-darkened passes combined with 'lighten' (per-channel max): the layer is
   *  added onto a near-black floor, so this looks like alpha blending, but the seams between
   *  per-tick batches and crossings of the same colour never double up into bright ticks. */
  private strokeTrail(path: Path2D, color: string): void {
    const g = this.tctx;
    g.globalCompositeOperation = 'lighten';
    g.lineCap = 'round';
    for (const p of TRAIL_PASSES) {
      g.strokeStyle = darken(color, p.alpha);
      g.lineWidth = p.width;
      g.stroke(path);
    }
    g.globalCompositeOperation = 'source-over';
  }

  private crash(e: Extract<SimEvent, { type: 'crash' }>, m: Match): void {
    const color = this.colors[e.car] ?? '#ffffff';
    this.fx.shards(e.x, e.y, color);
    this.fx.burst(e.x, e.y, color, 14, 260);
    this.fx.ring(e.x, e.y, 70, color, 0.45);
    if (e.cause === 'trail' && e.by !== null) this.fx.tether(e.x, e.y, e.by, 1.6);

    const a = announce(e, m, this.local);
    const mine = this.local.includes(e.car) || (e.by !== null && this.local.includes(e.by));
    this.shake = Math.max(this.shake, mine ? 14 : 5);
    if (a?.kind === 'banner') this.hud.banner(a.big, a.small, a.color);
    else if (a?.kind === 'feed') this.hud.feed(a.parts);
  }

  /** `cars` are the poses to draw (interpolated by main.ts); defaults to the live sim cars. */
  draw(m: Match, realTime: number, cars: Car[] = m.world.cars): void {
    const t0 = performance.now();
    this.sync(m);
    const w = m.world;
    const realDt = this.lastReal < 0 ? 0 : Math.min(MAX_DT, Math.max(0, realTime - this.lastReal));
    const interval = this.lastReal < 0 ? 0 : (realTime - this.lastReal) * 1000;
    this.lastReal = realTime;
    // Effects follow sim time (so they slow down with main.ts's slow motion); fall back
    // to real time when the phase changed or the sim is idle at match end.
    let simDt = realDt;
    if (m.phase === this.lastPhase && m.phase !== 'matchEnd') simDt = Math.min(MAX_DT, Math.max(0, m.phaseTime - this.lastPhaseTime));
    this.lastPhase = m.phase;
    this.lastPhaseTime = m.phaseTime;
    this.fx.update(simDt);
    this.hud.update(realDt);
    this.shake *= Math.exp(-realDt * 9);
    if (this.shake < 0.2) this.shake = 0;
    this.updateCarFx(m, simDt);

    const { ctx, dpr, view: v } = this;
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // Clear first: with a shake offset, base no longer covers the canvas edges.
    ctx.fillStyle = '#04050a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.base, sx * dpr, sy * dpr);
    const k = dpr * v.scale;
    const tx = (v.ox + sx) * dpr;
    const ty = (v.oy + sy) * dpr;
    ctx.setTransform(k, 0, 0, k, tx, ty);

    const heat = wallHeat(w, realTime);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.trail, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    drawWalls(ctx, w, heat);
    for (const c of cars) {
      if (c.alive) drawAfterimage(ctx, c, this.hist[c.id]!, this.histN[c.id]!, this.histHead[c.id]!);
    }
    this.fx.draw(ctx, cars);
    const me = soleLocal(this.local);
    for (const c of cars) {
      if (c.alive) drawCar(ctx, c, c.id === me ? 'YOU' : c.name, m.phase === 'countdown');
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.vignette, 0, 0, this.canvas.width, this.canvas.height);

    const fade = this.fadeAlpha(m);
    if (fade > 0) {
      ctx.fillStyle = `rgba(4,5,10,${fade.toFixed(3)})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    if (this.debug.enabled) {
      ctx.setTransform(k, 0, 0, k, tx, ty);
      this.debug.drawArena(ctx, w, cars);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.hud.draw(ctx, m, v);
    if (this.debug.enabled) {
      this.debug.drawStats(ctx, w, this.fx.count);
      this.debug.record(interval, performance.now() - t0);
    }
  }

  /** Afterimage samples and drift sparks (visual only, derived from car state). */
  private updateCarFx(m: Match, dt: number): void {
    if (m.phase !== 'play' || dt <= 0) return;
    this.histAcc += dt;
    const sample = this.histAcc >= HISTORY_EVERY_S;
    if (sample) this.histAcc = 0;
    for (const c of m.world.cars) {
      if (!c.alive) continue;
      if (sample) {
        const h = this.hist[c.id]!;
        const i = this.histHead[c.id]! * 3;
        h[i] = c.x; h[i + 1] = c.y; h[i + 2] = c.heading;
        this.histHead[c.id] = (this.histHead[c.id]! + 1) % HISTORY;
        this.histN[c.id] = Math.min(HISTORY, this.histN[c.id]! + 1);
      }
      // slide: body points one way, car moves another → sparks off the back
      let slip = c.heading - Math.atan2(c.vy, c.vx);
      slip = Math.atan2(Math.sin(slip), Math.cos(slip));
      const s = Math.abs(slip);
      if (s > 0.3 && Math.random() < s * dt * 40) {
        const bx = c.x - Math.cos(c.heading) * 6;
        const by = c.y - Math.sin(c.heading) * 6;
        this.fx.spray(bx, by, lighten(c.color, 0.4), 2, 110, c.heading + Math.PI, 0.6);
      }
    }
  }

  /** Dark fade out at the end of roundEnd and back in at the start of the countdown. */
  private fadeAlpha(m: Match): number {
    if (m.phase === 'roundEnd') return 0.85 * Math.max(0, 1 - (TUNING.ROUND_END_PAUSE_S - m.phaseTime) / FADE_S);
    if (m.phase === 'countdown' && m.round > 1) return 0.85 * Math.max(0, 1 - m.phaseTime / FADE_S);
    return 0;
  }
}
