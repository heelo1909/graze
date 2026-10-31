# Graze

A minimal browser game. Cars drift with only ←/→, leave glowing trails and cut each other off. Up to 4 players (bots fill empty spots). Built with Vite + TypeScript, deployed to GitHub Pages.

- **Spec (the authority):** `sections.md`. If code and spec disagree, the spec wins. If the spec is silent, ask.
- **Current plan:** `docs/superpowers/plans/2026-10-31-graze-couch.md` (milestone 2a: same-keyboard 2-player). Milestone 1 (solo vs bots, `2026-10-31-graze-solo.md`) is done. Online room codes are milestone 2b.

## Commands

| Command | What it's for |
|---|---|
| `npm test` | Every unit, world and balance test. Must be green before any commit. |
| `npx vitest run tests/<file>.test.ts` | One test file. Use this while iterating. |
| `npm run build` | Type-checks (`tsc --noEmit`) and builds. Must pass before any commit. |
| `npm run sim -- --rounds 100 [--seed S] [--camper]` | Headless bot matches. Prints round length, win rates, graze % and tunnel count. |
| `npm run dev` | Runs the game locally. Add `?debug` to the URL for the debug overlay. |

## Harnesses: use them, don't guess

1. **Unit tests** (`tests/*.test.ts`). Test-first: write the failing test, watch it fail, implement, watch it pass. Record the RED and GREEN output in your report.
2. **Balance harness** (`tests/balance.test.ts` and `npm run sim`). These are the source of truth for game balance.
   - Targets: mean round length **20–40 s**; the edge camper's win rate **≤** the best normal bot's; **0** tunnel-throughs; no exceptions over 100+ rounds.
   - Run `npm run sim` **before and after** any change to `src/config.ts`, collision or bots, and paste both outputs into your report or commit message.
3. **Tunnel regression test.** Cars must never pass through a trail. Any change to the grid, stamping, nose checks or speeds must keep this test green.
4. **Debug overlay** (`?debug`): FPS and frame time, nose samples, occupied grid cells, current bounds. Use it to check rendering and collision by eye. Never ship it switched on by default.
5. **Browser check:** for anything visual or input-related, run the game and check it in **Chrome and Safari**. Frame time must stay under 16.7 ms at the busiest point of a round on a MacBook Air M4.

Never say something works without running the harness that proves it. Report failures with their output.

## Architecture rules

- `src/sim/` is pure and headless: no DOM, no canvas, no `Math.random`. It uses `w.rng` (seeded) only, so every run is reproducible. Rendering, audio, input and screens only *consume* sim events.
- Fixed timestep: the sim always steps at `DT = 1/60`. The frame loop uses `stepsFor()` (capped at 0.25 s).
- **Every gameplay number lives in `TUNING`** (`src/config.ts`). No magic numbers in logic.
- Shared types live in `src/sim/types.ts`.
- `car.heading` is never wrapped. Normalise any angle difference to [-π, π].
- Bots use the same handling (`stepCar`) and the same collision as players. No cheating, and no separate physics.
- Keep files small and single-purpose (see the plan's file map). If a file grows past about 300 lines, stop and flag it.

## Things you must not change without the user's OK

- **Handling feel:** `BASE_SPEED`, `TURN_*`, `GRIP_*`, `HOLD_*`, `BOOST_*`. The user approves these by playing.
- Controls: only ←/A and →/D during play (in 2-player mode, P1 A/D and P2 ←/→). No new buttons during play.
- Scope: no power-ups or accounts.
- Never push, create a GitHub repo, or deploy without the user's explicit go-ahead.

## Performance budget (MacBook Air M4, Chrome and Safari)

- 60 fps with 4 cars at peak. Cap device pixel ratio at 2.
- Never use `shadowBlur` or `ctx.filter` in the frame loop. The look is flat and minimal (no bloom, no big glows); keep it that way unless the user asks.
- Draw trails once onto a stored layer, in arena units. Don't redraw all trails every frame.

## Working efficiently

- Read the relevant section of `sections.md` and the plan task before coding. Don't re-read the whole repo.
- Run only the focused test while iterating. Run the full `npm test && npm run build` once before committing.
- Make small commits, one concern each: `feat(sim): …`, `fix(render): …`, `tune: …` (include sim before/after numbers), `test: …`.
- Line endings are LF (`.gitattributes`). Don't renormalise files you didn't otherwise touch.
- When a balance target can't be met with the allowed levers, stop and report the measurements. Don't weaken a test to make it pass.
