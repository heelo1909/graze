import { describe, expect, test } from 'vitest';
import { TUNING } from '../src/config';
import { botSteer, newBotMemory } from '../src/bots/bot';
import { createWorld, stepWorld } from '../src/sim/world';
import type { Car, Slot, Steer, World } from '../src/sim/types';

const slots: Slot[] = [0, 1].map((i) => ({ name: `B${i}`, color: '#fff', isBot: true }));

function place(c: Car, x: number, y: number, heading: number): void {
  c.x = x; c.y = y; c.lastX = x; c.lastY = y; c.heading = heading;
  c.vx = Math.cos(heading) * TUNING.BASE_SPEED;
  c.vy = Math.sin(heading) * TUNING.BASE_SPEED;
}

function drive(w: World, secs: number): void {
  const mem = newBotMemory();
  for (let i = 0; i < secs * 60; i++) {
    const st: Steer[] = [botSteer(w, 0, mem, 'normal'), 0];
    stepWorld(w, st);
  }
}

describe('botSteer', () => {
  test('bot heading at a wall 120 units away turns before hitting it', () => {
    const w = createWorld(slots, 3);
    place(w.cars[0]!, 1080, 380, 0);
    place(w.cars[1]!, 100, 100, Math.PI / 2);
    drive(w, 2);
    expect(w.cars[0]!.alive).toBe(true);
  });

  test('bot heading straight at a trail line turns away', () => {
    const w = createWorld(slots, 4);
    place(w.cars[0]!, 300, 600, -Math.PI / 2);
    place(w.cars[1]!, 100, 100, 0);
    for (let x = 200; x <= 420; x += 2) w.grid.stamp(x, 480, 1, 0);
    drive(w, 1.5);
    expect(w.cars[0]!.alive).toBe(true);
    expect(w.cars[0]!.y).toBeGreaterThan(470);
  });

  test('bot memory holds the decision between reaction ticks', () => {
    const w = createWorld(slots, 5);
    const mem = newBotMemory();
    const first = botSteer(w, 0, mem, 'normal');
    expect(mem.timer).toBeGreaterThan(0);
    place(w.cars[0]!, 1190, 380, 0);
    expect(botSteer(w, 0, mem, 'normal')).toBe(first);
    expect(mem.steer).toBe(first);
  });
});
