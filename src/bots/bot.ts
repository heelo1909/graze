import { boundsAt } from '../sim/arena';
import { stepCar } from '../sim/car';
import type { Car, Steer, World } from '../sim/types';

export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTY: Record<Difficulty, {
  reactMin: number; reactMax: number; horizonS: number; aggression: number; look: number;
}> = {
  easy: { reactMin: 0.14, reactMax: 0.22, horizonS: 0.6, aggression: 0.2, look: 140 },
  normal: { reactMin: 0.05, reactMax: 0.10, horizonS: 0.9, aggression: 0.5, look: 220 },
  hard: { reactMin: 0.03, reactMax: 0.06, horizonS: 1.2, aggression: 0.8, look: 280 },
};

export interface BotMemory { timer: number; steer: Steer }

export function newBotMemory(): BotMemory {
  return { timer: 0, steer: 0 };
}

const SIM_DT = 1 / 60;
const TICK = 1 / 60;
const NOSE = 9;
const RIVAL_CLEAR = 14;
const RIVAL_STEP = 0.06;
const SIDE_W = 0.5;
const SIDE_ANGLE = 0.7;
const RAY_STEP = 3;
const TAU = Math.PI * 2;

const normAngle = (a: number): number => {
  let d = a % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
};

const scratch = {} as Car;

/** Distance (up to `look`) from (x,y) along `ang` before a wall or trail. */
function freeRay(w: World, id: number, x: number, y: number, ang: number, look: number): number {
  const b = w.bounds;
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  for (let d = RAY_STEP; d <= look; d += RAY_STEP) {
    const px = x + dx * d;
    const py = y + dy * d;
    if (px < b.left || px > b.right || py < b.top || py > b.bottom) return d;
    if (w.grid.hitAt(px, py, id, w.time, 0.4) !== -1) return d;
  }
  return look;
}

/** Simulates the real car handling under a constant steer; returns ms survived, or horizon + free distance. */
function simArc(w: World, car: Car, s: Steer, horizonS: number, look: number): number {
  Object.assign(scratch, car);
  let t = 0;
  while (t < horizonS - 1e-9) {
    stepCar(scratch, s, SIM_DT);
    t += SIM_DT;
    const m = Math.hypot(scratch.vx, scratch.vy) || 1;
    const nx = scratch.x + (scratch.vx / m) * NOSE;
    const ny = scratch.y + (scratch.vy / m) * NOSE;
    const b = boundsAt(w.time + t);
    if (nx < b.left || nx > b.right || ny < b.top || ny > b.bottom) return t * 1000;
    if (w.grid.hitAt(nx, ny, car.id, w.time, 0.4 + t) !== -1) return t * 1000;
    for (const r of w.cars) {
      if (r.id === car.id || !r.alive) continue;
      // rivals are assumed to hold their course: keep clear of their projected path (position and fresh trail)
      for (let tau = 0; tau <= t + 1e-9; tau += RIVAL_STEP) {
        if (Math.hypot(nx - (r.x + r.vx * tau), ny - (r.y + r.vy * tau)) < RIVAL_CLEAR) return t * 1000;
      }
    }
  }
  const ea = Math.atan2(scratch.vy, scratch.vx);
  return horizonS * 1000
    + freeRay(w, car.id, scratch.x, scratch.y, ea, look)
    + SIDE_W * (freeRay(w, car.id, scratch.x, scratch.y, ea - SIDE_ANGLE, look)
      + freeRay(w, car.id, scratch.x, scratch.y, ea + SIDE_ANGLE, look));
}

export function botSteer(w: World, id: number, mem: BotMemory, diff: Difficulty): Steer {
  const car = w.cars[id];
  if (!car || !car.alive) return 0;
  mem.timer -= TICK;
  if (mem.timer > 0) return mem.steer;
  const d = DIFFICULTY[diff];
  mem.timer = w.rng.range(d.reactMin, d.reactMax);

  let best: Steer = 0;
  let bestScore = -Infinity;
  for (const s of [-1, 0, 1] as const) {
    const sc = simArc(w, car, s, d.horizonS, d.look)
      + (s === 0 ? 15 : 0) + (s === mem.steer ? 8 : 0) + w.rng.range(-10, 10);
    if (sc > bestScore) { bestScore = sc; best = s; }
  }

  const va = Math.atan2(car.vy, car.vx);
  if (best === 0 && freeRay(w, id, car.x, car.y, va, d.look) >= d.look - 6 && w.rng.next() < d.aggression) {
    let target: Car | null = null;
    let top = 3;
    for (const r of w.cars) {
      if (r.id !== id && r.alive && r.edgeTime > top) { top = r.edgeTime; target = r; }
    }
    if (!target) {
      let nd = 340;
      for (const r of w.cars) {
        if (r.id === id || !r.alive) continue;
        const dd = Math.hypot(r.x - car.x, r.y - car.y);
        if (dd < nd) { nd = dd; target = r; }
      }
    }
    if (target) {
      const cx = target.x + target.vx * 1.1;
      const cy = target.y + target.vy * 1.1;
      const ang = normAngle(Math.atan2(cy - car.y, cx - car.x) - va);
      const mine = Math.hypot(cx - car.x, cy - car.y);
      const theirs = Math.hypot(cx - target.x, cy - target.y);
      const aa = Math.abs(ang);
      if (aa > 0.15 && aa < 1.3 && mine < theirs * 0.75) {
        const sg: Steer = ang > 0 ? 1 : -1;
        if (simArc(w, car, sg, d.horizonS, d.look) >= d.horizonS * 1000) best = sg;
      }
    }
  }
  mem.steer = best;
  return best;
}
