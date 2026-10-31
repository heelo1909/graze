import { expect, test } from 'vitest';
import { buildSlots, hintText, localSchemes } from '../src/players';

test('solo: you plus Pixel, Rook and Moss', () => {
  const s = buildSlots(1, 'Ann');
  expect(s).toHaveLength(4);
  expect(s.map((x) => x.isBot)).toEqual([false, true, true, true]);
  expect(s[0]).toEqual({ name: 'Ann', color: '#4de3ff', isBot: false });
});

test('two players: P1, P2 and two bots', () => {
  const s = buildSlots(2, 'Ann');
  expect(s).toHaveLength(4);
  expect(s.map((x) => x.isBot)).toEqual([false, false, true, true]);
  expect(s[0]!.name).toBe('Ann');
  expect(s[1]).toEqual({ name: 'P2', color: '#ff9a3d', isBot: false });
  expect(s.slice(2).map((x) => x.name)).toEqual(['Pixel', 'Rook']);
});

test('steering schemes per local player', () => {
  expect(localSchemes(1)).toEqual(['both']);
  expect(localSchemes(2)).toEqual(['ad', 'arrows']);
});

test('hint line names both key pairs in 2-player mode', () => {
  expect(hintText(2)).toContain('P1  A D');
  expect(hintText(2)).toContain('P2  ← →');
  expect(hintText(1)).toContain('steer');
});
