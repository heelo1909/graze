import { expect, test } from 'vitest';
import { fitArena } from '../src/render/viewport';

test('fits a 1200x760 arena inside the screen with margins and centers it', () => {
  const v = fitArena(1440, 900, 58, 36);
  expect(1200 * v.scale).toBeLessThanOrEqual(1440 - 32);
  expect(760 * v.scale).toBeLessThanOrEqual(900 - 58 - 36);
  expect(v.ox).toBeCloseTo((1440 - 1200 * v.scale) / 2, 5);
});

test('vertically centers the arena between the top and bottom bars', () => {
  const v = fitArena(2000, 900, 58, 36);
  const free = 900 - 58 - 36 - 760 * v.scale;
  expect(v.oy).toBeCloseTo(58 + free / 2, 5);
});

test('never returns a negative scale on a tiny window', () => {
  const v = fitArena(10, 10, 58, 36);
  expect(v.scale).toBeGreaterThan(0);
});
