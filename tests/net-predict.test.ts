import { describe, expect, test } from 'vitest';
import { Predictor } from '../src/net/predict';
import { makeCar } from '../src/sim/car';
import { stepCar } from '../src/sim/car';
import { DT } from '../src/config';
import type { NetCar } from '../src/net/protocol';

const hostAt = (c: { x: number; y: number }, dx: number): NetCar => ({
  x: c.x + dx, y: c.y, vx: 185, vy: 0, heading: 0, hold: 0, boost: 0.5, alive: true,
});

describe('Predictor', () => {
  test('small error blends out', () => {
    const p = new Predictor();
    p.reset(makeCar(0, 'a', '#fff', false, 300, 300, 0));
    const twin = makeCar(0, 'a', '#fff', false, 310, 300, 0);
    twin.boost = 0.5;
    p.correct(hostAt(p.car, 10));
    for (let i = 0; i < 30; i++) { p.step(0); stepCar(twin, 0, DT); }
    expect(Math.hypot(p.car.x - twin.x, p.car.y - twin.y)).toBeLessThan(1);
    expect(p.car.boost).toBe(0.5);
  });
  test('large error snaps', () => {
    const p = new Predictor();
    p.reset(makeCar(0, 'a', '#fff', false, 300, 300, 0));
    const h = hostAt(p.car, 100);
    p.correct(h);
    expect(p.car.x).toBe(h.x);
  });
});
