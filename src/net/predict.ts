// Joiner's own car, stepped locally with the same handling as the host and
// nudged toward the host's authoritative pose. No DOM access in src/net/.
import { DT, TUNING } from '../config';
import { makeCar, stepCar } from '../sim/car';
import type { Car, Steer } from '../sim/types';
import type { NetCar } from './protocol';

const BLEND = 1 - Math.exp(-DT / TUNING.NET_SMOOTH_S);
const HISTORY = Math.ceil(TUNING.NET_PREDICT_HISTORY_S / DT);
const TAU = Math.PI * 2;

interface Pose { x: number; y: number; heading: number }

/** Shortest-arc difference b - a (headings are never wrapped). */
function angleDiff(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return d;
}

export class Predictor {
  car: Car = makeCar(0, '', '', false, 0, 0, 0);
  /** Own recent poses, one per step. The host's pose is old, so it is compared with these. */
  private history: Pose[] = [];
  private ex = 0;
  private ey = 0;
  private eh = 0;

  reset(car: Car): void {
    this.car = { ...car };
    this.clearError();
    this.history = [{ x: car.x, y: car.y, heading: car.heading }];
  }

  step(steer: Steer): void {
    stepCar(this.car, steer, DT);
    const dx = this.ex * BLEND;
    const dy = this.ey * BLEND;
    const dh = this.eh * BLEND;
    this.car.x += dx;
    this.car.y += dy;
    this.car.heading += dh;
    this.ex -= dx;
    this.ey -= dy;
    this.eh -= dh;
    for (const p of this.history) { p.x += dx; p.y += dy; p.heading += dh; }
    this.history.push({ x: this.car.x, y: this.car.y, heading: this.car.heading });
    if (this.history.length > HISTORY) this.history.shift();
  }

  /** Blends toward the host's pose, judged against where this car was when the host was there.
   *  Returns true when the error was too big and the car was snapped. */
  correct(host: NetCar): boolean {
    const c = this.car;
    c.boost = host.boost;
    let ref: Pose = c;
    let best = Infinity;
    for (const p of this.history) {
      const d = Math.hypot(host.x - p.x, host.y - p.y);
      if (d < best) { best = d; ref = p; }
    }
    const ex = host.x - ref.x;
    const ey = host.y - ref.y;
    if (Math.hypot(ex, ey) > TUNING.NET_SNAP_DIST) {
      c.x = host.x; c.y = host.y; c.vx = host.vx; c.vy = host.vy;
      c.heading = host.heading; c.hold = host.hold;
      this.clearError();
      this.history = [{ x: c.x, y: c.y, heading: c.heading }];
      return true;
    }
    this.ex = ex;
    this.ey = ey;
    this.eh = angleDiff(ref.heading, host.heading);
    return false;
  }

  private clearError(): void {
    this.ex = 0;
    this.ey = 0;
    this.eh = 0;
  }
}
