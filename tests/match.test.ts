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

test('cutoffTotals accumulates each roundOver cutoffs by owner', () => {
  const m = createMatch(slots, 7);
  expect(m.cutoffTotals).toEqual([0, 0]);
  m.phase = 'play';
  // Make car 0 crash into car 1's trail: owner 1 gets a cut-off.
  const w = m.world;
  for (let y = 300; y <= 460; y += 2) w.grid.stamp(600, y, 1, 0);
  const c0 = w.cars[0]!;
  const c1 = w.cars[1]!;
  c0.x = 560; c0.y = 380; c0.heading = 0; c0.vx = 100; c0.vy = 0; c0.lastX = 560; c0.lastY = 380;
  c1.x = 200; c1.y = 700; c1.heading = -Math.PI / 2; c1.vx = 0; c1.vy = -100; c1.lastX = 200; c1.lastY = 700;
  for (let i = 0; i < 60 * 30 && m.phase === 'play'; i++) stepMatch(m, steers);
  expect(m.phase).not.toBe('play');
  expect(m.cutoffTotals).toEqual([0, 1]);
});
