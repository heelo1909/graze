import { describe, expect, test } from 'vitest';
import { TUNING } from '../src/config';
import { boundsAt, shrinkWarning } from '../src/sim/arena';
import { createWorld, stepWorld } from '../src/sim/world';
import type { Car, Slot, Steer } from '../src/sim/types';

function place(c: Car, x: number, y: number, heading: number): void {
  c.x = x; c.y = y; c.lastX = x; c.lastY = y; c.heading = heading;
  c.vx = Math.cos(heading) * TUNING.BASE_SPEED;
  c.vy = Math.sin(heading) * TUNING.BASE_SPEED;
}

describe('arena', () => {
  test('full arena before SHRINK_START_S', () =>
    expect(boundsAt(11.9)).toEqual({ left: 0, top: 0, right: 1200, bottom: 760 }));

  test('shrinks evenly to 55% by start+duration and stays', () => {
    const b = boundsAt(32);
    expect(b.right - b.left).toBeCloseTo(660, 1);
    expect(b.bottom - b.top).toBeCloseTo(418, 1);
    expect((b.left + b.right) / 2).toBeCloseTo(600, 1);
    expect((b.top + b.bottom) / 2).toBeCloseTo(380, 1);
    expect(boundsAt(100)).toEqual(b);
  });

  test('warning ramps 0 to 1 over the 2s before shrink', () => {
    expect(shrinkWarning(9)).toBe(0);
    expect(shrinkWarning(11)).toBeCloseTo(0.5, 2);
    expect(shrinkWarning(15)).toBe(1);
  });

  test('world: a car riding the old edge is killed by the shrinking wall with cause wall', () => {
    const slots: Slot[] = [0, 1].map((i) => ({ name: `P${i}`, color: '#fff', isBot: i > 0 }));
    const w = createWorld(slots, 3);
    w.time = TUNING.SHRINK_START_S - 0.5;
    place(w.cars[0]!, 300, 20, 0);
    place(w.cars[1]!, 700, 600, Math.PI); // safe far away, heading left along y=600
    const steers: Steer[] = [0, 0];
    let crash: { car: number; cause: string; y: number } | undefined;
    for (let i = 0; i < 600 && !crash; i++) {
      for (const e of stepWorld(w, steers)) {
        if (e.type === 'crash' && e.car === 0) crash = { car: e.car, cause: e.cause, y: e.y };
      }
    }
    expect(crash).toBeDefined();
    expect(crash!.cause).toBe('wall');
    // killed by the top wall, not a side wall: car x stayed well inside the side walls
    const b = w.bounds;
    expect(b.top).toBeGreaterThan(0);
    expect(crash!.y).toBeLessThan(b.top + 1);
    expect(w.cars[0]!.x).toBeGreaterThan(b.left + 20);
    expect(w.cars[0]!.x).toBeLessThan(b.right - 20);
  });
});
