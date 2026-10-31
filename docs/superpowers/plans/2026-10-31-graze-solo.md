# Graze Milestone 1 (Solo vs Bots) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable, deployed solo version of Graze. You play against 3 bots with the full handling, trails, close-call boost, shrinking arena, scoring, reveals, graphics and sound, so the user can approve the feel before multiplayer is built.

**Architecture:** A pure, headless simulation (`src/sim/`) runs at a fixed 60 Hz and returns events. A separate Canvas 2D renderer, audio and DOM screens consume those events. The same simulation drives the game, the bots and the headless balance tests, and milestone 2 will put its host behind the network. Every tuning number lives in `src/config.ts`.

**Tech Stack:** Vite 5, TypeScript 5 (strict), Vitest, Canvas 2D, Web Audio. No UI framework, no runtime dependencies. GitHub Actions deploys to GitHub Pages.

**Spec:** `graze/sections.md` (read it first; section numbers below refer to it). Reference prototype: `../graze-spike/index.html`. It has working versions of the handling, collision grid, bot arc-sim and visuals. Port the ideas, not the file.

## Global Constraints

- Static files only, deployable to GitHub Pages. Vite `base: './'`.
- MacBooks only, Chrome and Safari. Keyboard only, no touch.
- Two in-game controls: steer left (←/A) and steer right (→/D). Nothing else during play.
- Steady 60 fps on a MacBook Air M4 with 4 cars at peak. Device pixel ratio capped at 2. No `shadowBlur` or `ctx.filter` inside the frame loop.
- Arena is 1200×760 logical units. Always 4 cars (you + 3 bots).
- Rewards go to the player who made the play. Edge camping must not be a winning strategy.
- Starting tuning values (spec 4.2): base speed 185, turn 2.0→4.8 rad/s, grip 9→2.5, hold builds up over 0.5 s, boost up to +60%.
- Rounds should average 20–40 s, and matches should take about 3–5 minutes.
- Online play (Create/Join, PeerJS, Firebase) is **out of scope** for this plan. Don't show those buttons yet.

## Review Focus

1. **Tab switch or window blur mid-round:** keys must not stay held, and the simulation must not jump forward. A long frame gap is capped (Task 9, `stepsFor` test; Task 9, `Input` blur test).
2. **Both arrow keys held at once:** steer is 0. Releasing one turns toward the other (Task 9, `Input` test).
3. **120 Hz ProMotion displays:** cars move at the same speed as at 60 Hz, because of the fixed timestep (Task 9, `stepsFor` test).
4. **Safari:** audio must start after the first key press or click, and stay silent until then (Task 9, manual Safari check).
5. **Resize or fullscreen mid-round:** the arena rescales and trails stay drawn, because the trail layer is in arena units (Task 8, `fitArena` test, plus a manual resize check).

---

## File Structure

```
graze/
  index.html                  page shell, canvas, #ui overlay root
  vite.config.ts              base './'
  package.json, tsconfig.json
  .github/workflows/deploy.yml
  src/
    config.ts                 TUNING: every gameplay number in one object
    sim/
      types.ts                Steer, Car, Bounds, SimEvent, World, Slot
      rng.ts                  seeded RNG (mulberry32)
      grid.ts                 collision grid: stamp / hitAt
      car.ts                  handling: stepCar
      arena.ts                shrinking bounds: boundsAt
      world.ts                createWorld / stepWorld (one round)
      scoring.ts              roundPoints / targetPoints / matchWinner
      match.ts                phases: countdown → play → roundEnd → matchEnd
    bots/
      bot.ts                  botSteer + difficulty presets
    render/
      viewport.ts             fitArena (screen ↔ arena transform)
      renderer.ts             trail layer, bloom, cars, arena, shrink warning
      fx.ts                   particles, rings, tethers, crash shards
      hud.ts                  scores, round, boost bar, feed, banners
    audio.ts                  generated sounds + mute
    input.ts                  Input class (keys → Steer)
    loop.ts                   stepsFor (fixed-timestep accumulator)
    ui/screens.ts             title (name, difficulty, mute, Play) + match end
    main.ts                   wires everything together
  tests/
    rng.test.ts grid.test.ts car.test.ts world.test.ts arena.test.ts
    scoring.test.ts match.test.ts bot.test.ts balance.test.ts
    viewport.test.ts input.test.ts loop.test.ts
```

---

### Task 1: Project scaffold, config, seeded RNG

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/main.ts` (placeholder), `src/config.ts`, `src/sim/rng.ts`, `tests/rng.test.ts`

**Interfaces:**
- Produces:
  - `export const TUNING` (a frozen object, keys below)
  - `export const DT = 1 / 60`
  - `export interface Rng { next(): number; range(a: number, b: number): number }`
  - `export function makeRng(seed: number): Rng`

- [ ] **Step 1: Init the repo and tooling**

Run inside `graze/`: `git init`, `npm init -y`, `npm i -D vite@5 typescript@5 vitest@2`. Scripts: `"dev": "vite"`, `"build": "tsc --noEmit && vite build"`, `"test": "vitest run"`. Use a strict tsconfig (`"strict": true`, `"noUncheckedIndexedAccess": true`, target ES2022, module ESNext, moduleResolution bundler). `vite.config.ts` sets `base: './'`.

- [ ] **Step 2: Write `src/config.ts`**

`TUNING` keys and starting values (spec 4.2–4.6, plus the values the spike proved):

| key | value | key | value |
|---|---|---|---|
| ARENA_W | 1200 | ARENA_H | 760 |
| BASE_SPEED | 185 | BOOST_MAX | 0.6 |
| TURN_MIN | 2.0 | TURN_MAX | 4.8 |
| GRIP_MAX | 9 | GRIP_MIN | 2.5 |
| HOLD_RAMP_S | 0.5 | HOLD_DECAY_S | 0.25 |
| GAP_EVERY_MIN | 1.6 | GAP_EVERY_MAX | 2.8 |
| GAP_LEN | 0.2 | OWN_FRESH_S | 0.3 |
| CELL | 4 | NOSE_OFFSETS | [4, 7] |
| GRAZE_RADIUS | 17 | GRAZE_SAMPLES | 10 |
| GRAZE_CHARGE_PER_S | 2.4 | WALL_GRAZE_FACTOR | 0 |
| BOOST_DRAIN_PER_S | 0.45 | HEAD_ON_DIST | 11 |
| SHRINK_START_S | 12 | SHRINK_DURATION_S | 20 |
| SHRINK_TO | 0.55 | SHRINK_WARN_S | 2 |
| EDGE_ZONE | 60 | END_DELAY_S | 0.8 |
| GRAZE_OWN_FRESH_S | 0.6 | SLOWMO_SCALE / SLOWMO_S | 0.3 / 0.45 |
| COUNTDOWN_S | 3 | ROUND_END_PAUSE_S | 2.5 |

- [ ] **Step 3: Write the failing test `tests/rng.test.ts`**

```ts
test('same seed gives same sequence', () => {
  const a = makeRng(42), b = makeRng(42);
  expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
});
test('range stays in bounds', () => {
  const r = makeRng(1);
  for (let i = 0; i < 1000; i++) { const v = r.range(1.6, 2.8); expect(v).toBeGreaterThanOrEqual(1.6); expect(v).toBeLessThan(2.8); }
});
```

- [ ] **Step 4: Run `npx vitest run tests/rng.test.ts`. Expected: FAIL (module not found).**
- [ ] **Step 5: Implement `makeRng` (mulberry32) in `src/sim/rng.ts`.**
- [ ] **Step 6: Run `npm test` → PASS. Run `npm run build` → succeeds.**
- [ ] **Step 7: Commit:** `git add -A && git commit -m "chore: scaffold graze with config and seeded rng"`

---

### Task 2: Collision grid

**Files:**
- Create: `src/sim/grid.ts`, `src/sim/types.ts` (start it with `Steer` and `Bounds`), `tests/grid.test.ts`

**Interfaces:**
- Produces:
  - `export type Steer = -1 | 0 | 1`
  - `export interface Bounds { left: number; top: number; right: number; bottom: number }`
  - `export class Grid { constructor(w: number, h: number, cell: number); clear(): void; stamp(x: number, y: number, owner: number, time: number): void; hitAt(x: number, y: number, self: number, now: number, freshS: number): number }`
  - `hitAt` returns the owner id, or -1 if the cell is empty, out of range, or the caller's own trail younger than `freshS`.

- [ ] **Step 1: Write failing tests**

```ts
test('stamp marks a 3x3 block of cells', () => {
  const g = new Grid(1200, 760, 4); g.stamp(100, 100, 2, 0);
  expect(g.hitAt(100, 100, 0, 1, 0.3)).toBe(2);
  expect(g.hitAt(105, 100, 0, 1, 0.3)).toBe(2);   // neighbour cell
  expect(g.hitAt(112, 100, 0, 1, 0.3)).toBe(-1);
});
test('own fresh trail is ignored, own old trail is not', () => {
  const g = new Grid(1200, 760, 4); g.stamp(50, 50, 1, 10);
  expect(g.hitAt(50, 50, 1, 10.1, 0.3)).toBe(-1);
  expect(g.hitAt(50, 50, 1, 10.5, 0.3)).toBe(1);
});
test('stamping never overwrites an occupied cell', () => {
  const g = new Grid(1200, 760, 4); g.stamp(50, 50, 1, 0); g.stamp(50, 50, 2, 5);
  expect(g.hitAt(50, 50, 3, 6, 0.3)).toBe(1);
});
test('out of range is empty', () => { expect(new Grid(1200, 760, 4).hitAt(-5, 9999, 0, 0, 0.3)).toBe(-1); });
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `Grid`** with `Int8Array` owners (filled with -1) and a `Float32Array` of stamp times. Stamp only into empty cells. This is what makes crossing your own old trail deadly.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(sim): collision grid`

---

### Task 3: Car handling

**Files:**
- Create: `src/sim/car.ts`, `tests/car.test.ts`
- Modify: `src/sim/types.ts` (add `Car`)

**Interfaces:**
- Consumes: `TUNING`, `DT`, `Steer`
- Produces:
  - `export interface Car { id: number; name: string; color: string; isBot: boolean; x: number; y: number; heading: number; vx: number; vy: number; hold: number; lastSteer: Steer; boost: number; alive: boolean; gapOn: boolean; gapTimer: number; lastX: number; lastY: number; grazing: boolean; edgeTime: number }`
  - `export function makeCar(id: number, name: string, color: string, isBot: boolean, x: number, y: number, heading: number): Car` (velocity = heading × BASE_SPEED)
  - `export function stepCar(car: Car, steer: Steer, dt: number): void` updates hold, heading, velocity and position only. No collisions.

- [ ] **Step 1: Write failing tests**

```ts
test('no steer: straight at base speed', () => {
  const c = makeCar(0, 'a', '#fff', false, 100, 100, 0);
  for (let i = 0; i < 60; i++) stepCar(c, 0, DT);
  expect(c.x).toBeCloseTo(100 + 185, 0); expect(c.y).toBeCloseTo(100, 3);
});
test('speed magnitude is constant while sliding', () => {
  const c = makeCar(0, 'a', '#fff', false, 600, 380, 0);
  for (let i = 0; i < 90; i++) { stepCar(c, 1, DT); expect(Math.hypot(c.vx, c.vy)).toBeCloseTo(185, 3); }
});
test('hold reaches 1 after HOLD_RAMP_S and turns faster than a tap', () => {
  const tap = makeCar(0, 'a', '#fff', false, 600, 380, 0), held = makeCar(1, 'b', '#fff', false, 600, 380, 0);
  for (let i = 0; i < 30; i++) stepCar(held, 1, DT);
  expect(held.hold).toBeCloseTo(1, 2);
  const h0 = held.heading; stepCar(held, 1, DT); stepCar(tap, 1, DT);
  expect(held.heading - h0).toBeGreaterThan(tap.heading - 0);
});
test('sliding: heading leads velocity direction', () => {
  const c = makeCar(0, 'a', '#fff', false, 600, 380, 0);
  for (let i = 0; i < 30; i++) stepCar(c, 1, DT);
  expect(c.heading - Math.atan2(c.vy, c.vx)).toBeGreaterThan(0.05);
});
test('boost 1 moves at 1.6x base speed', () => {
  const c = makeCar(0, 'a', '#fff', false, 100, 100, 0); c.boost = 1; stepCar(c, 0, DT);
  expect(Math.hypot(c.vx, c.vy)).toBeCloseTo(185 * 1.6, 3);
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `stepCar`** using the spike's model. While the same nonzero steer is held, `hold` rises by `dt / HOLD_RAMP_S` (capped at 1); otherwise it falls by `dt / HOLD_DECAY_S`. Turn rate = lerp(TURN_MIN, TURN_MAX, hold). Grip = lerp(GRIP_MAX, GRIP_MIN, hold). Pull velocity toward heading × speed by `1 - exp(-grip·dt)`, then renormalize to speed = BASE_SPEED × (1 + BOOST_MAX × boost).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(sim): drift handling`

---

### Task 4: World step (one round)

**Files:**
- Create: `src/sim/world.ts`, `src/sim/arena.ts` (stub `boundsAt` returning full arena; Task 5 fills it in), `tests/world.test.ts`
- Modify: `src/sim/types.ts` (add `Slot`, `CrashCause`, `SimEvent`, `World`)

**Interfaces:**
- Consumes: `Grid`, `Car`, `stepCar`, `makeRng`, `TUNING`
- Produces:
  - `export interface Slot { name: string; color: string; isBot: boolean }`
  - `export type CrashCause = 'wall' | 'trail' | 'own' | 'head'`
  - `export type SimEvent = { type: 'trail'; car: number; x0: number; y0: number; x1: number; y1: number } | { type: 'graze'; car: number; x: number; y: number; source: number } | { type: 'crash'; car: number; cause: CrashCause; by: number | null; x: number; y: number; tick: number } | { type: 'roundOver'; winner: number | null; outOrder: number[][]; cutoffs: number[] }`. `source` is the trail owner id, or -2 for a wall. `outOrder` holds groups of car ids that went out on the same tick, earliest first. `cutoffs` has one entry per trail crash: the owner id.
  - `export interface World { tick: number; time: number; cars: Car[]; grid: Grid; bounds: Bounds; rng: Rng; winner: number | null | undefined; endTimer: number; over: boolean; outOrder: number[][]; cutoffs: number[] }` (`winner === undefined` means not decided yet)
  - `export function createWorld(slots: Slot[], seed: number): World`
  - `export function stepWorld(w: World, steers: Steer[]): SimEvent[]` advances one tick by `DT`
  - `export function stepWorld` must leave the winner untouchable: once decided, the winner skips crash checks and is clamped inside `w.bounds`.

- [ ] **Step 1: Write failing tests** (use 2–4 slots, a fixed seed, and teleport cars to set up each case)

```ts
test('spawns circle the same way along the edges (no head-ons in first 2s, no steering)', () => { /* 4 cars, 120 ticks of steer 0 → no 'head' crash events */ });
test('driving into the wall crashes with cause wall', ...);           // car at x=1190 heading 0
test('crossing another trail crashes with cause trail, by = owner', ...);
test('crossing your own old trail crashes with cause own', ...);
test('two cars meeting crash head-on, both out, same tick group', ...);
test('trail has gaps: over 6s each car has >=2 ticks with gapOn and no trail event', ...);
test('skimming a trail within GRAZE_RADIUS charges boost; skimming only a wall does not (WALL_GRAZE_FACTOR=0)', ...);
test('edgeTime accumulates only while within EDGE_ZONE of bounds', ...);
test('winner is locked when the last rival goes out and cannot crash afterwards', () => {
  // 2 cars; kill car 1; point car 0 at the wall 10px away; run END_DELAY_S worth of ticks
  // expect roundOver.winner === 0 and car 0 still alive, inside bounds
});
test('roundOver fires once, END_DELAY_S after the last rival goes out, with outOrder and cutoffs', ...);
test('everyone out on the same tick → winner null', ...);
```

Fill in each test body with explicit positions and `expect`s; the comments above give the setup and the assertion.

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** Each tick, in this order:
  1. Run `stepCar` on every live car.
  2. Update the gap timer.
  3. Check crashes for cars that aren't the locked winner: the nose at NOSE_OFFSETS against bounds and grid, then head-on pairs (`HEAD_ON_DIST`).
  4. For live cars, stamp and emit the trail from (lastX, lastY) to (x, y), in 2-unit steps, when not in a gap.
  5. Graze: GRAZE_SAMPLES points on a GRAZE_RADIUS circle. Own-trail freshness is `GRAZE_OWN_FRESH_S`. A wall sample charges at `WALL_GRAZE_FACTOR`. Otherwise boost drains.
  6. Update edgeTime.
  7. Decide the winner and run the end timer.

  Spawns (spec 4.1): `[[260,150,0],[1050,230,π/2],[940,610,π],[150,530,-π/2]]`, shuffled with the world RNG.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(sim): world step with crashes, gaps, graze, winner lock`

---

### Task 5: Shrinking arena

**Files:**
- Modify: `src/sim/arena.ts`, `src/sim/world.ts` (set `w.bounds = boundsAt(w.time)` each tick)
- Create: `tests/arena.test.ts`

**Interfaces:**
- Produces: `export function boundsAt(t: number): Bounds` and `export function shrinkWarning(t: number): number` (0..1, ramps up over SHRINK_WARN_S before SHRINK_START_S, then stays 1 while shrinking)

- [ ] **Step 1: Write failing tests**

```ts
test('full arena before SHRINK_START_S', () => expect(boundsAt(11.9)).toEqual({ left: 0, top: 0, right: 1200, bottom: 760 }));
test('shrinks evenly to 55% by start+duration and stays', () => {
  const b = boundsAt(32); expect(b.right - b.left).toBeCloseTo(660, 1); expect(b.bottom - b.top).toBeCloseTo(418, 1);
  expect((b.left + b.right) / 2).toBeCloseTo(600, 1); expect(boundsAt(100)).toEqual(b);
});
test('warning ramps 0→1 over the 2s before shrink', () => { expect(shrinkWarning(9)).toBe(0); expect(shrinkWarning(11)).toBeCloseTo(0.5, 2); expect(shrinkWarning(15)).toBe(1); });
test('world: a car parked on the old edge is killed by the shrinking wall with cause wall', ...);
```

- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** (linear ease is fine; an ease-in-out is the builder's choice). **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(sim): shrinking arena`

---

### Task 6: Scoring and match flow

**Files:**
- Create: `src/sim/scoring.ts`, `src/sim/match.ts`, `tests/scoring.test.ts`, `tests/match.test.ts`

**Interfaces:**
- Consumes: `createWorld`, `stepWorld`, `SimEvent`
- Produces:
  - `export function roundPoints(carCount: number, outOrder: number[][], winner: number | null, cutoffs: number[]): number[]`
  - `export function targetPoints(carCount: number): number` → 4:10, 3:7, 2:5
  - `export function matchWinner(totals: number[], target: number): number | null`
  - `export type Phase = 'countdown' | 'play' | 'roundEnd' | 'matchEnd'`
  - `export interface Match { phase: Phase; phaseTime: number; round: number; totals: number[]; lastRound: number[]; world: World; slots: Slot[]; seed: number }`
  - `export function createMatch(slots: Slot[], seed: number): Match`
  - `export function stepMatch(m: Match, steers: Steer[]): SimEvent[]` advances one DT tick. Phases: `COUNTDOWN_S`, play until `roundOver`, `ROUND_END_PAUSE_S`, then the next round or `matchEnd`.

- [ ] **Step 1: Write failing tests**

```ts
test('placement: +1 per car out before you; survivor gets n-1', () =>
  expect(roundPoints(4, [[1], [2], [3]], 0, [])).toEqual([3, 0, 1, 2]));
test('same-tick crashes do not score off each other', () =>
  expect(roundPoints(4, [[1, 2], [3]], 0, [])).toEqual([3, 0, 0, 2]));
test('+1 cut-off goes to the trail owner even if already out', () =>
  expect(roundPoints(4, [[1], [2], [3]], 0, [1, 1])).toEqual([3, 2, 1, 2]));
test('targets', () => { expect(targetPoints(4)).toBe(10); expect(targetPoints(3)).toBe(7); expect(targetPoints(2)).toBe(5); });
test('match winner needs target and a sole lead', () => {
  expect(matchWinner([9, 3, 2, 1], 10)).toBeNull();
  expect(matchWinner([11, 10, 2, 1], 10)).toBe(0);
  expect(matchWinner([11, 11, 2, 1], 10)).toBeNull();   // tie → keep playing
});
test('match runs countdown → play → roundEnd → next round countdown', ...);   // drive with steer 0, check phases & round counter
test('no cars move during countdown', ...);
```

- [ ] **Step 2: Run → FAIL.** **Step 3: Implement.** **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(sim): scoring and match phases`

---

### Task 7: Bots and balance

**Files:**
- Create: `src/bots/bot.ts`, `tests/bot.test.ts`, `tests/balance.test.ts`

**Interfaces:**
- Consumes: `World`, `stepCar` model constants, `Grid.hitAt`
- Produces:
  - `export type Difficulty = 'easy' | 'normal' | 'hard'`
  - `export const DIFFICULTY: Record<Difficulty, { reactMin: number; reactMax: number; horizonS: number; aggression: number; look: number }>` with easy {0.14, 0.22, 0.6, 0.2, 140}, normal {0.05, 0.10, 0.9, 0.5, 220}, hard {0.03, 0.06, 1.2, 0.8, 280}
  - `export interface BotMemory { timer: number; steer: Steer }`
  - `export function newBotMemory(): BotMemory`
  - `export function botSteer(w: World, id: number, mem: BotMemory, diff: Difficulty): Steer`

**Algorithm (from the spike; the signature doesn't determine it):**
```
every rand(reactMin, reactMax) seconds (else return mem.steer):
  for s in [-1, 0, 1]: score[s] = simArc(car, s, horizonS)   // copy car, stepCar at 1/30 for horizonS,
       // nose 9 units ahead; hit/out-of-bounds → return t*1000; else horizonS*1000 + freeRay(end, look)
       // + 15 if s==0, + 8 if s==mem.steer, + rng(-10,10)
  best = argmax
  if best==0 and road ahead is clear and rng < aggression:
     target = rival with the highest edgeTime if > 3s, else the nearest rival within 340
     cut = target.pos + target.vel*1.1; if angle to cut in (0.15, 1.3) and we arrive first (dist ratio < 0.75)
        and simArc(sign) survives the full horizon → best = sign(angle)
```
Bots use `w.rng` only, so seeded tests are reproducible.

- [ ] **Step 1: Write failing tests `tests/bot.test.ts`**

```ts
test('bot heading at a wall 120 units away turns before hitting it', ...);   // run 2s of ticks; car still alive
test('bot heading straight at a trail line turns away', ...);
test('bot memory holds the decision between reaction ticks', ...);
```

- [ ] **Step 2: Write `tests/balance.test.ts`** (headless; mark `test(..., 60_000)`)

```ts
test('100 all-bot rounds: no exceptions, every round ends', ...);
test('average round length is between 20 and 40 seconds (normal bots)', ...);
test('edge camping does not win more often than an ordinary bot', () => {
  // car 0 is driven by edgeHugger(w, id): keep 30 units inside bounds, turning clockwise
  // cars 1-3 are normal bots. 200 rounds, seeds 1..200.
  // expect(winRate(0)).toBeLessThanOrEqual(Math.max(winRate(1), winRate(2), winRate(3)));
});
```

- [ ] **Step 3: Run → FAIL.**
- [ ] **Step 4: Implement `botSteer`**, plus the `edgeHugger` test helper inside `tests/balance.test.ts`.
- [ ] **Step 5: Run → PASS.** If the round-length or camping test fails, tune **only** `TUNING` values: shrink start and duration, `WALL_GRAZE_FACTOR`, and gap timing. Record what changed in the commit message. Don't weaken the tests.
- [ ] **Step 6: Commit** `feat(bots): arc-sim bots, camper hunting, balance tests`

---

### Task 8: Renderer, effects, HUD

**Files:**
- Create: `src/render/viewport.ts`, `src/render/renderer.ts`, `src/render/fx.ts`, `src/render/hud.ts`, `tests/viewport.test.ts`

**Interfaces:**
- Consumes: `Match`, `SimEvent`, `shrinkWarning`, `TUNING`
- Produces:
  - `export function fitArena(screenW: number, screenH: number, top: number, bottom: number): { scale: number; ox: number; oy: number }` (16 px side margin, matching the spike)
  - `export class Renderer { constructor(canvas: HTMLCanvasElement); resize(): void; clearTrails(): void; onEvents(events: SimEvent[], m: Match): void; draw(m: Match, realTime: number): void }`
  - `export class Fx { burst(x, y, color, n, speed): void; ring(x, y, R, color, T): void; tether(x, y, carId, T): void; shards(x, y, color): void; update(dt: number): void; draw(ctx: CanvasRenderingContext2D, cars: Car[]): void }`
  - `export class Hud { banner(big: string, small: string, color: string): void; feed(parts: { text: string; color: string }[]): void; update(dt: number): void; draw(ctx: CanvasRenderingContext2D, m: Match, v: ReturnType<typeof fitArena>): void }`
  - Banner wording (spec 4.7): `CUT OFF BY ${NAME}` / `YOU CUT OFF ${NAME}` / `YOUR OWN TRAIL` / `INTO THE WALL` / `HEAD-ON WITH ${NAME}`. The feed reads `"Rook cut off Moss"` / `"Pixel crashed"`.

- [ ] **Step 1: Write the failing `tests/viewport.test.ts`**

```ts
test('fits a 1200x760 arena inside the screen with margins and centers it', () => {
  const v = fitArena(1440, 900, 58, 36);
  expect(1200 * v.scale).toBeLessThanOrEqual(1440 - 32);
  expect(760 * v.scale).toBeLessThanOrEqual(900 - 58 - 36);
  expect(v.ox).toBeCloseTo((1440 - 1200 * v.scale) / 2, 5);
});
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement `fitArena`. Step 4: Run → PASS.**
- [ ] **Step 5: Implement `Renderer`, `Fx` and `Hud`** using spec section 7 and the spike as a visual reference:
  - The trail layer is an offscreen canvas at 2× arena size. Draw each `trail` event onto it once, in 3 passes (wide faint, medium, bright core).
  - Bloom (no filters): each frame, draw the trail layer and car glows into a ¼-size canvas, then into a ⅛-size canvas with smoothing on, and composite both back with `lighter`.
  - Glow sprites for cars and orbs are pre-drawn once.
  - Crashes break into 6–10 line shards in the car's color.
  - The car leaves a short fading afterimage (its last ~8 positions).
  - The shrink warning pulses the wall glow, then the drawn wall follows `w.bounds`. Draw a faint outline of the original arena.
  - During `countdown`, each car shows a faint dashed line 70 units long in the direction it will move.
  - In `roundEnd`, the HUD shows who went out in what order and the points each car earned (`m.lastRound`) for the whole ROUND_END_PAUSE_S.
  - Slow motion (`SLOWMO_SCALE` for `SLOWMO_S`) applies only when the human car is involved in the crash. `main.ts` owns time scaling; `Renderer` exposes nothing for it.
- [ ] **Step 6: Manual check:** run `npm run dev`. Mid-round, resize the window and toggle fullscreen; trails must stay drawn and aligned.
- [ ] **Step 7: Commit** `feat(render): neon renderer with bloom, fx, hud`

---

### Task 9: Input, fixed-step loop, audio, screens, wiring

**Files:**
- Create: `src/input.ts`, `src/loop.ts`, `src/audio.ts`, `src/ui/screens.ts`, `tests/input.test.ts`, `tests/loop.test.ts`
- Modify: `src/main.ts`, `index.html`

**Interfaces:**
- Produces:
  - `export class Input { constructor(target: Window); steer(): Steer; releaseAll(): void; dispose(): void }`. ←/A and →/D. Holding both gives 0. Calls `releaseAll` on `blur` and on `visibilitychange` to hidden. Calls `preventDefault` on arrows and Space.
  - `export function stepsFor(accumulator: number, frameDt: number): { steps: number; rest: number }`. Caps `frameDt` at 0.25 s. `steps = floor((acc + dt) / DT)`.
  - `export class Audio { unlock(): void; setMuted(m: boolean): void; graze(boost: number): void; crash(): void; tick(): void; go(): void; win(): void }`. Silent until `unlock()`. `unlock` creates or resumes the AudioContext.
  - `export function showTitle(root: HTMLElement, opts: { onPlay(cfg: { name: string; difficulty: Difficulty }): void; muted: boolean; onMute(m: boolean): void }): void` and `export function showMatchEnd(root: HTMLElement, m: Match, onAgain: () => void): void`

- [ ] **Step 1: Write failing tests**

```ts
// tests/input.test.ts (jsdom env)
test('both keys held → 0, release one → the other', () => { /* keydown ArrowLeft + ArrowRight → 0; keyup ArrowLeft → 1 */ });
test('A/D work like arrows', ...);
test('blur releases all keys', () => { /* keydown ArrowLeft; dispatch blur; steer() === 0 */ });
// tests/loop.test.ts
test('60Hz frame → 1 step', () => expect(stepsFor(0, 1 / 60).steps).toBe(1));
test('120Hz frames → 1 step every 2 frames', () => { let a = 0, s = 0; for (let i = 0; i < 120; i++) { const r = stepsFor(a, 1 / 120); s += r.steps; a = r.rest; } expect(s).toBe(60); });
test('a 5s gap (tab switch) is capped to 0.25s of steps', () => expect(stepsFor(0, 5).steps).toBe(15));
```
Set `environment: 'jsdom'` for `input.test.ts` via a file comment (`// @vitest-environment jsdom`) and run `npm i -D jsdom`.

- [ ] **Step 2: Run → FAIL. Step 3: Implement `Input`, `stepsFor`, `Audio` and the screens. Step 4: Run → PASS.**
- [ ] **Step 5: Wire up `main.ts`.**
  - Title flow: name (saved in `localStorage` inside try/catch, max 12 characters), difficulty (default Normal), mute, then **Play**. That creates a match with the player plus 3 bots named Pixel, Rook and Moss, in fixed neon colors (player cyan `#4de3ff`).
  - Each frame: `stepsFor`, then per step `stepMatch(m, [input.steer(), ...botSteer per bot])`, then `renderer.onEvents`, audio cues, and `renderer.draw`.
  - Unlock audio on the first keydown or pointerdown.
  - Match end screen, then Play Again starts a new match with the same settings.
  - Typography: pick a display face and a body face from Google Fonts with a system fallback stack.
- [ ] **Step 6: Manual checks, in Chrome *and* Safari on a Mac:**
  - Full match plays end to end.
  - Sound starts after the first key press.
  - Switching tabs mid-round doesn't leave a key stuck.
  - Performance panel at the busiest point of a round shows frames under 16.7 ms.
- [ ] **Step 7: Run `npm test && npm run build` → all pass.**
- [ ] **Step 8: Commit** `feat: playable solo match with title, audio and fixed-step loop`

---

### Task 10: Deploy and the feel gate

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md` (how to play, how to run locally)

- [ ] **Step 1: Write the workflow:** on push to `main`, run `npm ci`, `npm test` and `npm run build`, then `actions/upload-pages-artifact@v3` (path `dist`) and `actions/deploy-pages@v4`, with permissions `pages: write` and `id-token: write`.
- [ ] **Step 2: Verify locally:** `npm run build && npx vite preview`, then open the preview URL. The game loads with no console errors. Asset paths are relative, so it works under a `/<repo>/` subpath.
- [ ] **Step 3: User step.** Ask the user to create an empty GitHub repo named `graze` and set Pages → Source to "GitHub Actions". Then run `git remote add origin <url>` and `git push -u origin main`. Do not create the repo or push without the user's go-ahead.
- [ ] **Step 4: Confirm the Actions run is green** and the Pages URL loads the game.
- [ ] **Step 5: Feel gate (spec section 9).** Send the user the URL. They play several matches and either approve the handling (turning, slide, speed, boost) or ask for changes. Tuning changes go in `src/config.ts` only. **Milestone 2 (online play) starts only after the user approves.**
- [ ] **Step 6: Commit** `ci: deploy to GitHub Pages`

---

## Not in this plan (milestone 2, planned after the feel gate)
Online rooms (PeerJS host-authoritative, with Firebase fallback), the lobby, joiner prediction and smoothing, players being replaced by bots when they leave, and sending the slow-motion and banner moments over the network. This plan already separates sim, render and input so those can be added without a rewrite.
