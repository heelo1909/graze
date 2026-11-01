// Joiner-side interpolation buffer: renders other cars a little in the past so
// two snapshots always surround the render time. No DOM access in src/net/.
import { TUNING } from '../config';
import { lerp, lerpAngle } from '../render/interp';
import type { NetCar, NetSnap } from './protocol';

const MAX_KEPT = 32;

interface Entry { at: number; cars: NetCar[] }

export class SnapBuffer {
  private entries: Entry[] = [];

  get size(): number {
    return this.entries.length;
  }

  push(snap: NetSnap, at: number): void {
    this.entries.push({ at, cars: snap.cars });
    if (this.entries.length > MAX_KEPT) this.entries.splice(0, this.entries.length - MAX_KEPT);
  }

  clear(): void {
    this.entries = [];
  }

  /** Car poses at `now - NET_INTERP_DELAY_S`; null when nothing has arrived. */
  poses(now: number): NetCar[] | null {
    const e = this.entries;
    if (e.length === 0) return null;
    const t = now - TUNING.NET_INTERP_DELAY_S;
    let i = 0;
    while (i + 1 < e.length && e[i + 1]!.at <= t) i++;
    if (i > 0) e.splice(0, i);
    const a = e[0]!;
    const b = e[1];
    if (!b) return a.cars;
    if (t <= a.at) return a.cars;
    const f = (t - a.at) / (b.at - a.at);
    return a.cars.map((ca, k) => {
      const cb = b.cars[k] ?? ca;
      return {
        x: lerp(ca.x, cb.x, f), y: lerp(ca.y, cb.y, f),
        vx: lerp(ca.vx, cb.vx, f), vy: lerp(ca.vy, cb.vy, f),
        heading: lerpAngle(ca.heading, cb.heading, f),
        hold: lerp(ca.hold, cb.hold, f), boost: lerp(ca.boost, cb.boost, f),
        alive: ca.alive,
      };
    });
  }

  /** True when the newest snapshot is older than NET_STALE_S. False before the first one. */
  stale(now: number): boolean {
    const newest = this.entries[this.entries.length - 1];
    return newest !== undefined && now - newest.at > TUNING.NET_STALE_S;
  }
}
