# Graze Online Room Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2–4 classmates play one match from their own MacBooks. One player creates a room and shares a 4-letter code, the others join, and bots fill the empty seats.

**Architecture:**
- **Host runs the real match.** It runs the normal `Match` at 60 Hz and sends snapshots at 30 Hz. Each snapshot carries car states, phase and score fields, and the sim events since the last snapshot. Trail segments travel as the existing `trail` events, so the renderer's incremental trail layer works unchanged.
- **Joiners mirror it.** A joiner keeps a mirror `Match` built from snapshots and draws other cars about 100 ms behind, interpolated between snapshots. It predicts its own car with the real `stepCar` and corrects it toward the host.
- **Networking sits behind one small transport interface.** PeerJS is the real transport, and an in-memory loopback is the test transport. This lets every session rule be tested headlessly.
- **Firebase fallback is not built here.** It gets its own plan, and only if the connection test (Task 2) fails on school Wi-Fi.

**Tech Stack:** Vite 5, TypeScript 5 strict, Vitest 2, `peerjs@1.5.5` (new runtime dependency, loaded with dynamic `import()` only when a room is created or joined).

**Spec:** `sections.md` §5 (Multiplayer), §8 (Screens and flow), §4.7 (who got whom).

## Global Constraints

- **Hosting:** GitHub Pages, static files only, no server code. The free public PeerJS server is used only for peers to find each other.
- **Host authority:** the host runs the real game at a fixed 60 Hz. Others send only their steering (-1, 0 or +1) when it changes. The host decides every crash and point.
- **Host sends:** car states about 30 times a second, plus only the new pieces of trail.
- **Prediction and correction:** each joiner's own car moves on their screen immediately with the same handling code, then corrects toward the host.
  - No rewinding.
  - A joiner's car never crashes on its own screen.
  - Small differences smooth out over about 100 ms. Larger ones snap.
- **Rooms:** "Create" gives a 4-letter code from `ABCDEFGHJKLMNPQRSTUVWXYZ` (no I, no O, no digits). "Join" takes a code.
- **Lobby:**
  - Shows each player's name and color, and the room code in large text with a copy button.
  - Host only: bots on/off, difficulty, and Start.
  - Empty seats show as bots.
- **Joining** is allowed only in the lobby. A 5th player, or anyone joining after Start, is refused with a clear message.
- **Leaving:**
  - A player who leaves mid-match is replaced by a bot until the match ends.
  - If the host leaves, everyone gets "The host left" and returns to the title.
  - No host migration and no reconnecting.
- **Match end online:** the host's "Back to lobby" returns everyone to the lobby.
- **Seat colors by seat index:** `['#4de3ff', '#ff9a3d', '#ff4d8d', '#7dff6a']`. Bots take the names `Pixel`, `Rook`, `Moss` in order and the color of their seat.
- **Controls during play:** only ←/A and →/D (scheme `'both'`). There is no 2-player-per-laptop mode online.
- **Code boundaries:**
  - `src/sim/` stays untouched and pure.
  - `src/net/` has no DOM access except `peer.ts`, and no rendering.
  - Handling numbers in `TUNING` do not change.
- **Online slow motion:** off in v1. Host-side slow motion would slow everyone's game. This is a deviation from §4.7, so Task 8 records it in the spec for the user to confirm.
- `npm test` and `npm run build` must pass at every commit. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Never push or deploy without the user's explicit go-ahead.** Task 2 ends at a user gate.

## Review Focus

1. **Typed codes:** lowercase, spaces or a stray dash all still join. A code with O, I or a digit is refused right away with "Check the code" and no network wait. Task 1 has the tests `normalizeCode accepts messy input` and `normalizeCode rejects ambiguous letters`.
2. **A room that doesn't exist:** the joiner sees "Room not found" within 8 s and stays on the title screen. Task 3 has `join unknown code rejects`. Task 2 also maps PeerJS `peer-unavailable` to this error.
3. **The host's tab goes into the background:** the host stops sending, and joiners would freeze silently. Joiners must show "Waiting for host…" after 2 s with no snapshot. Task 5 has `stale after 2s without snapshots`.
4. **A joiner's tab comes back from the background:** the snapshot buffer is stale. It must jump to the newest snapshot, not replay old ones. Task 5 has `buffer drops snapshots older than the newest pair`.
5. **A joiner leaves mid-round:** their car keeps driving as a bot, the match continues for the others, and the feed says "<name> left". Task 4 has `leaver becomes a bot mid-match`.

---

### Task 1: Transport interface, loopback, room codes

**Files:**
- Create: `src/net/transport.ts`, `src/net/loopback.ts`, `src/net/code.ts`
- Test: `tests/net-code.test.ts`, `tests/net-loopback.test.ts`

**Interfaces:**
- Produces in `transport.ts`:
  ```ts
  export type PeerId = string;
  export interface Link {
    readonly code: string;
    readonly isHost: boolean;
    /** Host: to one peer, or every peer when `to` is omitted. Joiner: always to the host. */
    send(msg: unknown, to?: PeerId): void;
    onMessage(cb: (from: PeerId, msg: unknown) => void): void;
    /** Host only: a joiner connected. */
    onJoin(cb: (peer: PeerId) => void): void;
    /** Host: a joiner left. Joiner: the host left (peer = host). */
    onLeave(cb: (peer: PeerId) => void): void;
    /** Host only: drop one joiner. */
    kick(peer: PeerId): void;
    close(): void;
  }
  export interface Transport {
    createRoom(): Promise<Link>;
    joinRoom(code: string): Promise<Link>;
  }
  export class RoomError extends Error {
    constructor(readonly kind: 'not-found' | 'network' | 'taken', message: string);
  }
  ```
- Produces in `code.ts`:
  - `ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'`
  - `makeRoomCode(rand: () => number): string`, which returns 4 letters from the alphabet.
  - `normalizeCode(input: string): string | null`. It uppercases, removes whitespace and `-`, and returns null unless the result is exactly 4 letters from the alphabet.
  - `peerIdFor(code: string): string`, which returns `graze-${code}`.
- Produces in `loopback.ts`: `class LoopbackHub`.
  - `transport(): Transport` gives each player its own transport.
  - `flush(): void` delivers queued messages, joins and leaves in order.
  - Each message goes through `JSON.parse(JSON.stringify(msg))`, so non-serialisable data fails in tests.
  - Joining an unknown code rejects with `RoomError('not-found')`.

- [ ] **Step 1: Write the failing tests:**
  - `makeRoomCode gives 4 alphabet letters` runs 200 random draws. Every draw matches `/^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/`.
  - `normalizeCode accepts messy input`:
    - `' kq-zt '` gives `'KQZT'`.
    - `'kqzt'` gives `'KQZT'`.
  - `normalizeCode rejects ambiguous letters`:
    - `'KQ0T'`, `'KQIT'` and `'KQOT'` each give null.
    - `'KQZ'` gives null.
    - `'KQZTA'` gives null.
  - `loopback delivers both ways`:
    1. The host creates a room and a joiner joins it.
    2. After `flush()`, the host's `onJoin` has fired once.
    3. The joiner sends `{a:1}` and the host broadcasts `{b:2}`.
    4. After `flush()`, each side received the other's message.
  - `loopback leave`: the joiner calls `close()`. After `flush()`, the host's `onLeave` fires with the joiner's id. If the host calls `close()` instead, the joiner's `onLeave` fires.
  - `join unknown code rejects`: `joinRoom('ZZZZ')` rejects with a `RoomError` whose kind is `'not-found'`.
- [ ] **Step 2:** Run `npx vitest run tests/net-code.test.ts tests/net-loopback.test.ts`. Expected: FAIL, because the modules don't exist yet.
- [ ] **Step 3:** Implement the three files.
- [ ] **Step 4:** Run the same command again. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat(net): transport interface, loopback hub, room codes`.

### Task 2: PeerJS transport and the `?nettest` connection check (USER GATE)

**Files:**
- Create: `src/net/peer.ts`, `src/net/nettest.ts`
- Modify: `src/main.ts` (when `?nettest` is in the URL, run the test page instead of the game), `package.json` (`peerjs` 1.5.5 in `dependencies`, exact version)

**Interfaces:**
- Consumes: `Transport`, `Link`, `RoomError`, `makeRoomCode`, `peerIdFor` and `normalizeCode` from Task 1.
- Produces: `export function peerTransport(): Transport`, which loads `peerjs` with `await import('peerjs')`.
  - `createRoom` opens `new Peer(peerIdFor(code))`. On the PeerJS error type `'unavailable-id'` it retries with a new code, up to 5 times, then throws `RoomError('taken')`.
  - `joinRoom` opens `new Peer()` and then `peer.connect(peerIdFor(code), { reliable: true })`. The error type `'peer-unavailable'`, or no open connection within 8000 ms, throws `RoomError('not-found', 'Room not found')`. Other errors throw `RoomError('network', …)`.
  - `close()` destroys the Peer.
- Produces: `runNetTest(root: HTMLElement, t: Transport): void`.
  - The page has Create, a code field and Join.
  - The joiner sends `{t:'ping', at: performance.now()}` every 100 ms for 20 s. The host echoes it back.
  - The page shows a live line: `rtt avg X ms · p95 Y ms · max Z ms · lost N`. Lost means a ping that got no echo within 2 s.
  - When the run ends, it shows `PASS` if p95 < 80 ms and lost = 0, otherwise `CHECK`. Each figure comes with a one-line explanation.

- [ ] **Step 1:** Run `npm install peerjs@1.5.5 --save-exact`. Expected: it installs, and `package-lock.json` is updated.
- [ ] **Step 2:** Implement `peer.ts` and `nettest.ts`, and wire up `?nettest`. No unit test is needed, because this is a thin adapter and the logic it relies on is tested through the loopback in later tasks.
- [ ] **Step 3:** Run `npm run build`.
  - Expected: it passes.
  - Check that the main bundle does not include peerjs. `peerjs` must appear only in a separate chunk in `dist/assets/`. Confirm with `ls dist/assets`.
- [ ] **Step 4:** Check in the browser.
  1. Run `npm run dev`.
  2. Open two tabs at `/?nettest`.
  3. Create in one tab and join in the other with the code.
  4. Expected: an RTT line appears and the run ends in `PASS` on localhost.
- [ ] **Step 5:** Commit with the message `feat(net): PeerJS transport and ?nettest connection check`.
- [ ] **Step 6: USER GATE.** Stop and ask the user to approve a push.
  - After it deploys, they open `https://heelo1909.github.io/graze/?nettest` on two MacBooks on school Wi-Fi and report the result line.
  - If they report PASS, continue with Task 3.
  - If they report CHECK or can't connect, stop. Online needs the Firebase relay first, which is a separate plan.

### Task 3: Protocol and lobby on the host side

**Files:**
- Create: `src/net/protocol.ts`, `src/net/host.ts`
- Test: `tests/net-lobby.test.ts`

**Interfaces:**
- Consumes: `Link` and `PeerId` from Task 1. `Slot`, `Steer` and `SimEvent` from `src/sim/types.ts`. `Difficulty` from `src/bots/bot.ts`.
- Produces in `protocol.ts`. Every message has a `t` tag.
  ```ts
  export const SEAT_COLORS = ['#4de3ff', '#ff9a3d', '#ff4d8d', '#7dff6a'] as const;
  export const BOT_NAMES = ['Pixel', 'Rook', 'Moss'] as const;
  export interface LobbySeat { name: string; color: string }
  export type ToHost = { t: 'hello'; name: string } | { t: 'steer'; s: Steer };
  export type ToJoiner =
    | { t: 'lobby'; seats: LobbySeat[]; bots: boolean; difficulty: Difficulty; you: number }
    | { t: 'refused'; reason: 'full' | 'started' }
    | { t: 'start'; slots: Slot[]; seed: number; you: number }
    | { t: 'snap'; snap: NetSnap }
    | { t: 'left'; seat: number };
  export interface NetCar { x: number; y: number; vx: number; vy: number; heading: number; hold: number; boost: number; alive: boolean }
  export interface NetSnap {
    tick: number; phase: Phase; phaseTime: number; round: number;
    totals: number[]; lastRound: number[]; cutoffTotals: number[];
    time: number; bounds: Bounds; cars: NetCar[]; events: SimEvent[];
  }
  export function isToHost(m: unknown): m is ToHost;
  export function isToJoiner(m: unknown): m is ToJoiner;
  ```
- Produces `class HostSession` in `host.ts`. This task covers the lobby part:
  - `constructor(link: Link, hostName: string)`
  - `seats: LobbySeat[]`. Seat 0 is the host.
  - `bots: boolean`, which defaults to true. `difficulty: Difficulty`, which defaults to `'normal'`.
  - `setBots(on)` and `setDifficulty(d)` each broadcast a fresh `lobby` message.
  - `canStart(): boolean` is true when the car count is at least 2. The car count is 4 with bots on, otherwise the number of seats.
  - `onChange(cb: () => void)` fires on any lobby change, so the UI can repaint.
  - Rules:
    - A joiner must send `hello` before it gets a seat.
    - A `hello` arriving when 4 seats are taken gets `refused/full` and then a kick.
    - A `hello` arriving after start gets `refused/started` and then a kick.
    - A joiner leaving in the lobby frees its seat, and later seats move up.
    - Every seat change sends each joiner a `lobby` message with its own `you` index.
    - Names are trimmed and cut to 12 characters. An empty name becomes `Player N`.

- [ ] **Step 1: Write the failing tests** with `LoopbackHub`:
  - `joiners get seats and colors in order`: after 2 hellos, `seats` has 3 entries named host, `a` and `b`, with colors `SEAT_COLORS[0..2]`. Joiner `b`'s last message is a `lobby` with `you: 2`.
  - `fifth player refused full`: the 5th hello gets `{t:'refused', reason:'full'}`, and its `onLeave` fires after `flush()`.
  - `leaving in lobby frees the seat`: the joiner in seat 1 closes. `seats.length` drops to 2, and the former seat 2 now gets `you: 1`.
  - `cannot start alone without bots`: with only the host, `bots=false` makes `canStart()` false. With `bots=true` it is true.
  - `messages survive JSON`: covered by the loopback, so no extra code is needed. Assert that a `lobby` message deep-equals what was sent.
- [ ] **Step 2:** Run `npx vitest run tests/net-lobby.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `protocol.ts`, then the lobby part of `HostSession`.
- [ ] **Step 4:** Run `npx vitest run tests/net-lobby.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat(net): protocol and host lobby`.

### Task 4: Host match loop: steering in, snapshots out, leavers become bots

**Files:**
- Modify: `src/net/host.ts`
- Test: `tests/net-host.test.ts`

**Interfaces:**
- Consumes: `createMatch`, `stepMatch` and `Match` from `src/sim/match.ts`, and `botSteer`, `newBotMemory` and `BotMemory` from `src/bots/bot.ts`.
- Produces on `HostSession`:
  - `start(seed: number): Match`. It builds the slots: the seats as humans (`isBot: false`), then, if bots are on, bots up to 4 cars, named from `BOT_NAMES` in order with the color of their seat. It sends each joiner a `start` with its own `you`, and returns the match.
  - `step(localSteer: Steer): SimEvent[]`. It steps the match once at DT.
    - Seat 0 uses `localSteer`.
    - Each joiner uses its last `steer`, or 0 if it hasn't sent one.
    - Bots use `botSteer(world, i, mem, difficulty)` and run only during `play`, when their car is alive.
    - Every 2nd tick it broadcasts `{t:'snap'}` with the events gathered since the last snapshot.
    - It returns this tick's events for the host's own renderer.
  - `match: Match | null`.
  - `toLobby(): void`. It is allowed only in `matchEnd`. It clears the match and broadcasts `lobby`.
  - A joiner leaving mid-match makes `slots[seat].isBot` and `world.cars[seat].isBot` true. Its seat then uses `botSteer`, and the host broadcasts `{t:'left', seat}`.
  - A `steer` from a peer with no seat is ignored.
- Constants: `SNAP_EVERY_TICKS = 2` and `MAX_CARS = 4` go in `TUNING` as `NET_SNAP_EVERY_TICKS` and `NET_MAX_CARS`.

- [ ] **Step 1: Write the failing tests:**
  - `start builds human then bot slots`:
    - With the host plus 1 joiner and bots on, the slots are `[host, a, Pixel, Rook]`. `isBot` is `[false,false,true,true]`, and the colors are `SEAT_COLORS`.
    - With bots off, there are 2 slots.
  - `snapshots at 30 Hz carry trail events`:
    - Step 4 s.
    - The joiner receives about 120 snaps, within ±2. `snap.tick` strictly increases.
    - The total `trail` events across all snaps equals the number the host's `step` returned.
  - `joiner steer moves its car`: the joiner sends `{t:'steer', s:1}`. After 1 s of play, `world.cars[1]` has turned, and its heading changed by more than 0.5 rad from the start.
  - `leaver becomes a bot mid-match`:
    - Joiner 1 closes during play.
    - `slots[1].isBot` becomes true, and the other joiner receives `{t:'left', seat:1}`.
    - Stepping 5 more seconds throws nothing.
  - `toLobby only at match end`: calling it during play doesn't change the state. In `matchEnd` it broadcasts `lobby`.
- [ ] **Step 2:** Run `npx vitest run tests/net-host.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run `npx vitest run tests/net-host.test.ts`, then `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat(net): host match loop, snapshots and leaver bots`.

### Task 5: Joiner mirror, interpolation buffer, own-car prediction

**Files:**
- Create: `src/net/client.ts`, `src/net/snapbuf.ts`, `src/net/predict.ts`
- Test: `tests/net-snapbuf.test.ts`, `tests/net-predict.test.ts`, `tests/net-client.test.ts`

**Interfaces:**
- Consumes: the `NetSnap` and `ToJoiner` messages from Task 3, `createMatch`, `createWorld` and `stepCar`, and `lerp` and `lerpAngle` from `src/render/interp.ts`.
- Produces in `snapbuf.ts`: `class SnapBuffer`.
  - `push(snap: NetSnap, at: number)`, where `at` is the receive time in seconds.
  - `poses(now: number): NetCar[] | null` gives the car poses at `now - NET_INTERP_DELAY_S`. It interpolates between the two snaps around that time, holds the newest snap if the time is past it, and returns null when empty.
  - `stale(now: number): boolean` is true when the newest snap is more than `NET_STALE_S` old.
  - Keeps only the snaps it needs. Anything older than the pair surrounding the render time is dropped.
- Produces in `predict.ts`: `class Predictor`.
  - `reset(car: Car)`.
  - `step(steer: Steer)` runs `stepCar(car, steer, DT)`.
  - `correct(host: NetCar)`:
    - If the distance is more than `NET_SNAP_DIST`, copy the host's x, y, vx, vy, heading and hold.
    - Otherwise store the error, and blend it out over about `NET_SMOOTH_S` during the following `step` calls, as a fraction `1 - exp(-DT / NET_SMOOTH_S)` per step.
    - Always copy `boost` from the host.
  - `car: Car`.
- Produces in `client.ts`: `class ClientSession`.
  - `constructor(link: Link, name: string)` sends `hello`.
  - `state: 'lobby' | 'refused' | 'playing' | 'hostLeft'`, and `refusedReason: 'full' | 'started' | null`.
  - `lobby: Extract<ToJoiner, {t:'lobby'}> | null`, `you: number`, and `match: Match | null` (the mirror).
  - `onChange(cb)`.
  - `sendSteer(s: Steer)` sends only when the value changes.
  - `takeEvents(): SimEvent[]` empties the events gathered from snaps, for the renderer and audio.
  - `cars(now: number): Car[]` gives the cars to draw.
    - Other cars come from the `SnapBuffer`.
    - Its own car comes from the `Predictor` while the host says it's alive and the phase is `play`.
    - Otherwise its own car is the host's pose.
  - `stepLocal(steer: Steer)` is called at DT by `main`. It advances the predictor only during `play`.
  - On a snap:
    - If `snap.round !== match.round`, replace `match.world` with `createWorld(slots, seed + round)`. A new object makes the renderer reset its trail layer, and the predictor resets to the new spawn.
    - Copy phase, phaseTime, round, totals, lastRound, cutoffTotals, time and bounds.
    - Write the snap's car states into `match.world.cars`, so the HUD sees `alive` and `boost`.
  - On `left`, set `slots[seat].isBot = true` and queue a feed line.
  - On the host leaving, `state` becomes `'hostLeft'`.
- Constants added to `TUNING`:
  - `NET_INTERP_DELAY_S: 0.1`
  - `NET_STALE_S: 2`
  - `NET_SNAP_DIST: 40` (arena units)
  - `NET_SMOOTH_S: 0.1`

- [ ] **Step 1: Write the failing tests:**
  - `SnapBuffer`:
    - `interpolates between two snaps`: snaps at 0.0 and 0.1 have x 0 and 10. `poses(0.15)` gives x 5.
    - `holds newest when ahead`: `poses(5)` gives the last snap's x.
    - `buffer drops snapshots older than the newest pair`: push 50 snaps, then call `poses` near the newest. Its internal length is 3 or fewer.
    - `stale after 2s without snapshots`: `stale(lastAt + 2.01)` is true, and `stale(lastAt + 1.9)` is false.
  - `Predictor`:
    - `small error blends out`: a host pose 10 units off. After 30 steps of steer 0 (0.5 s), the remaining error is under 1 unit on top of the car's own motion. Compare against a twin car stepped the same way.
    - `large error snaps`: a host pose 100 units off. After `correct`, `car.x` equals `host.x`.
  - `ClientSession` (loopback with a real `HostSession`):
    - `mirror follows the host`: host and joiner run 3 s. Pump with `flush()` after each host step, and feed `client.stepLocal(0)` alongside. The joiner's `match.phase`, `round` and `totals` equal the host's, and `cars(now).length` is 4.
    - `new round resets the world object`: the mirror's `world` changes identity when `round` goes up.
    - `host leaving ends the session`: the host closes. After `flush()`, `state` is `'hostLeft'`.
    - `refused when started`: a third joiner after `start` ends in `state === 'refused'`.
- [ ] **Step 2:** Run `npx vitest run tests/net-snapbuf.test.ts tests/net-predict.test.ts tests/net-client.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run the same command, then `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat(net): joiner mirror, snapshot interpolation, own-car prediction`.

### Task 6: Title buttons and the lobby screen

**Files:**
- Create: `src/ui/lobby.ts`
- Modify: `src/ui/screens.ts` (title), `index.html` (styles for the lobby, flat, matching the existing `.seg`/`.primary`/`.ghost`)
- Test: `tests/lobby-ui.test.ts` (jsdom)

**Interfaces:**
- Consumes: `LobbySeat` and `Difficulty`, and `normalizeCode` from Task 1.
- Produces:
  - The title gets a `.row.online` under Play. It has a `Create Room` button and a `Join Room` button. Join reveals a code field with a `Go` button.
  - `opts.onCreate(name)` and `opts.onJoin(name, code)` are added to `showTitle`'s options. A code that `normalizeCode` rejects shows `Check the code` under the field and does not call `onJoin`.
  - `showTitleError(root, message)` shows a message line on the title.
  - `showLobby(root, view: LobbyView, h: LobbyHandlers): void`, where:
    ```ts
    interface LobbyView { code: string; seats: LobbySeat[]; isHost: boolean; you: number; bots: boolean; difficulty: Difficulty; canStart: boolean }
    interface LobbyHandlers { onStart(): void; onLeave(): void; onBots(on: boolean): void; onDifficulty(d: Difficulty): void }
    ```
    - It shows the code in large text with a `Copy` button, which uses `navigator.clipboard.writeText` and shows "Copied".
    - It lists 4 rows: each seat's name in its color, with "(you)" on your own row, and empty rows as `Bot` when bots are on or `—` when off.
    - The bots toggle, difficulty and `Start` (disabled when `!canStart`) render only for the host.
    - Joiners see `Waiting for the host to start…`.
    - Everyone gets `Leave`.

- [ ] **Step 1: Write the failing tests:**
  - `join with a bad code shows the hint`: fill `kq0t` and click Go. The hint text is `Check the code`, and `onJoin` is not called.
  - `join with a messy good code`: fill ` kqzt ` and click Go. `onJoin` is called with `'KQZT'`.
  - `lobby shows host controls only to host`: a host view has a Start button. A joiner view has no Start button and does show the waiting text.
  - `start disabled when canStart is false`.
  - `empty seats show Bot or dash`: with 2 seats, bots on gives 2 `Bot` rows, and bots off gives 2 `—` rows.
- [ ] **Step 2:** Run `npx vitest run tests/lobby-ui.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement it. Set user names only with `textContent`.
- [ ] **Step 4:** Run `npx vitest run tests/lobby-ui.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat(ui): online title buttons and lobby screen`.

### Task 7: Wire online play into the game loop

**Files:**
- Create: `src/online.ts`, which runs the online flow so `main.ts` doesn't grow past about 250 lines
- Modify: `src/main.ts`, `src/ui/screens.ts` (`showMatchEnd` online variant: host gets `Back to lobby`, joiners get `Waiting for host…`, and everyone gets `Leave`), `src/render/hud.ts` (`Waiting for host…` overlay when stale)

**Interfaces:**
- Consumes: everything from Tasks 1–6, plus `Renderer`, `Input`, `Audio` and `CarInterp` as they are today.
- Produces: `startOnline(deps: OnlineDeps, mode: { kind: 'host'; name: string } | { kind: 'join'; name: string; code: string }): OnlineGame`, where:
  ```ts
  interface OnlineDeps { ui: HTMLElement; renderer: Renderer; input: Input; audio: Audio; transport: Transport; toTitle(error?: string): void }
  interface OnlineGame { frame(now: number, frameDt: number): void; leave(): void }
  ```
  `main.ts` holds one of `local | online`, and its `frame` calls `online.frame` when online.
- **Host frame:**
  - The same fixed-step accumulator as local play, with no slow motion.
  - Each step calls `session.step(input.steer())`, then `renderer.onEvents(events, match)` and the same audio reactions as local.
  - Draws with `CarInterp`.
  - `renderer.setLocal([0])`.
- **Joiner frame:**
  - Fixed steps call `client.stepLocal(input.steer())` and `client.sendSteer(input.steer())`.
  - Each frame calls `renderer.onEvents(client.takeEvents(), match)` and the audio reactions, then `renderer.draw(match, now, client.cars(now))`.
  - `renderer.setLocal([you])`.
  - When `SnapBuffer` is stale, the HUD shows `Waiting for host…`.
- **Leaving and errors:**
  - Leave, or closing the tab (`pagehide`), calls `link.close()`.
  - `hostLeft` goes to `toTitle('The host left')`.
  - `refused` goes to `toTitle('That room is full')` or `toTitle('That game already started')`.
  - A `RoomError` from create or join goes to `toTitle(error.message)`.
- The debug hook gains `__graze.online()`, which returns the session state and seat count.

- [ ] **Step 1:** Implement `online.ts` and wire it in. The pieces are already tested headlessly.
- [ ] **Step 2:** Run `npm test && npm run build`. Expected: PASS.
- [ ] **Step 3:** Check in the browser.
  1. Run `npm run dev`. In two tabs, create in A and join in B with the code.
  2. Confirm the lobby lists both in their colors, and Start in A begins the countdown in both tabs.
  3. Steer in B. B's car responds immediately, and A sees it move.
  4. Close B mid-round. A's feed shows "<name> left" and B's car keeps driving.
  5. Restart, then close A. B returns to the title with "The host left".
  6. Confirm the console is clean in both tabs.
  7. Record the frame time from `?debug` in A during a busy round. It should be under 16.7 ms.
- [ ] **Step 4:** Commit with the message `feat: online play — host and join via room code`.

### Task 8: Spec, docs and harness notes

**Files:**
- Modify: `sections.md`, `CLAUDE.md`, `README.md`

- [ ] **Step 1:** In `sections.md` §4.7, add: "Online (v1): no slow motion, since the host's slow motion would slow everyone. Banners and the tether still play. Confirm with the user." In §5.2, add the measured values: the interpolation delay of 100 ms, the snap distance of 40 units, and the result of the `?nettest` school run from Task 2.
- [ ] **Step 2:** In `CLAUDE.md`:
  - Current plan: point at this file.
  - Harnesses: add "Netcode: `tests/net-*.test.ts` run host and joiner over `LoopbackHub`. Any change to `src/net/` keeps them green. For real connections, use `?nettest` (two tabs, or two MacBooks on the school Wi-Fi)."
  - Architecture: add "`src/net/` has no DOM except `peer.ts`. The host is authoritative, and joiners never decide crashes."
- [ ] **Step 3:** In `README.md`, add a "Play online" section: Create Room, share the code, Join, and the host presses Start.
- [ ] **Step 4:** Run `npm test && npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit with the message `docs: online play in spec, CLAUDE.md and README`.
