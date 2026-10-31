import { expect, test } from 'vitest';
import { TUNING } from '../src/config';
import { createMatch, stepMatch } from '../src/sim/match';
import type { Slot, Steer } from '../src/sim/types';

const slots: Slot[] = [
  { name: 'A', color: '#f00', isBot: false },
  { name: 'B', color: '#00f', isBot: true },
];
const steers: Steer[] = [0, 0];

test('no cars move during countdown', () => {
  const m = createMatch(slots, 7);
  const before = m.world.cars.map((c) => [c.x, c.y]);
  for (let i = 0; i < 60; i++) stepMatch(m, steers);
  expect(m.phase).toBe('countdown');
  expect(m.world.cars.map((c) => [c.x, c.y])).toEqual(before);
  expect(m.world.tick).toBe(0);
});

test('match runs countdown → play → roundEnd → next round countdown', () => {
  const m = createMatch(slots, 7);
  expect(m.phase).toBe('countdown');
  expect(m.round).toBe(1);
  const seen: string[] = [m.phase];
  for (let i = 0; i < 60 * 600 && m.round === 1; i++) {
    stepMatch(m, steers);
    if (seen[seen.length - 1] !== m.phase) seen.push(m.phase);
    if (m.phase === 'matchEnd') break;
  }
  expect(seen.slice(0, 3)).toEqual(['countdown', 'play', 'roundEnd']);
  expect(m.totals.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  expect(m.lastRound.length).toBe(2);
  if (m.phase !== 'matchEnd') {
    expect(m.round).toBe(2);
    expect(m.phase).toBe('countdown');
    expect(m.world.tick).toBe(0);
  }
  expect(TUNING.COUNTDOWN_S).toBeGreaterThan(0);
});
