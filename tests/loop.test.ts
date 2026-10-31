import { expect, test } from 'vitest';
import { stepsFor, triggersSlowmo } from '../src/loop';
import type { SimEvent } from '../src/sim/types';

test('60Hz frame → 1 step', () => expect(stepsFor(0, 1 / 60).steps).toBe(1));

test('120Hz frames → 1 step every 2 frames', () => {
  let a = 0;
  let s = 0;
  for (let i = 0; i < 120; i++) {
    const r = stepsFor(a, 1 / 120);
    s += r.steps;
    a = r.rest;
  }
  expect(s).toBe(60);
});

test('a 5s gap (tab switch) is capped to 0.25s of steps', () => expect(stepsFor(0, 5).steps).toBe(15));

test('negative or zero frame time yields no steps', () => {
  expect(stepsFor(0, 0).steps).toBe(0);
  expect(stepsFor(0, -1).steps).toBe(0);
});

test('slow motion triggers on a crash involving the human as victim or trail owner only', () => {
  const crash = (car: number, by: number | null): SimEvent => ({ type: 'crash', car, cause: 'trail', by, x: 0, y: 0, tick: 1 });
  expect(triggersSlowmo([crash(0, 2)], 0)).toBe(true);
  expect(triggersSlowmo([crash(2, 0)], 0)).toBe(true);
  expect(triggersSlowmo([crash(1, 2)], 0)).toBe(false);
  expect(triggersSlowmo([crash(1, null)], 0)).toBe(false);
  expect(triggersSlowmo([crash(0, null)], -1)).toBe(false);
});
