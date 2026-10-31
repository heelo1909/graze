// Joiner's own car, stepped locally with the same handling as the host and
// nudged toward the host's authoritative pose. No DOM access in src/net/.
import { DT, TUNING } from '../config';
import { makeCar, stepCar } from '../sim/car';
import type { Car, Steer } from '../sim/types';
import type { NetCar } from './protocol';

const BLEND = 1 - Math.exp(-DT / TUNING.NET_SMOOTH_S);

export class Predictor {
  car: Car = makeCar(0, '', '', false, 0, 0, 0);
  private ex = 0;
  private ey = 0;

  reset(car: Car): void {
    this.car = { ...car };
    this.ex = 0;
    this.ey = 0;
  }

  step(steer: Steer): void {
    stepCar(this.car, steer, DT);
    const dx = this.ex * BLEND;
    const dy = this.ey * BLEND;
    this.car.x += dx;
    this.car.y += dy;
    this.ex -= dx;
    this.ey -= dy;
  }

  correct(host: NetCar): void {
    const c = this.car;
    c.boost = host.boost;
    const ex = host.x - c.x;
    const ey = host.y - c.y;
    if (Math.hypot(ex, ey) > TUNING.NET_SNAP_DIST) {
      c.x = host.x; c.y = host.y; c.vx = host.vx; c.vy = host.vy;
      c.heading = host.heading; c.hold = host.hold;
      this.ex = 0;
      this.ey = 0;
    } else {
      this.ex = ex;
      this.ey = ey;
    }
  }
}
