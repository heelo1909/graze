import { describe, expect, test } from 'vitest';
import { tunnelCheck } from '../src/sim/harness';

// A straight trail at several angles; car 0 crosses at several angles, offsets and speeds
// (185 and boosted 296). Every crossing must crash with cause 'trail'.
describe('trail crossing never tunnels', () => {
  test('all crossings crash', () => {
    const { total, misses } = tunnelCheck();
    expect(total).toBeGreaterThan(400);
    expect(misses).toEqual([]);
  });
});
