import { expect, test } from 'vitest';
import { DT } from '../src/config';
import { CarInterp, lerp, lerpAngle, renderAlpha } from '../src/render/interp';
import { createWorld } from '../src/sim/world';
import { SLOTS } from '../src/sim/harness';

test('renderAlpha is the accumulator remainder as a fraction of a step, clamped', () => {
  expect(renderAlpha(0)).toBe(0);
  expect(renderAlpha(DT / 2)).toBeCloseTo(0.5, 9);
  expect(renderAlpha(DT * 3)).toBe(1);
  expect(renderAlpha(-1)).toBe(0);
});

test('lerp', () => expect(lerp(10, 20, 0.25)).toBe(12.5));

test('lerpAngle takes the shortest way round, with unwrapped headings', () => {
  expect(lerpAngle(0, 1, 0.5)).toBeCloseTo(0.5, 9);
  // 3.0 -> -3.0 is a short hop across pi (about 0.28 rad), not a 6 rad swing back
  const mid = lerpAngle(3.0, -3.0, 0.5);
  expect(Math.cos(mid)).toBeCloseTo(-1, 2);
  // unwrapped inputs: 10 and 10 + 2pi are the same direction
  expect(lerpAngle(10, 10 + Math.PI * 2, 0.5)).toBeCloseTo(10, 9);
});

test('CarInterp blends between the pre-step and current car state', () => {
  const w = createWorld(SLOTS, 1);
  const ci = new CarInterp();
  const c = w.cars[0]!;
  const x0 = c.x, y0 = c.y, h0 = c.heading;
  ci.snapshot(w);
  c.x += 10; c.y -= 4; c.heading += 0.2;
  const half = ci.cars(w, 0.5)[0]!;
  expect(half.x).toBeCloseTo(x0 + 5, 9);
  expect(half.y).toBeCloseTo(y0 - 2, 9);
  expect(half.heading).toBeCloseTo(h0 + 0.1, 9);
  expect(ci.cars(w, 1)[0]!.x).toBe(c.x);
  expect(ci.cars(w, 0)[0]!.x).toBeCloseTo(x0, 9);
  // never mutates the sim's car
  expect(c.x).toBe(x0 + 10);
});

test('CarInterp draws the raw state when no snapshot exists for this world (new round)', () => {
  const ci = new CarInterp();
  ci.snapshot(createWorld(SLOTS, 1));
  const w2 = createWorld(SLOTS, 2);
  expect(ci.cars(w2, 0.5)[0]!.x).toBe(w2.cars[0]!.x);
});
