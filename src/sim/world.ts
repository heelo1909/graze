import { DT, TUNING } from '../config';
import { boundsAt } from './arena';
import { makeCar, stepCar } from './car';
import { Grid } from './grid';
import { makeRng } from './rng';
import type { Car, CrashCause, SimEvent, Slot, Steer, World } from './types';

const SPAWNS: ReadonlyArray<readonly [number, number, number]> = [
  [260, 150, 0],
  [1050, 230, Math.PI / 2],
  [940, 610, Math.PI],
  [150, 530, -Math.PI / 2],
];
const CLAMP_PAD = 6;
const TRAIL_STEP = 2;

export function createWorld(slots: Slot[], seed: number): World {
  const rng = makeRng(seed);
  const spawns = SPAWNS.slice();
  for (let i = spawns.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const a = spawns[i]!;
    spawns[i] = spawns[j]!;
    spawns[j] = a;
  }
  const cars = slots.map((s, i) => {
    const [x, y, h] = spawns[i % spawns.length]!;
    const c = makeCar(i, s.name, s.color, s.isBot, x, y, h);
    c.gapTimer = rng.range(TUNING.GAP_EVERY_MIN, TUNING.GAP_EVERY_MAX);
    return c;
  });
  return {
    tick: 0, time: 0, cars,
    grid: new Grid(TUNING.ARENA_W, TUNING.ARENA_H, TUNING.CELL, TUNING.TRAIL_STAMP_RADIUS),
    bounds: boundsAt(0), rng,
    winner: undefined, endTimer: 0, over: false,
    outOrder: [], cutoffs: [],
  };
}

// Head-on: bodies overlapping, or noses converging within grid reach (so the
// grid check can never pre-empt a head-on) while the lateral offset stays < HEAD_ON_DIST.
const HEAD_ON_REACH = 28;
function isHeadOn(a: Car, o: Car): boolean {
  const dx = o.x - a.x;
  const dy = o.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d < TUNING.HEAD_ON_DIST) return true;
  if (d >= HEAD_ON_REACH) return false;
  const ma = Math.hypot(a.vx, a.vy) || 1;
  const mo = Math.hypot(o.vx, o.vy) || 1;
  const ax = a.vx / ma, ay = a.vy / ma, ox = o.vx / mo, oy = o.vy / mo;
  if (ax * ox + ay * oy > -0.5) return false;
  const lateralA = Math.abs(dx * ay - dy * ax);
  const lateralO = Math.abs(dx * oy - dy * ox);
  const aheadA = dx * ax + dy * ay > 0;
  const aheadO = -(dx * ox + dy * oy) > 0;
  return aheadA && aheadO && lateralA < TUNING.HEAD_ON_DIST && lateralO < TUNING.HEAD_ON_DIST;
}

interface Crash { cause: CrashCause; by: number | null; x: number; y: number }

export function stepWorld(
  w: World, steers: Steer[], wallGrazeFactor: number = TUNING.WALL_GRAZE_FACTOR,
): SimEvent[] {
  if (w.over) return [];
  const ev: SimEvent[] = [];
  const dt = DT;
  w.tick++;
  w.time += dt;
  w.bounds = boundsAt(w.time);
  const b = w.bounds;

  // 1. movement
  for (const c of w.cars) {
    if (!c.alive) continue;
    stepCar(c, steers[c.id] ?? 0, dt);
    if (w.winner === c.id) {
      c.x = Math.min(b.right - CLAMP_PAD, Math.max(b.left + CLAMP_PAD, c.x));
      c.y = Math.min(b.bottom - CLAMP_PAD, Math.max(b.top + CLAMP_PAD, c.y));
    }
  }

  // 2. gap timers
  for (const c of w.cars) {
    if (!c.alive) continue;
    c.gapTimer -= dt;
    if (c.gapTimer <= 0) {
      if (c.gapOn) {
        c.gapOn = false;
        c.gapTimer = w.rng.range(TUNING.GAP_EVERY_MIN, TUNING.GAP_EVERY_MAX);
      } else {
        c.gapOn = true;
        c.gapTimer = TUNING.GAP_LEN;
      }
    }
  }

  // 3. crashes (decided against the pre-stamp grid, applied together)
  const crashes = new Map<number, Crash>();
  const live = w.cars.filter((c) => c.alive && w.winner !== c.id);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const o = live[j]!;
      if (isHeadOn(a, o)) {
        crashes.set(a.id, { cause: 'head', by: o.id, x: a.x, y: a.y });
        crashes.set(o.id, { cause: 'head', by: a.id, x: o.x, y: o.y });
      }
    }
  }
  for (const c of live) {
    if (crashes.has(c.id)) continue;
    const m = Math.hypot(c.vx, c.vy) || 1;
    const dx = c.vx / m;
    const dy = c.vy / m;
    for (const off of TUNING.NOSE_OFFSETS) {
      const nx = c.x + dx * off;
      const ny = c.y + dy * off;
      if (nx < b.left || nx > b.right || ny < b.top || ny > b.bottom) {
        crashes.set(c.id, { cause: 'wall', by: null, x: nx, y: ny });
        break;
      }
      const hit = w.grid.hitAt(nx, ny, c.id, w.time, TUNING.OWN_FRESH_S);
      if (hit !== -1) {
        crashes.set(c.id, hit === c.id
          ? { cause: 'own', by: c.id, x: nx, y: ny }
          : { cause: 'trail', by: hit, x: nx, y: ny });
        break;
      }
    }
  }
  if (crashes.size > 0) {
    const group: number[] = [];
    for (const [id, cr] of crashes) {
      const c = w.cars[id]!;
      c.alive = false;
      c.grazing = false;
      group.push(id);
      if (cr.cause === 'trail' && cr.by !== null) w.cutoffs.push(cr.by);
      ev.push({ type: 'crash', car: id, cause: cr.cause, by: cr.by, x: cr.x, y: cr.y, tick: w.tick });
    }
    w.outOrder.push(group);
  }

  // 4. trails
  for (const c of w.cars) {
    if (!c.alive) continue;
    const dist = Math.hypot(c.x - c.lastX, c.y - c.lastY);
    if (!c.gapOn && dist > 0) {
      const n = Math.max(1, Math.ceil(dist / TRAIL_STEP));
      let px = c.lastX;
      let py = c.lastY;
      for (let k = 1; k <= n; k++) {
        const qx = c.lastX + ((c.x - c.lastX) * k) / n;
        const qy = c.lastY + ((c.y - c.lastY) * k) / n;
        w.grid.stamp(qx, qy, c.id, w.time);
        ev.push({ type: 'trail', car: c.id, x0: px, y0: py, x1: qx, y1: qy });
        px = qx;
        py = qy;
      }
    }
    c.lastX = c.x;
    c.lastY = c.y;
  }

  // 5. graze
  const R = TUNING.GRAZE_RADIUS;
  for (const c of w.cars) {
    if (!c.alive) continue;
    let charge = 0;
    let evSource: number | null = null;
    let evX = 0;
    let evY = 0;
    for (let s = 0; s < TUNING.GRAZE_SAMPLES; s++) {
      const a = (s / TUNING.GRAZE_SAMPLES) * Math.PI * 2;
      const sx = c.x + Math.cos(a) * R;
      const sy = c.y + Math.sin(a) * R;
      let src = -1;
      let factor = 1;
      if (sx < b.left || sx > b.right || sy < b.top || sy > b.bottom) {
        if (wallGrazeFactor > 0) { src = -2; factor = wallGrazeFactor; }
      } else {
        src = w.grid.hitAt(sx, sy, c.id, w.time, TUNING.GRAZE_OWN_FRESH_S);
      }
      if (src === -1) continue;
      charge = Math.max(charge, factor);
      if (evSource === null || (evSource === -2 && src >= 0)) {
        evSource = src; evX = sx; evY = sy;
      }
    }
    if (charge > 0) {
      c.boost = Math.min(1, c.boost + TUNING.GRAZE_CHARGE_PER_S * charge * dt);
      c.grazing = true;
      if (evSource !== null) ev.push({ type: 'graze', car: c.id, x: evX, y: evY, source: evSource });
    } else {
      c.boost = Math.max(0, c.boost - TUNING.BOOST_DRAIN_PER_S * dt);
      c.grazing = false;
    }
  }

  // 6. edge time
  const Z = TUNING.EDGE_ZONE;
  for (const c of w.cars) {
    if (!c.alive) continue;
    if (c.x - b.left < Z || b.right - c.x < Z || c.y - b.top < Z || b.bottom - c.y < Z) c.edgeTime += dt;
  }

  // 7. winner + end timer
  if (w.winner === undefined) {
    const alive = w.cars.filter((c) => c.alive);
    if (alive.length <= 1) {
      w.winner = alive[0]?.id ?? null;
      w.endTimer = TUNING.END_DELAY_S;
    }
  } else {
    w.endTimer -= dt;
    if (w.endTimer <= 0) {
      w.over = true;
      ev.push({ type: 'roundOver', winner: w.winner, outOrder: w.outOrder.map((g) => [...g]), cutoffs: [...w.cutoffs] });
    }
  }
  return ev;
}
