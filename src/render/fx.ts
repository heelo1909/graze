// Short-lived visual effects in arena units: sparks, ring shockwaves, crash shards
// and the dashed "who got you" tether. Visual randomness only (never touches the sim).
import type { Car } from '../sim/types';
import { hexA } from './color';

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
interface Ring { x: number; y: number; R: number; color: string; t: number; T: number }
interface Tether { x: number; y: number; car: number; t: number; T: number }
interface Shard { x: number; y: number; vx: number; vy: number; a: number; spin: number; len: number; life: number; max: number; color: string }

const MAX_PARTICLES = 700;
const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export class Fx {
  private parts: Particle[] = [];
  private rings: Ring[] = [];
  private tethers: Tether[] = [];
  private shardList: Shard[] = [];
  private clock = 0;

  get count(): number { return this.parts.length + this.shardList.length; }

  clear(): void {
    this.parts.length = 0;
    this.rings.length = 0;
    this.tethers.length = 0;
    this.shardList.length = 0;
  }

  burst(x: number, y: number, color: string, n: number, speed: number): void {
    for (let i = 0; i < n && this.parts.length < MAX_PARTICLES; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(speed * 0.15, speed);
      const max = rand(0.35, 0.9);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: max, max, color, size: rand(1.2, 3) });
    }
  }

  /** Sparks thrown backward in a cone around angle `dir` (used for drift and graze). */
  spray(x: number, y: number, color: string, n: number, speed: number, dir: number, spread: number): void {
    for (let i = 0; i < n && this.parts.length < MAX_PARTICLES; i++) {
      const a = dir + rand(-spread, spread);
      const s = rand(speed * 0.4, speed);
      const max = rand(0.15, 0.4);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: max, max, color, size: rand(1, 2) });
    }
  }

  ring(x: number, y: number, R: number, color: string, T: number): void {
    this.rings.push({ x, y, R, color, t: 0, T });
  }

  tether(x: number, y: number, carId: number, T: number): void {
    this.tethers.push({ x, y, car: carId, t: T, T });
  }

  shards(x: number, y: number, color: string): void {
    const n = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
      const s = rand(60, 210);
      const max = rand(0.7, 1.2);
      this.shardList.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        a: rand(0, Math.PI * 2), spin: rand(-9, 9), len: rand(4, 10), life: max, max, color,
      });
    }
  }

  update(dt: number): void {
    this.clock += dt;
    const k = Math.exp(-dt * 3);
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]!;
      p.life -= dt;
      if (p.life <= 0) { ps[i] = ps[ps.length - 1]!; ps.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= k; p.vy *= k;
    }
    const ks = Math.exp(-dt * 2.2);
    const ss = this.shardList;
    for (let i = ss.length - 1; i >= 0; i--) {
      const s = ss[i]!;
      s.life -= dt;
      if (s.life <= 0) { ss[i] = ss[ss.length - 1]!; ss.pop(); continue; }
      s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= ks; s.vy *= ks; s.a += s.spin * dt; s.spin *= ks;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]!;
      r.t += dt;
      if (r.t >= r.T) this.rings.splice(i, 1);
    }
    for (let i = this.tethers.length - 1; i >= 0; i--) {
      const t = this.tethers[i]!;
      t.t -= dt;
      if (t.t <= 0) this.tethers.splice(i, 1);
    }
  }

  /** Draws in arena units. Call with the arena transform already set. */
  draw(ctx: CanvasRenderingContext2D, cars: Car[]): void {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      ctx.globalAlpha = p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.lineCap = 'round';
    for (const s of this.shardList) {
      const f = s.life / s.max;
      const c = Math.cos(s.a) * s.len * 0.5;
      const d = Math.sin(s.a) * s.len * 0.5;
      ctx.globalAlpha = f;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(s.x - c, s.y - d); ctx.lineTo(s.x + c, s.y + d); ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = f * f;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    for (const r of this.rings) {
      const k = r.t / r.T;
      const e = 1 - (1 - k) * (1 - k);
      ctx.strokeStyle = hexA(r.color, 1 - k);
      ctx.lineWidth = 3 * (1 - k) + 0.75;
      ctx.beginPath(); ctx.arc(r.x, r.y, 6 + (r.R - 6) * e, 0, Math.PI * 2); ctx.stroke();
    }

    for (const t of this.tethers) {
      const killer = cars[t.car];
      if (!killer) continue;
      const a = Math.min(1, t.t / t.T * 1.5);
      ctx.strokeStyle = hexA(killer.color, 0.85 * a);
      ctx.lineWidth = 2.5;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -this.clock * 60;
      ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(killer.x, killer.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1.75;
      ctx.beginPath(); ctx.arc(killer.x, killer.y, 22 + Math.sin(this.clock * 14) * 4, 0, Math.PI * 2); ctx.stroke();
    }
  }
}
