import { describe, expect, test } from 'vitest';
import { announce } from '../src/render/hud';
import { createMatch } from '../src/sim/match';
import type { CrashCause, Slot } from '../src/sim/types';

const SLOTS: Slot[] = [
  { name: 'You', color: '#4de3ff', isBot: false },
  { name: 'Pixel', color: '#ff4d8d', isBot: true },
  { name: 'Rook', color: '#ffd84d', isBot: true },
  { name: 'Moss', color: '#7dff6a', isBot: true },
];
const m = createMatch(SLOTS, 1);
const crash = (car: number, cause: CrashCause, by: number | null) =>
  ({ type: 'crash' as const, car, cause, by, x: 0, y: 0, tick: 1 });
const text = (a: ReturnType<typeof announce>): string =>
  a?.kind === 'feed' ? a.parts.map((p) => p.text).join('') : a?.kind === 'banner' ? a.big : '';

describe('crash announcements (spec 4.7)', () => {
  test('you hit a rival trail', () => {
    const a = announce(crash(0, 'trail', 2), m, [0]);
    expect(a?.kind).toBe('banner');
    expect(text(a)).toBe('CUT OFF BY ROOK');
    expect(a?.kind === 'banner' && a.color).toBe('#ffd84d');
  });
  test('a rival hits your trail', () => expect(text(announce(crash(1, 'trail', 0), m, [0]))).toBe('YOU CUT OFF PIXEL'));
  test('own trail, wall, head-on', () => {
    expect(text(announce(crash(0, 'own', 0), m, [0]))).toBe('YOUR OWN TRAIL');
    expect(text(announce(crash(0, 'wall', null), m, [0]))).toBe('INTO THE WALL');
    expect(text(announce(crash(0, 'head', 3), m, [0]))).toBe('HEAD-ON WITH MOSS');
  });
  test("the rival's half of your head-on is silent (your banner covers it)", () =>
    expect(announce(crash(3, 'head', 0), m, [0])).toBeNull());
  test('crashes without you go to the feed', () => {
    expect(text(announce(crash(3, 'trail', 2), m, [0]))).toBe('Rook cut off Moss');
    expect(text(announce(crash(1, 'wall', null), m, [0]))).toBe('Pixel crashed');
    expect(announce(crash(1, 'own', 1), m, [0])?.kind).toBe('feed');
  });
  test('with no human slot everything goes to the feed', () => {
    const bots = createMatch(SLOTS.map((s) => ({ ...s, isBot: true })), 1);
    expect(announce(crash(0, 'trail', 2), bots, [])?.kind).toBe('feed');
  });
  test('with two local players every crash goes to the feed, by name', () => {
    const couch = createMatch([
      { name: 'P1', color: '#4de3ff', isBot: false },
      { name: 'P2', color: '#ff9a3d', isBot: false },
      SLOTS[1]!, SLOTS[2]!,
    ], 1);
    const a = announce(crash(1, 'trail', 0), couch, [0, 1]);
    expect(a?.kind).toBe('feed');
    expect(text(a)).toBe('P1 cut off P2');
    expect(announce(crash(0, 'wall', null), couch, [0, 1])?.kind).toBe('feed');
  });
});
