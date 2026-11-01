import { describe, expect, test } from 'vitest';
import { SnapBuffer } from '../src/net/snapbuf';
import type { NetCar, NetSnap } from '../src/net/protocol';

const car = (x: number): NetCar => ({ x, y: 0, vx: 0, vy: 0, heading: 0, hold: 0, boost: 0, alive: true });
const snap = (x: number, tick = 0): NetSnap => ({
  tick, phase: 'play', phaseTime: 0, round: 1, totals: [0], lastRound: [0], cutoffTotals: [0],
  time: 0, bounds: { left: 0, top: 0, right: 1, bottom: 1 }, cars: [car(x)], events: [],
});

describe('SnapBuffer', () => {
  test('interpolates between two snaps', () => {
    const b = new SnapBuffer();
    b.push(snap(0), 0.0);
    b.push(snap(10), 0.1);
    expect(b.poses(0.15)![0]!.x).toBeCloseTo(5);
  });
  test('holds newest when ahead', () => {
    const b = new SnapBuffer();
    b.push(snap(0), 0.0);
    b.push(snap(10), 0.1);
    expect(b.poses(5)![0]!.x).toBe(10);
  });
  test('returns null when empty', () => {
    expect(new SnapBuffer().poses(1)).toBeNull();
  });
  test('buffer drops snapshots older than the newest pair', () => {
    const b = new SnapBuffer();
    for (let i = 0; i < 50; i++) b.push(snap(i, i), i * 0.03);
    b.poses(49 * 0.03 + 0.05);
    expect(b.size).toBeLessThanOrEqual(3);
  });
  test('stale after 2s without snapshots', () => {
    const b = new SnapBuffer();
    expect(b.stale(100)).toBe(false);
    b.push(snap(0), 3);
    expect(b.stale(3 + 2.01)).toBe(true);
    expect(b.stale(3 + 1.9)).toBe(false);
  });
});
