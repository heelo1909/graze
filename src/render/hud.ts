// Screen-space HUD: scores, round, boost, crash feed, controls hint, banners,
// countdown and the round-end / match-end panels. Drawn in CSS pixels.
import { TUNING } from '../config';
import { targetPoints } from '../sim/scoring';
import type { Match } from '../sim/match';
import type { SimEvent } from '../sim/types';
import { hintText } from '../players';
import { BODY_FONT, DISPLAY_FONT, font, glowText, type TextLine } from './glow';
import type { View } from './viewport';

interface Banner { img: HTMLCanvasElement; w: number; h: number; t: number; T: number }
interface FeedLine { parts: { text: string; color: string }[]; t: number }
interface TextImg { canvas: HTMLCanvasElement; w: number; h: number }

const BANNER_S = 2;
const FEED_S = 3.5;
const FEED_MAX = 4;

/** The one car steered on this device, or -1 when there are none or several
 *  (then nobody is "YOU" and every crash goes to the feed). */
export function soleLocal(local: number[]): number {
  return local.length === 1 ? local[0]! : -1;
}

type FeedPart = { text: string; color: string };
export type Announcement =
  | { kind: 'banner'; big: string; small: string; color: string }
  | { kind: 'feed'; parts: FeedPart[] };

const DIM = 'rgba(255,255,255,0.5)';

/** What a crash shows (spec 4.7): a banner when the sole local player is involved, else a feed line.
 *  Returns null for the rival's half of a head-on with that player (their own banner covers it). */
export function announce(e: Extract<SimEvent, { type: 'crash' }>, m: Match, local: number[]): Announcement | null {
  const me = soleLocal(local);
  const name = (id: number | null): string => (id === null ? '?' : (m.slots[id]?.name ?? '?'));
  const color = (id: number | null): string => (id === null ? '#ffffff' : (m.slots[id]?.color ?? '#ffffff'));
  const cut = e.cause === 'trail' && e.by !== null;
  if (me < 0 || (e.car !== me && e.by !== me)) {
    return {
      kind: 'feed',
      parts: cut
        ? [{ text: name(e.by), color: color(e.by) }, { text: ' cut off ', color: DIM }, { text: name(e.car), color: color(e.car) }]
        : [{ text: name(e.car), color: color(e.car) }, { text: ' crashed', color: DIM }],
    };
  }
  const banner = (big: string, small: string, c: string): Announcement => ({ kind: 'banner', big, small, color: c });
  if (e.car !== me) return cut ? banner(`YOU CUT OFF ${name(e.car).toUpperCase()}`, 'they hit your line', color(me)) : null;
  switch (e.cause) {
    case 'trail': return banner(`CUT OFF BY ${name(e.by).toUpperCase()}`, 'you hit their line', color(e.by));
    case 'own': return banner('YOUR OWN TRAIL', 'happens to everyone', '#ffffff');
    case 'wall': return banner('INTO THE WALL', 'too much drift', '#ffffff');
    case 'head': return banner(`HEAD-ON WITH ${name(e.by).toUpperCase()}`, 'nobody wins that one', '#ffffff');
  }
}

export class Hud {
  /** Device pixel ratio used for pre-rendered text. The renderer keeps it current. */
  dpr = 1;
  /** Car ids steered on this device. The renderer keeps it current. */
  local: number[] = [];
  /** Centred status text (e.g. "Waiting for host…"); null hides it. */
  notice: string | null = null;
  private bannerNow: Banner | null = null;
  private lines: FeedLine[] = [];
  private textCache = new Map<string, TextImg>();

  clear(): void {
    this.bannerNow = null;
    this.lines.length = 0;
  }

  /** Pre-renders the glowing banner once; the frame loop only blits it. */
  banner(big: string, small: string, color: string): void {
    const img = glowText([
      { text: big, font: font(800, 42, DISPLAY_FONT), color, dy: 0, glow: true },
      { text: small, font: font(500, 17, BODY_FONT), color: 'rgba(255,255,255,0.75)', dy: 42, glow: false },
    ], this.dpr);
    this.bannerNow = { img: img.canvas, w: img.w, h: img.h, t: BANNER_S, T: BANNER_S };
  }

  feed(parts: FeedPart[]): void {
    this.lines.unshift({ parts, t: FEED_S });
    if (this.lines.length > FEED_MAX) this.lines.length = FEED_MAX;
  }

  update(dt: number): void {
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i]!;
      l.t -= dt;
      if (l.t <= 0) this.lines.splice(i, 1);
    }
    if (this.bannerNow) {
      this.bannerNow.t -= dt;
      if (this.bannerNow.t <= 0) this.bannerNow = null;
    }
  }

  /** Forgets cached text images (call after fonts load or the DPR changes). */
  resetTextCache(): void { this.textCache.clear(); }

  draw(ctx: CanvasRenderingContext2D, m: Match, v: View): void {
    const sw = ctx.canvas.width / this.dpr;
    const sh = ctx.canvas.height / this.dpr;
    const cx = sw / 2;
    const aw = TUNING.ARENA_W * v.scale;
    const ah = TUNING.ARENA_H * v.scale;
    const me = soleLocal(this.local);
    ctx.textBaseline = 'middle';

    // top bar: names + points (with a progress line toward the target), round, boost
    const target = targetPoints(m.slots.length);
    let x = v.ox;
    ctx.textAlign = 'left';
    for (let i = 0; i < m.slots.length; i++) {
      const s = m.slots[i]!;
      const car = m.world.cars[i];
      ctx.globalAlpha = car && !car.alive && m.phase === 'play' ? 0.35 : 1;
      const label = i === me ? 'YOU' : s.name.toUpperCase();
      ctx.font = font(700, 12, DISPLAY_FONT);
      ctx.fillStyle = s.color;
      ctx.fillText(label, x, 24);
      const lw = ctx.measureText(label).width;
      ctx.font = font(800, 15, BODY_FONT);
      ctx.fillStyle = '#ffffff';
      const total = m.totals[i] ?? 0;
      const pts = String(total);
      ctx.fillText(pts, x + lw + 8, 24);
      const blockW = Math.max(64, lw + 8 + ctx.measureText(pts).width);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(x, 36, blockW, 3);
      ctx.fillStyle = s.color;
      ctx.fillRect(x, 36, blockW * Math.min(1, total / target), 3);
      x += blockW + 22;
    }
    ctx.globalAlpha = 1;

    const you = me >= 0 ? m.world.cars[me] : undefined;
    const rx = v.ox + aw;
    // round label: centred when there's room, otherwise tucked under the boost bar
    const roomy = x - 22 < cx - 70;
    ctx.textAlign = roomy ? 'center' : 'right';
    ctx.font = font(600, 13, DISPLAY_FONT);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(roomy ? `ROUND ${m.round}` : `ROUND ${m.round} · first to ${target}`, roomy ? cx : rx, roomy ? 24 : 46);
    if (roomy) {
      ctx.font = font(500, 11, BODY_FONT);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText(`first to ${target}`, cx, 40);
    }

    if (you) {
      const bw = 110;
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(rx - bw, 26, bw, 6);
      ctx.fillStyle = you.boost > 0.05 ? you.color : 'rgba(255,255,255,0.2)';
      ctx.fillRect(rx - bw, 26, bw * you.boost, 6);
      ctx.textAlign = 'right';
      ctx.font = font(600, 11, DISPLAY_FONT);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('BOOST', rx - bw - 10, 29);
    }

    // crash feed, right-aligned inside the arena's top-right corner
    ctx.font = font(600, 13, BODY_FONT);
    ctx.textAlign = 'right';
    for (let i = 0; i < this.lines.length; i++) {
      const l = this.lines[i]!;
      ctx.globalAlpha = Math.min(1, l.t);
      let xr = rx - 14;
      const y = v.oy + 22 + i * 20;
      for (let k = l.parts.length - 1; k >= 0; k--) {
        const p = l.parts[k]!;
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, xr, y);
        xr -= ctx.measureText(p.text).width;
      }
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.font = font(500, 12, BODY_FONT);
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.fillText(hintText(this.local.length >= 2 ? 2 : 1), cx, sh - 16);

    const my = v.oy + ah / 2;
    // the round-end / match-end titles take over the same space
    if (m.phase === 'roundEnd' || m.phase === 'matchEnd') this.bannerNow = null;
    if (this.bannerNow) {
      const b = this.bannerNow;
      const age = b.T - b.t;
      const pop = age < 0.15 ? 1.35 - (age / 0.15) * 0.35 : 1;
      ctx.globalAlpha = Math.max(0, Math.min(1, b.t * 2, age * 6));
      blit(ctx, b.img, b.w, b.h, cx, v.oy + ah * 0.28, pop * Math.min(1, (aw * 0.96) / b.w));
      ctx.globalAlpha = 1;
    }

    if (m.phase === 'countdown') {
      const left = TUNING.COUNTDOWN_S - m.phaseTime;
      const n = Math.max(1, Math.min(3, Math.ceil(left)));
      const f = 1 - (left - Math.floor(left));
      ctx.globalAlpha = Math.max(0, 1 - f);
      this.glow(ctx, `n${n}`, [{ text: String(n), font: font(800, 110, DISPLAY_FONT), color: '#ffffff', dy: 0, glow: true }], cx, my, 1 + f * 0.35);
      ctx.globalAlpha = 1;
    } else if (m.phase === 'play' && m.phaseTime < 0.6) {
      ctx.globalAlpha = 1 - m.phaseTime / 0.6;
      this.glow(ctx, 'go', [{ text: 'GO', font: font(800, 96, DISPLAY_FONT), color: '#ffffff', dy: 0, glow: true }], cx, my, 1 + m.phaseTime * 0.6);
      ctx.globalAlpha = 1;
    } else if (m.phase === 'roundEnd') {
      this.drawRoundEnd(ctx, m, cx, my, me);
    } else if (m.phase === 'matchEnd') {
      this.drawMatchEnd(ctx, m, sw, sh);
    }
    if (this.notice) {
      ctx.textAlign = 'center';
      ctx.font = font(700, 22, DISPLAY_FONT);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(this.notice, cx, my);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  private drawRoundEnd(ctx: CanvasRenderingContext2D, m: Match, cx: number, my: number, me: number): void {
    const w = m.world.winner;
    const a = Math.min(1, m.phaseTime * 4);
    ctx.globalAlpha = a;
    const ws = w != null ? m.slots[w] : undefined;
    const title = ws
      ? (w === me ? `YOU TAKE ROUND ${m.round}` : `${ws.name.toUpperCase()} TAKES ROUND ${m.round}`)
      : 'NOBODY SURVIVED';
    const color = ws ? ws.color : '#ffffff';
    this.glow(ctx, `re|${title}|${color}`, [{ text: title, font: font(800, 38, DISPLAY_FONT), color, dy: 0, glow: true }], cx, my - 78, 1);

    // finishing order: winner first, then the groups that went out, last-out first
    const rows: { id: number; place: number }[] = [];
    if (w != null) rows.push({ id: w, place: 1 });
    let place = rows.length + 1;
    for (let g = m.world.outOrder.length - 1; g >= 0; g--) {
      const group = m.world.outOrder[g]!;
      for (const id of group) rows.push({ id, place });
      place += group.length;
    }
    ctx.fillStyle = 'rgba(6,8,16,0.86)';
    ctx.fillRect(cx - 150, my - 34, 300, rows.length * 30 + 14);
    ctx.strokeStyle = 'rgba(140,170,255,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 149.5, my - 33.5, 299, rows.length * 30 + 13);
    rows.forEach((r, i) => {
      const s = m.slots[r.id];
      if (!s) return;
      const y = my - 12 + i * 30;
      ctx.globalAlpha = a * Math.min(1, Math.max(0, (m.phaseTime - 0.15 - i * 0.12) * 5));
      ctx.textAlign = 'left';
      ctx.font = font(600, 13, DISPLAY_FONT);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(`${r.place}`, cx - 130, y);
      ctx.fillStyle = s.color;
      ctx.fillText(r.id === me ? 'YOU' : s.name.toUpperCase(), cx - 100, y);
      ctx.textAlign = 'right';
      ctx.font = font(800, 16, BODY_FONT);
      const pts = m.lastRound[r.id] ?? 0;
      ctx.fillStyle = pts > 0 ? '#ffffff' : 'rgba(255,255,255,0.35)';
      ctx.fillText(`+${pts}`, cx + 130, y);
    });
    ctx.globalAlpha = 1;
  }

  /** The DOM match-end screen owns the heading and standings; the canvas only dims behind it. */
  private drawMatchEnd(ctx: CanvasRenderingContext2D, m: Match, sw: number, sh: number): void {
    ctx.fillStyle = `rgba(4,5,10,${Math.min(0.75, 0.5 + m.phaseTime * 2)})`;
    ctx.fillRect(0, 0, sw, sh);
  }

  private glow(ctx: CanvasRenderingContext2D, key: string, lines: TextLine[], x: number, y: number, s: number): void {
    const k = `${key}|${this.dpr}`;
    let img = this.textCache.get(k);
    if (!img) {
      if (this.textCache.size > 40) this.textCache.clear();
      img = glowText(lines, this.dpr);
      this.textCache.set(k, img);
    }
    const fit = Math.min(1, (ctx.canvas.width / this.dpr) * 0.9 / img.w);
    blit(ctx, img.canvas, img.w, img.h, x, y, s * fit);
  }
}

function blit(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, w: number, h: number, x: number, y: number, s: number): void {
  ctx.drawImage(img, x - (w * s) / 2, y - (h * s) / 2, w * s, h * s);
}
