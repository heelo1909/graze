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
    const a = announce(crash(0, 'trail', 2), m);
    expect(a?.kind).toBe('banner');
    expect(text(a)).toBe('CUT OFF BY ROOK');
    expect(a?.kind === 'banner' && a.color).toBe('#ffd84d');
  });
  test('a rival hits your trail', () => expect(text(announce(crash(1, 'trail', 0), m))).toBe('YOU CUT OFF PIXEL'));
  test('own trail, wall, head-on', () => {
    expect(text(announce(crash(0, 'own', 0), m))).toBe('YOUR OWN TRAIL');
    expect(text(announce(crash(0, 'wall', null), m))).toBe('INTO THE WALL');
    expect(text(announce(crash(0, 'head', 3), m))).toBe('HEAD-ON WITH MOSS');
  });
  test("the rival's half of your head-on is silent (your banner covers it)", () =>
    expect(announce(crash(3, 'head', 0), m)).toBeNull());
  test('crashes without you go to the feed', () => {
    expect(text(announce(crash(3, 'trail', 2), m))).toBe('Rook cut off Moss');
    expect(text(announce(crash(1, 'wall', null), m))).toBe('Pixel crashed');
    expect(announce(crash(1, 'own', 1), m)?.kind).toBe('feed');
  });
  test('with no human slot everything goes to the feed', () => {
    const bots = createMatch(SLOTS.map((s) => ({ ...s, isBot: true })), 1);
    expect(announce(crash(0, 'trail', 2), bots)?.kind).toBe('feed');
  });
});
