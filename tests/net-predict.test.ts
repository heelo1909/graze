import { describe, expect, test } from 'vitest';
import { Predictor } from '../src/net/predict';
import { makeCar, stepCar } from '../src/sim/car';
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

  test('lagging host does not pull the car back', () => {
    const p = new Predictor();
    p.reset(makeCar(0, 'a', '#fff', false, 300, 300, 0));
    const twin = makeCar(0, 'a', '#fff', false, 300, 300, 0);
    const trail = [{ x: twin.x, y: twin.y }];
    let snaps = 0;
    for (let i = 0; i < 60; i++) {
      p.step(0); stepCar(twin, 0, DT);
      trail.push({ x: twin.x, y: twin.y });
      const old = trail[Math.max(0, trail.length - 1 - 9)]!;
      if (p.correct({ ...hostAt(old, 0), vx: twin.vx, vy: twin.vy, boost: 0 })) snaps++;
    }
    expect(Math.hypot(p.car.x - twin.x, p.car.y - twin.y)).toBeLessThan(2);
    expect(snaps).toBe(0);
  });

  test('real divergence is still corrected', () => {
    const run = (correct: boolean): number => {
      const p = new Predictor();
      p.reset(makeCar(0, 'a', '#fff', false, 300, 300, 0));
      const twin = makeCar(0, 'a', '#fff', false, 300, 300, 0);
      const trail = [{ x: twin.x, y: twin.y, heading: 0 }];
      for (let i = 0; i < 90; i++) {
        p.step(0); stepCar(twin, i < 20 ? 1 : 0, DT);
        trail.push({ x: twin.x, y: twin.y, heading: twin.heading });
        const old = trail[Math.max(0, trail.length - 1 - 9)]!;
        if (correct && i % 2 === 1) p.correct({ ...twin, ...old, alive: true });
      }
      return Math.hypot(p.car.x - twin.x, p.car.y - twin.y);
    };
    const without = run(false);
    expect(without).toBeGreaterThan(20);
    expect(run(true)).toBeLessThan(without / 2);
  });
});
