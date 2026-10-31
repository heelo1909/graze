# Graze Same-Keyboard 2-Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two people play on one MacBook: P1 steers with A/D and P2 with ←/→, and 2 bots fill the remaining seats.

**Architecture:** The sim is unchanged, because a `Slot` with `isBot: false` is already a human. The new idea is **local players**: `local: number[]`, the car ids steered on this device. It replaces the single `humanId(m)` everywhere outside `src/sim/`, which also prepares for online play (milestone 2b, where each device has its own `local`). Input gains steering schemes so that one keyboard can drive two cars.

**Tech Stack:** Vite 5, TypeScript 5 strict, Vitest 2 (jsdom for input/UI tests).

**Spec:** `sections.md` (Task 3 adds the couch-mode rules to it).

## Global Constraints

- During play the controls are only steer left and steer right, per player. There are no other buttons during play.
- Solo mode keeps today's controls exactly: ←/A steer left, →/D steer right.
- In 2-player mode, **P1 uses A/D** and **P2 uses ←/→**. In that mode, A/D never steer P2 and the arrow keys never steer P1.
- There are always 4 cars. In 2-player mode the slots are `[P1, P2, bot, bot]`. P1 is `#4de3ff` and P2 is `#ff9a3d`. The two bots are the first two of `BOTS` (Pixel and Rook).
- `src/sim/` stays pure and untouched. No handling numbers change (`BASE_SPEED`, `TURN_*`, `GRIP_*`, `HOLD_*`, `BOOST_*`).
- The `npm test` and `npm run build` commands must both pass, and `npm run sim -- --rounds 100` must give the same output as before, because the sim is untouched.
- Commits are small and use the `feat(...)`/`test:` style. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Both players holding keys at once:** if P1 holds A and P2 holds →, each car turns on its own, with no cancelling and no swapping. Task 1 has the test `two schemes read independently`.
2. **Going from 2P back to solo:** the next solo match steers with both arrows and A/D again. Task 3 adds a test for `localSchemes(1)`.
3. **Window blur or Cmd chords during a 2P match:** both players' keys are released, so nobody's car keeps turning. The existing `releaseAll` covers this, and Task 1 adds a test with keys from both schemes.
4. **Text depends on the number of local players:** with 2 local players, no car is labelled "YOU", the end heading never says "You win", and crashes go to the feed. With 1 local player, everything is exactly as it is today. Task 2 tests both cases.
5. **Typing a name and then playing 2P:** the name box is P1's name. P2 is always "P2". Typing in the box never steers either car, which the existing `inField` guard handles.

---

### Task 1: Steering schemes in Input

**Files:**
- Modify: `src/input.ts`
- Test: `tests/input.test.ts`

**Interfaces:**
- Produces: `export type Scheme = 'both' | 'ad' | 'arrows'`, and `Input.steer(scheme: Scheme = 'both'): Steer`.
  - `'both'` means ←/A and →/D, which is today's behaviour.
  - `'ad'` means only KeyA/KeyD.
  - `'arrows'` means only ArrowLeft/ArrowRight.

- [ ] **Step 1: Write the failing tests** in `tests/input.test.ts`:
  - `scheme ad ignores arrows`: press ArrowLeft, then expect `steer('ad')` to be 0. Press KeyD, then expect `steer('ad')` to be 1.
  - `scheme arrows ignores A/D`: press KeyA, then expect `steer('arrows')` to be 0. Press ArrowLeft, then expect `steer('arrows')` to be -1.
  - `two schemes read independently`: press KeyA and ArrowRight. Expect `steer('ad')` to be -1, `steer('arrows')` to be 1, and `steer('both')` to be 0.
  - `releaseAll clears both schemes`: press KeyD and ArrowLeft, then dispatch `blur` on window. Expect both schemes to read 0.
- [ ] **Step 2:** Run `npx vitest run tests/input.test.ts`. Expected: the new tests FAIL, because `steer` ignores its argument.
- [ ] **Step 3:** Implement `steer(scheme)`, keeping a key table per scheme.
- [ ] **Step 4:** Run `npx vitest run tests/input.test.ts`. Expected: all tests PASS, including the old ones.
- [ ] **Step 5: Commit** with the message `feat(input): per-player steering schemes`.

### Task 2: Local players replace the single human

**Files:**
- Modify: `src/render/hud.ts`, `src/render/renderer.ts`, `src/loop.ts`, `src/ui/heading.ts`, `src/ui/screens.ts` (the `showMatchEnd` call to `matchHeading`), `src/main.ts` (callers only)
- Test: `tests/announce.test.ts`, `tests/heading.test.ts`, `tests/loop.test.ts`

**Interfaces:**
- Removes `humanId(m)`.
- Every function that took a single human id now takes `local: number[]`:
  - `announce(e, m, local: number[]): Announcement | null`
  - `triggersSlowmo(events, local: number[]): boolean`
  - `roundWinJingle(roundWinner, local: number[], matchDecided): boolean`
  - `matchWinJingle(matchWinnerId, local: number[]): boolean`
  - `matchHeading(slots, winner, local: number[]): string`
  - `showMatchEnd(root, m, local: number[], onAgain, onMenu)`
- `Renderer.draw(m, realTime, cars?)` reads `local` from a new setter, `Renderer.setLocal(local: number[]): void`. The HUD gets it the same way, through `Hud.local: number[]`, which the renderer keeps current.
- Rules:
  - **`me`:** the single local id when `local.length === 1`, otherwise none.
  - **Banners and "YOU" labels:** only when there is a `me`. With 2 or more local players, every crash is a feed line and every car shows its slot name.
  - **Slow motion:** when a crash involves any local car, as victim or as `by`.
  - **Jingles:** play when the winner is any local id.
  - **`matchHeading`:**
    - "You win" if the winner is the single local id.
    - Otherwise "<Name> wins" for a winner that isn't a bot, including P1 and P2.
    - "<Name> wins" for a bot, as before.
    - "Match over" for no winner.

- [ ] **Step 1: Update the tests to the new signatures and add the two-local cases:**
  - `announce`: with `local [0,1]`, a trail crash of car 1 by car 0 returns `{kind:'feed'}` with the parts `P1`, ` cut off `, `P2`. With `local [0]`, every existing case is unchanged.
  - `matchHeading`:
    - With `local [0,1]`, slots P1 and P2 both human, and winner 1, it returns `'P2 wins'`.
    - With `local [0]` and winner 0, it returns `'You win'`.
  - `triggersSlowmo`: with `local [0,1]`, a crash of car 3 by car 1 returns true.
  - `matchWinJingle`: winner 1 with `local [0,1]` returns true. `local []` returns false.
- [ ] **Step 2:** Run `npx vitest run tests/announce.test.ts tests/heading.test.ts tests/loop.test.ts`. Expected: the tests FAIL with type errors or wrong results.
- [ ] **Step 3:** Implement the new signatures. In `main.ts`, keep solo behaviour by passing `local = [0]` for now.
- [ ] **Step 4:** Run the focused tests, then `npm test && npm run build`. Expected: all PASS and the build succeeds.
- [ ] **Step 5: Commit** with the message `feat: thread local players through HUD, renderer and screens`.

### Task 3: Players toggle, 2P match setup, spec update

**Files:**
- Create: `src/players.ts`, the pure setup helpers
- Modify: `src/main.ts`, `src/ui/screens.ts`, `src/render/hud.ts` (the hint line), `sections.md`, `CLAUDE.md`
- Test: `tests/players.test.ts`

**Interfaces:**
- Consumes: `Scheme` and `Input.steer(scheme)` from Task 1, and `local: number[]` plumbing from Task 2.
- Produces, in `src/players.ts`:
  - `export type Players = 1 | 2`
  - `buildSlots(players: Players, p1Name: string): Slot[]`
    - With 1 player, it returns today's slots: you in `#4de3ff`, then Pixel, Rook and Moss.
    - With 2 players, it returns `[{P1 name, '#4de3ff'}, {'P2', '#ff9a3d'}, Pixel, Rook]`.
  - `localSchemes(players: Players): Scheme[]`
    - 1 player gives `['both']`.
    - 2 players gives `['ad', 'arrows']`.
    - Index i is the scheme for car i, and `local` is `[0 .. players-1]`.
  - `hintText(players: Players): string`
    - 1 player gives today's `HINT`, moved here from `hud.ts`.
    - 2 players gives `'P1  A D   ·   P2  ← →   ·   hold to drift harder   ·   skim past trails to boost'`.
- Title screen:
  - A "Players" segmented control with the buttons "1 Player" and "2 Players". It is saved as the pref `players`.
  - `onPlay` receives `{ name, difficulty, players }`.
  - With 2 players, the name field label reads "P1 name", and the keys line reads `P1: A D   ·   P2: ← →`.
  - The play button reads "Play" in both modes.
- The debug hook `__graze.start(difficulty, players = 1)`.

- [ ] **Step 1: Write the failing tests** in `tests/players.test.ts`:
  - `buildSlots(1,'Ann')` gives 4 slots, with only slot 0 human, named Ann, in `#4de3ff`.
  - `buildSlots(2,'Ann')` gives slots 0 and 1 as humans named `Ann` and `P2`, slot 1 in `#ff9a3d`, and slots 2 and 3 as the bots `Pixel` and `Rook`.
  - `localSchemes(1)` gives `['both']`, and `localSchemes(2)` gives `['ad','arrows']`.
  - `hintText(2)` contains `'P1  A D'` and `'P2  ← →'`.
- [ ] **Step 2:** Run `npx vitest run tests/players.test.ts`. Expected: FAIL, because the module doesn't exist yet.
- [ ] **Step 3:** Implement `src/players.ts`, then wire it into `main.ts`:
  - `startMatch` uses `buildSlots`, sets `local` and `schemes`, and calls `renderer.setLocal(local)`.
  - In `step()`, a car `i < schemes.length` steers with `input.steer(schemes[i])`. `steerOverride` still applies only to car 0.
  - Audio graze sounds play for any local car.
- [ ] **Step 4:** Add the players toggle to the title screen.
- [ ] **Step 5:** Update the docs:
  - In `sections.md` §2 Goals, add: "Same-keyboard 2-player mode (P1 A/D, P2 ←/→, two bots), added at the user's request 2026-10-31."
  - In `sections.md` §8 Title, add the Players toggle.
  - In the `CLAUDE.md` Controls rule, add the 2P keys.
- [ ] **Step 6:** Run `npm test && npm run build && npm run sim -- --rounds 100 --seed 1`. Expected:
  - All tests pass.
  - The build passes.
  - The sim prints the same numbers as `main` did before this plan. Paste both outputs in the report.
- [ ] **Step 7:** Check in the browser.
  1. Run `npm run dev` and open `?debug`.
  2. Call `__graze.start('normal', 2)`, then `__graze.advance(6)`.
  3. Confirm the cars are labelled `Ann`/`P2`/`Pixel`/`Rook` with no "YOU", the hint line shows the 2P keys, and the console is clean.
- [ ] **Step 8: Commit** with the message `feat: same-keyboard 2-player mode`.
