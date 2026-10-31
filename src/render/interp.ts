// Render-only interpolation between the previous and current fixed sim step. Never touches the sim.
import { DT } from '../config';
import type { Car, World } from '../sim/types';

const TAU = Math.PI * 2;

/** Fraction of the way from the previous step to the current one, from the accumulator remainder. */
export function renderAlpha(acc: number): number {
  return Math.min(1, Math.max(0, acc / DT));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolates headings (never wrapped) along the shortest arc. */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return a + d * t;
}

/** Remembers each car's pose before a sim step and hands the renderer blended copies of the cars. */
export class CarInterp {
  private prev = new Float64Array(0);
  private world: World | null = null;
  private out: Car[] = [];

  /** Call right before each stepMatch. */
  snapshot(w: World): void {
    if (this.prev.length !== w.cars.length * 3) this.prev = new Float64Array(w.cars.length * 3);
    w.cars.forEach((c, i) => {
      this.prev[i * 3] = c.x; this.prev[i * 3 + 1] = c.y; this.prev[i * 3 + 2] = c.heading;
    });
    this.world = w;
  }

  /** Cars at `alpha` between the last snapshot and now. Falls back to the live cars when the
   *  snapshot belongs to another world (a new round was just created). */
  cars(w: World, alpha: number): Car[] {
    if (w !== this.world || alpha >= 1) return w.cars;
    while (this.out.length < w.cars.length) this.out.push({ ...w.cars[this.out.length]! });
    w.cars.forEach((c, i) => {
      const o = this.out[i]!;
      Object.assign(o, c);
      o.x = lerp(this.prev[i * 3]!, c.x, alpha);
      o.y = lerp(this.prev[i * 3 + 1]!, c.y, alpha);
      o.heading = lerpAngle(this.prev[i * 3 + 2]!, c.heading, alpha);
    });
    return this.out;
  }
}
