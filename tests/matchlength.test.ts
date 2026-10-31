import { expect, test } from 'vitest';
import { playMatch } from '../src/sim/harness';

test('a full bot match ends with a winner in a sane number of rounds', () => {
  const r = playMatch(1);
  expect(r.winner).not.toBeNull();
  expect(r.rounds).toBeGreaterThanOrEqual(1);
  expect(r.minutes).toBeGreaterThan(0.3);
  expect(r.minutes).toBeLessThan(10);
});
