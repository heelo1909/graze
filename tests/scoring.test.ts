import { expect, test } from 'vitest';
import { matchWinner, roundPoints, targetPoints } from '../src/sim/scoring';

test('placement: +1 per car out before you; survivor gets n-1', () =>
  expect(roundPoints(4, [[1], [2], [3]], 0, [])).toEqual([3, 0, 1, 2]));
test('same-tick crashes do not score off each other', () =>
  expect(roundPoints(4, [[1, 2], [3]], 0, [])).toEqual([3, 0, 0, 2]));
test('+1 cut-off goes to the trail owner even if already out', () =>
  expect(roundPoints(4, [[1], [2], [3]], 0, [1, 1])).toEqual([3, 2, 1, 2]));
test('null winner: no survivor points', () =>
  expect(roundPoints(2, [[0, 1]], null, [])).toEqual([0, 0]));
test('targets', () => {
  expect(targetPoints(4)).toBe(10); expect(targetPoints(3)).toBe(7); expect(targetPoints(2)).toBe(5);
});
test('match winner needs target and a sole lead', () => {
  expect(matchWinner([9, 3, 2, 1], 10)).toBeNull();
  expect(matchWinner([11, 10, 2, 1], 10)).toBe(0);
  expect(matchWinner([11, 11, 2, 1], 10)).toBeNull();
});
