import { expect, test } from 'vitest';
import { BURST_MAX, filterBurst, hostTimedOut, refusedMessage } from '../src/online';
import { TUNING } from '../src/config';
import type { SimEvent } from '../src/sim/types';

const trail = (car: number): SimEvent => ({ type: 'trail', car, x0: 0, y0: 0, x1: 1, y1: 1 });
const crash = (car: number): SimEvent => ({ type: 'crash', car, x: 0, y: 0, cause: 'wall', by: null, tick: 0 });

test('a normal batch passes through untouched', () => {
  const evs = [trail(0), crash(1)];
  const r = filterBurst(evs);
  expect(r.events).toBe(evs);
  expect(r.burst).toBe(false);
});

test('a batch of exactly BURST_MAX events is not a burst', () => {
  const evs = Array.from({ length: BURST_MAX }, () => crash(0));
  expect(filterBurst(evs).burst).toBe(false);
});

test('a background-tab burst keeps only trail events and flags it', () => {
  const evs: SimEvent[] = [];
  for (let i = 0; i < BURST_MAX + 1; i++) evs.push(i % 2 ? crash(0) : trail(1));
  const r = filterBurst(evs);
  expect(r.burst).toBe(true);
  expect(r.events.length).toBeGreaterThan(0);
  expect(r.events.every((e) => e.type === 'trail')).toBe(true);
});

test('refused reasons map to user-facing messages', () => {
  expect(refusedMessage('full')).toBe('That room is full');
  expect(refusedMessage('started')).toBe('That game already started');
  expect(refusedMessage(null)).toBe('That game already started');
});

test('host timeout fires only after NET_HOST_TIMEOUT_S of silence', () => {
  expect(hostTimedOut(null, 100)).toBe(false);
  expect(hostTimedOut(100, 100 + TUNING.NET_HOST_TIMEOUT_S)).toBe(false);
  expect(hostTimedOut(100, 100 + TUNING.NET_HOST_TIMEOUT_S + 0.1)).toBe(true);
});
