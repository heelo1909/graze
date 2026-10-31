import { describe, expect, test } from 'vitest';
import { makeRng } from '../src/sim/rng';

describe('makeRng', () => {
  test('same seed gives same sequence', () => {
    const a = makeRng(42), b = makeRng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });
  test('range stays in bounds', () => {
    const r = makeRng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r.range(1.6, 2.8);
      expect(v).toBeGreaterThanOrEqual(1.6);
      expect(v).toBeLessThan(2.8);
    }
  });
});
