import { describe, expect, test } from 'vitest';
import { DT, TUNING } from '../src/config';
import { createWorld, stepWorld } from '../src/sim/world';
import type { Car, SimEvent, Slot, Steer, World } from '../src/sim/types';

const slots = (n: number): Slot[] =>
  Array.from({ length: n }, (_, i) => ({ name: `P${i}`, color: '#fff', isBot: i > 0 }));

function place(c: Car, x: number, y: number, heading: number): void {
  c.x = x; c.y = y; c.lastX = x; c.lastY = y; c.heading = heading;
  c.vx = Math.cos(heading) * TUNING.BASE_SPEED;
  c.vy = Math.sin(heading) * TUNING.BASE_SPEED;
}

function run(w: World, ticks: number, steer: Steer = 0): SimEvent[] {
  const out: SimEvent[] = [];
  const steers: Steer[] = w.cars.map(() => steer);
  for (let i = 0; i < ticks; i++) out.push(...stepWorld(w, steers));
  return out;
}

const crashes = (ev: SimEvent[]) => ev.filter((e): e is Extract<SimEvent, { type: 'crash' }> => e.type === 'crash');
const ticksFor = (s: number): number => Math.ceil(s / DT) + 2;

describe('stepWorld', () => {
  test('spawns circle the same way along the edges (no head-ons in first 2s, no steering)', () => {
    const w = createWorld(slots(4), 7);
    const ev = run(w, 120);
    expect(crashes(ev).filter((e) => e.cause === 'head')).toEqual([]);
    expect(w.cars.every((c) => c.alive)).toBe(true);
  });

  test('driving into the wall crashes with cause wall', () => {
    const w = createWorld(slots(2), 1);
    place(w.cars[0]!, 1190, 380, 0);
    place(w.cars[1]!, 600, 100, 0);
    const cr = crashes(run(w, 10));
    expect(cr).toHaveLength(1);
    expect(cr[0]).toMatchObject({ car: 0, cause: 'wall', by: null });
    expect(w.cars[0]!.alive).toBe(false);
  });

  test('crossing another trail crashes with cause trail, by = owner', () => {
    const w = createWorld(slots(2), 1);
    for (let y = 300; y <= 460; y += 2) w.grid.stamp(600, y, 1, 0);
    place(w.cars[0]!, 560, 380, 0);
    place(w.cars[1]!, 200, 700, 0);
    const ev = run(w, ticksFor(TUNING.END_DELAY_S) + 40);
    const cr = crashes(ev);
    expect(cr).toHaveLength(1);
    expect(cr[0]).toMatchObject({ car: 0, cause: 'trail', by: 1 });
    const over = ev.find((e) => e.type === 'roundOver');
    expect(over).toMatchObject({ winner: 1, outOrder: [[0]], cutoffs: [1] });
  });

  test('crossing your own old trail crashes with cause own', () => {
    const w = createWorld(slots(2), 1);
    for (let y = 300; y <= 460; y += 2) w.grid.stamp(600, y, 0, -5);
    place(w.cars[0]!, 560, 380, 0);
    place(w.cars[1]!, 200, 700, 0);
    const cr = crashes(run(w, 40));
    expect(cr).toHaveLength(1);
    expect(cr[0]).toMatchObject({ car: 0, cause: 'own', by: 0 });
  });

  test('two cars meeting crash head-on, both out, same tick group', () => {
    const w = createWorld(slots(3), 1);
    place(w.cars[0]!, 600, 380, 0);
    place(w.cars[1]!, 640, 380, Math.PI);
    place(w.cars[2]!, 100, 700, 0);
    const cr = crashes(run(w, 20));
    expect(cr).toHaveLength(2);
    expect(cr.every((e) => e.cause === 'head')).toBe(true);
    expect(cr.find((e) => e.car === 0)!.by).toBe(1);
    expect(cr.find((e) => e.car === 1)!.by).toBe(0);
    expect(cr[0]!.tick).toBe(cr[1]!.tick);
    expect(w.outOrder).toHaveLength(1);
    expect([...w.outOrder[0]!].sort()).toEqual([0, 1]);
  });

  test('trail has gaps: over 6s each car has >=2 ticks with gapOn and no trail event', () => {
    const w = createWorld(slots(2), 3);
    w.winner = 0; // immune + clamped, so it survives 6s
    w.endTimer = 1e9;
    place(w.cars[0]!, 100, 380, 0);
    let gapTicks = 0;
    let trailInGap = 0;
    for (let i = 0; i < 360; i++) {
      const ev = stepWorld(w, [0, 0]);
      const car = w.cars[0]!;
      if (car.gapOn) {
        gapTicks++;
        trailInGap += ev.filter((e) => e.type === 'trail' && e.car === 0).length;
      }
    }
    expect(gapTicks).toBeGreaterThanOrEqual(2);
    expect(trailInGap).toBe(0);
  });

  test('skimming a trail within GRAZE_RADIUS charges boost; skimming only a wall does not (WALL_GRAZE_FACTOR=0)', () => {
    const w = createWorld(slots(2), 1);
    for (let x = 300; x <= 800; x += 2) w.grid.stamp(x, 368, 1, 0);
    place(w.cars[0]!, 500, 380, 0);
    place(w.cars[1]!, 100, 700, 0);
    const ev = run(w, 5);
    expect(w.cars[0]!.alive).toBe(true);
    expect(w.cars[0]!.boost).toBeGreaterThan(0);
    expect(w.cars[0]!.grazing).toBe(true);
    expect(ev.some((e) => e.type === 'graze' && e.car === 0 && e.source === 1)).toBe(true);

    const w2 = createWorld(slots(2), 1);
    place(w2.cars[0]!, 1190, 100, Math.PI / 2);
    place(w2.cars[1]!, 600, 700, Math.PI);
    const ev2 = run(w2, 10);
    expect(w2.cars[0]!.alive).toBe(true);
    expect(w2.cars[0]!.boost).toBe(0);
    expect(w2.cars[0]!.grazing).toBe(false);
    expect(ev2.filter((e) => e.type === 'graze')).toEqual([]);
  });

  test('edgeTime accumulates only while within EDGE_ZONE of bounds', () => {
    const w = createWorld(slots(2), 1);
    place(w.cars[0]!, 30, 300, Math.PI / 2);
    place(w.cars[1]!, 400, 380, 0);
    run(w, 5);
    expect(w.cars[0]!.edgeTime).toBeCloseTo(5 * DT, 6);
    expect(w.cars[1]!.edgeTime).toBe(0);
  });

  test('winner is locked when the last rival goes out and cannot crash afterwards', () => {
    const w = createWorld(slots(2), 1);
    w.cars[1]!.alive = false;
    place(w.cars[0]!, 1180, 380, 0);
    const ev = run(w, ticksFor(TUNING.END_DELAY_S) + 5);
    const over = ev.filter((e) => e.type === 'roundOver');
    expect(over).toHaveLength(1);
    expect(over[0]).toMatchObject({ winner: 0 });
    expect(w.cars[0]!.alive).toBe(true);
    expect(crashes(ev)).toEqual([]);
    expect(w.cars[0]!.x).toBeLessThanOrEqual(w.bounds.right);
    expect(w.cars[0]!.x).toBeGreaterThanOrEqual(w.bounds.left);
  });

  test('roundOver fires once, END_DELAY_S after the last rival goes out, with outOrder and cutoffs', () => {
    const w = createWorld(slots(3), 1);
    place(w.cars[0]!, 300, 380, 0);
    place(w.cars[1]!, 1190, 300, 0);
    place(w.cars[2]!, 1170, 600, 0);
    const events: SimEvent[] = [];
    let lastCrashTick = 0;
    let overTick = -1;
    for (let i = 0; i < 400; i++) {
      const ev = stepWorld(w, [0, 0, 0]);
      for (const e of ev) {
        if (e.type === 'crash') lastCrashTick = e.tick;
        if (e.type === 'roundOver') overTick = w.tick;
      }
      events.push(...ev);
    }
    expect(events.filter((e) => e.type === 'roundOver')).toHaveLength(1);
    expect(w.over).toBe(true);
    const secs = (overTick - lastCrashTick) * DT;
    expect(secs).toBeGreaterThanOrEqual(TUNING.END_DELAY_S - DT);
    expect(secs).toBeLessThanOrEqual(TUNING.END_DELAY_S + 2 * DT);
    const over = events.find((e) => e.type === 'roundOver');
    expect(over).toMatchObject({ winner: 0, outOrder: [[1], [2]], cutoffs: [] });
    const snap = JSON.stringify(w.cars);
    expect(stepWorld(w, [0, 0, 0])).toEqual([]);
    expect(JSON.stringify(w.cars)).toBe(snap);
  });

  test('everyone out on the same tick → winner null', () => {
    const w = createWorld(slots(2), 1);
    place(w.cars[0]!, 1190, 300, 0);
    place(w.cars[1]!, 10, 500, Math.PI);
    const ev = run(w, ticksFor(TUNING.END_DELAY_S) + 10);
    expect(w.winner).toBeNull();
    expect(w.outOrder).toHaveLength(1);
    expect([...w.outOrder[0]!].sort()).toEqual([0, 1]);
    const over = ev.filter((e) => e.type === 'roundOver');
    expect(over).toHaveLength(1);
    expect(over[0]).toMatchObject({ winner: null });
  });
});
