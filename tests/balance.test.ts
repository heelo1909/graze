import { describe, expect, test } from 'vitest';
import { botSteer, newBotMemory, type BotMemory } from '../src/bots/bot';
import { createWorld, stepWorld } from '../src/sim/world';
import type { Slot, Steer, World } from '../src/sim/types';

const slots: Slot[] = [0, 1, 2, 3].map((i) => ({ name: `B${i}`, color: '#fff', isBot: true }));
const TAU = Math.PI * 2;
const MARGIN = 30;
const LOOKAHEAD_S = 0.45;

/** Test helper: follows the nearest wall clockwise, steering to stay ~30 units inside it. */
function edgeHugger(w: World, id: number): Steer {
  const c = w.cars[id]!;
  const b = w.bounds;
  const px = c.x + c.vx * LOOKAHEAD_S; // anticipate corners by judging the projected position
  const py = c.y + c.vy * LOOKAHEAD_S;
  const dist = [px - b.left, b.right - px, py - b.top, b.bottom - py]; // left, right, top, bottom
  const m0 = Math.min(...dist);
  const k = dist.indexOf(m0);
  // clockwise on screen (+heading is clockwise): left edge runs up, right down, top right, bottom left
  const along = [-Math.PI / 2, Math.PI / 2, 0, Math.PI][k]!;
  // positive offset turns away from the wall, negative toward it
  const offset = Math.max(-1.2, Math.min(1.2, (MARGIN - m0) / 50));
  const want = along + offset;
  let d = (want - c.heading) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return d > 0.05 ? 1 : d < -0.05 ? -1 : 0;
}

interface Result { time: number; winner: number | null; graze: number; carTicks: number }

function playRound(seed: number, hugger: boolean): Result {
  const w = createWorld(slots, seed);
  const mem: BotMemory[] = slots.map(() => newBotMemory());
  const steers: Steer[] = [0, 0, 0, 0];
  let guard = 0;
  let graze = 0;
  let carTicks = 0;
  while (!w.over) {
    for (const c of w.cars) {
      if (!c.alive) { steers[c.id] = 0; continue; }
      steers[c.id] = hugger && c.id === 0 ? edgeHugger(w, 0) : botSteer(w, c.id, mem[c.id]!, 'normal');
    }
    stepWorld(w, steers);
    for (const c of w.cars) if (c.alive) { carTicks++; if (c.grazing) graze++; }
    if (++guard > 60 * 300) throw new Error(`round ${seed} did not end`);
  }
  return { time: w.time, winner: w.winner ?? null, graze, carTicks };
}

describe('balance (headless)', () => {
  test('100 all-bot rounds: no exceptions, every round ends', () => {
    for (let s = 1; s <= 100; s++) expect(playRound(s, false).time).toBeGreaterThan(0);
  }, 60_000);

  test('average round length is between 20 and 40 seconds (normal bots)', () => {
    let sum = 0, gz = 0, ct = 0;
    const n = 100;
    for (let s = 1; s <= n; s++) { const r = playRound(s, false); sum += r.time; gz += r.graze; ct += r.carTicks; }
    const mean = sum / n;
    console.log(`mean round length ${mean.toFixed(2)}s, graze ${(100 * gz / ct).toFixed(1)}% of car-ticks`);
    expect(mean).toBeGreaterThanOrEqual(20);
    expect(mean).toBeLessThanOrEqual(40);
  }, 60_000);

  test('edge camping does not win more often than an ordinary bot', () => {
    const wins = [0, 0, 0, 0];
    const n = 200;
    for (let s = 1; s <= n; s++) {
      const r = playRound(s, true);
      if (r.winner !== null) wins[r.winner]!++;
    }
    const rate = wins.map((x) => x / n);
    console.log(`win rates ${rate.map((r) => r.toFixed(3)).join(' ')}`);
    expect(rate[0]!).toBeLessThanOrEqual(Math.max(rate[1]!, rate[2]!, rate[3]!));
  }, 60_000);
});
