import { test, expect } from 'vitest';
import { makeCar, stepCar } from '../src/sim/car';
import { DT } from '../src/config';

test('no steer: straight at base speed', () => {
  const c = makeCar(0, 'a', '#fff', false, 100, 100, 0);
  for (let i = 0; i < 60; i++) stepCar(c, 0, DT);
  expect(c.x).toBeCloseTo(100 + 185, 0); expect(c.y).toBeCloseTo(100, 3);
});
test('speed magnitude is constant while sliding', () => {
  const c = makeCar(0, 'a', '#fff', false, 600, 380, 0);
  for (let i = 0; i < 90; i++) { stepCar(c, 1, DT); expect(Math.hypot(c.vx, c.vy)).toBeCloseTo(185, 3); }
});
test('hold reaches 1 after HOLD_RAMP_S and turns faster than a tap', () => {
  const tap = makeCar(0, 'a', '#fff', false, 600, 380, 0), held = makeCar(1, 'b', '#fff', false, 600, 380, 0);
  for (let i = 0; i < 30; i++) stepCar(held, 1, DT);
  expect(held.hold).toBeCloseTo(1, 2);
  const h0 = held.heading; stepCar(held, 1, DT); stepCar(tap, 1, DT);
  expect(held.heading - h0).toBeGreaterThan(tap.heading - 0);
});
test('sliding: heading leads velocity direction', () => {
  const c = makeCar(0, 'a', '#fff', false, 600, 380, 0);
  for (let i = 0; i < 30; i++) stepCar(c, 1, DT);
  expect(c.heading - Math.atan2(c.vy, c.vx)).toBeGreaterThan(0.05);
});
test('boost 1 moves at 1.6x base speed', () => {
  const c = makeCar(0, 'a', '#fff', false, 100, 100, 0); c.boost = 1; stepCar(c, 0, DT);
  expect(Math.hypot(c.vx, c.vy)).toBeCloseTo(185 * 1.6, 3);
});
test('changing steer direction resets hold', () => {
  const c = makeCar(0, 'a', '#fff', false, 600, 380, 0);
  for (let i = 0; i < 30; i++) stepCar(c, 1, DT);
  stepCar(c, -1, DT);
  expect(c.hold).toBeCloseTo(DT / 0.5, 5);
});
