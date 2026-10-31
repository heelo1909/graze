// Headless simulation helpers shared by tests/balance.test.ts, tests/tunnel.test.ts and tools/sim.ts.
import { DT, TUNING } from '../config';
import { botSteer, newBotMemory, type BotMemory } from '../bots/bot';
import { createMatch, stepMatch } from './match';
import { matchWinner, targetPoints } from './scoring';
import { createWorld, stepWorld } from './world';
import type { Slot, Steer, World } from './types';

export const SLOTS: Slot[] = [0, 1, 2, 3].map((i) => ({ name: `B${i}`, color: '#fff', isBot: true }));
const TAU = Math.PI * 2;
const MARGIN = 30;
const LOOKAHEAD_S = 0.45;

/** Test helper: follows the nearest wall clockwise, steering to stay ~30 units inside it. */
export function edgeHugger(w: World, id: number): Steer {
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

export interface RoundResult { time: number; winner: number | null; graze: number; carTicks: number }

/** Plays one 4-car round with normal bots; car 0 is an edge camper when `hugger`. */
export function playRound(seed: number, hugger: boolean): RoundResult {
  const w = createWorld(SLOTS, seed);
  const mem: BotMemory[] = SLOTS.map(() => newBotMemory());
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

/** Drives car 0 across a straight trail (owner 1) at many line angles, crossing angles, offsets and
 *  speeds. Returns the crossings tested and the descriptions of those that did not crash with cause 'trail'. */
export function tunnelCheck(): { total: number; misses: string[] } {
  const cx = 600, cy = 380;
  const slots = SLOTS.slice(0, 2);
  let total = 0;
  const misses: string[] = [];
  for (const lineDeg of [0, 30, 45, 60, 90, 135]) {
    const la = (lineDeg * Math.PI) / 180;
    for (const rel of [40, 70, 90, 110, 140]) {
      for (const boost of [0, 1]) {
        for (let off = 0; off < 4; off += 0.5) {
          const w = createWorld(slots, 1);
          for (let d = -250; d <= 250; d += 2) w.grid.stamp(cx + Math.cos(la) * d, cy + Math.sin(la) * d, 1, -5);
          const car = w.cars[0]!;
          const other = w.cars[1]!;
          const h = la + (rel * Math.PI) / 180;
          const dist = 80 + off;
          car.x = cx - Math.cos(h) * dist; car.y = cy - Math.sin(h) * dist;
          car.lastX = car.x; car.lastY = car.y; car.heading = h; car.boost = boost;
          const sp = TUNING.BASE_SPEED * (1 + TUNING.BOOST_MAX * boost);
          car.vx = Math.cos(h) * sp; car.vy = Math.sin(h) * sp;
          let cause = '';
          const steers: Steer[] = [0, 0];
          for (let i = 0; i < 120 && !cause; i++) {
            // keep car 1 parked and alive so the round never ends and car 0 is never the winner
            other.x = 80; other.y = 700; other.lastX = 80; other.lastY = 700; other.alive = true;
            w.winner = undefined; w.over = false; w.endTimer = 0; w.outOrder.length = 0;
            for (const e of stepWorld(w, steers)) if (e.type === 'crash' && e.car === 0) cause = e.cause;
          }
          total++;
          if (cause !== 'trail') misses.push(`line ${lineDeg} rel ${rel} boost ${boost} off ${off}: ${cause || 'none'}`);
        }
      }
    }
  }
  return { total, misses };
}

export interface MatchResult { minutes: number; rounds: number; winner: number | null }

/** Plays a whole 4-bot match (normal difficulty) through stepMatch, including countdown and round-end pauses. */
export function playMatch(seed: number): MatchResult {
  const m = createMatch(SLOTS, seed);
  const mem: BotMemory[] = SLOTS.map(() => newBotMemory());
  let ticks = 0;
  while (m.phase !== 'matchEnd') {
    const steers: Steer[] = m.world.cars.map((c, i) =>
      m.phase === 'play' && c.alive ? botSteer(m.world, i, mem[i]!, 'normal') : 0);
    stepMatch(m, steers);
    if (++ticks > 60 * 60 * 60) throw new Error(`match ${seed} did not end`);
  }
  return { minutes: ticks * DT / 60, rounds: m.round, winner: matchWinner(m.totals, targetPoints(SLOTS.length)) };
}
