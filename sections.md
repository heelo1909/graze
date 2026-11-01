# Graze: design

A browser game for a student and their classmates. Drift around a dark neon arena using only left and right, leave a glowing trail behind you, and cut each other off. Close calls are rewarded. Built for GitHub Pages, with 2–4 players per game and bots filling the empty spots.

Two throwaway test versions came before this doc. Their code is in `../snare-spike/` and `../graze-spike/` (the playable link was https://claude.ai/artifact/Pmy5nocWUg24E6bQk3MFZy). Read `graze-spike/index.html` before building. It has working versions of the drift handling, trail collision, bot AI and visual style described below. Rebuild those properly; don't copy the file wholesale.

---

## 1. Intent and why

- **Who it's for:** the user and their classmates, playing on school laptops (MacBook Air M4 is the reference machine) at lunch or in free periods.
- **Why:** a classmate made a drift game with only left/right controls, and everyone loved it because that one mechanic felt great. This game aims for that same feel (the slide, threading a gap, barely missing a wall) in a different kind of game. It is **not** a racing game.
- **What success looks like:** classmates choose to play it, say "one more round", and argue about who cut off whom.

### What the test versions showed

| Test | What happened | What we learned |
|---|---|---|
| Snare (orb grab + hidden traps) | Not fun. When you caught someone, other players picked up the orbs. It had several mechanics but no single one felt good. | Rewards must go to the player who made the play. One mechanic done really well beats several mediocre ones. |
| Graze test v1 | Everyone spawned facing the center, so cars crashed head-on in the first 2 seconds. | Spawn everyone circling the same direction along the edges. |
| Graze test v2 | The winner could crash just after winning and lose the round. | Lock in the winner the moment the last rival dies. |
| Graze test v2 | **Edge camping:** hugging the arena wall is safe, and nobody comes after you. | The arena itself has to push players inward (section 4). |
| Graze test v2 | The user liked it: "threading those gaps is exactly the fun part". | Keep gaps in trails, and keep the near-miss boost. |

## 2. Goals, non-goals, anti-goals

**Goals**
- Two controls only: steer left and steer right. Holding a direction slides harder. No other buttons during play.
- Online multiplayer for 2–4 players via a short room code, with bots filling the empty spots, plus solo play against bots.
- Same-keyboard 2-player mode: P1 steers with A/D, P2 with ←/→, and two bots fill the other seats (added at the user's request, 2026-10-31).
- Graphics that look clean and polished but run smoothly on a MacBook Air M4 in Chrome and Safari.
- Short rounds (about 20–40 seconds) and matches of about 3–5 minutes.

**Non-goals (not in v1)**
- Accounts, logins, saved stats, leaderboards.
- More than 4 players in a game.
- Power-ups or items. They can be considered later, after the core feels right.
- Touch, phones, tablets or Chromebooks. Everyone plays on MacBooks (confirmed by the user), so keyboard only.

**Anti-goals (these would make it a failure even if it technically works)**
- Extra buttons or menus during play.
- Graphics so heavy the fan spins up or the frame rate drops on a MacBook Air.
- Playing it safe (edge camping, circling) as a winning strategy.
- Online play that feels laggy when you steer.
- Being a straight copy of Curve Fever. The drift handling and the near-miss boost are what make it this game.

## 3. Constraints

- **Hosting:** GitHub Pages. Static files only, no server code.
- **Players:** 2–4 per room. Bots fill the empty spots up to 4. The host decides whether bots are on.
- **Devices:** MacBooks only (confirmed by the user), in Chrome and Safari. The reference machine is a MacBook Air M4. Target 60 fps; 120 Hz screens are a bonus.
- **Network:** school Wi-Fi may block direct browser-to-browser connections. See section 5.
- **Cost:** free.

## 4. The game

### 4.1 Core loop
1. Everyone spawns along the edges, all circling the same direction (this stops early head-on crashes).
2. A 3-2-1 countdown. Cars sit still and show a faint line in the direction they will move.
3. Cars always move forward. You can only steer.
4. Each car leaves a glowing trail in its color. Hitting any trail, a wall or another car means you're out for the round.
5. The round ends when one car is left (or none). The winner is locked in the moment the last rival goes out, and can't crash or leave the arena during the short pause that follows.
6. Scores are shown, then the next round starts automatically.

### 4.2 Handling (the core mechanic, so tune it carefully)
- **Tap** left or right to steer a little.
- **Hold** to turn harder while the car loses grip and swings out into a slide. Show the car body pointing one way while it moves another, with sparks off the back.
- The test version's numbers are a good starting point: base speed 185 px/s on a 1200×760 arena, turn rate 2.0 rad/s rising to 4.8 when fully held, grip falling from 9 to 2.5 as the hold builds up over 0.5 s. Speed stays the same during a slide.
- Expect the handling to need adjusting by actually playing it. Keep these values in one config object so they're easy to change.

### 4.3 Trails and gaps
- A trail is solid except for a short gap every 1.6–2.8 s (random), about 0.2 s long, which lets skilled players slip through.
- Your own most recent trail (about the last 0.3 s) doesn't count as a hit, so you can't crash into the piece you just laid.

### 4.4 Close calls (the reward for daring)
- Skimming past any trail or wall **without touching it** charges your boost meter, and you speed up (up to +60%). Sparks fly from the trail you're skimming, in its owner's color, with a rising tone.
- **Walls charge much less boost than trails** (or none at all). Otherwise hugging the wall becomes the best strategy.
- Boost drains slowly when you're not grazing.

### 4.5 Stopping edge camping (required)
In the test version, driving around the edges was safe. v1 must make it a losing strategy:
- **The arena shrinks.** After about 12 s into a round, the walls glow a warning, then slowly close in to around 55% of their original size over roughly 20 s. Trails left outside the shrinking edge stay deadly. A car that hugged the old edge ends up pinned against the new wall with its own trail around it.
- **Edges don't pay.** Walls give little or no close-call boost (see 4.4), so the speed advantage comes from playing near other people's trails.
- **Bots target campers.** A bot whose path is clear will try to cut off whichever rival has spent the longest near the edge.
- The builder picks the exact timings, but they must be tested: in a simulated round, a bot that only follows the edge must not win more often than an ordinary bot.
- **Shrink details (my call):** the arena stays a rectangle and shrinks evenly toward the center. The shrinking wall works exactly like the outer wall: it's deadly, it's drawn, and touching it means you're out. Trails already drawn stay where they are, so the stored trail layer covers the full original arena.

### 4.6 Scoring (rewards go to whoever made the play)
- **Points each round:** +1 for every car that goes out before you. That's 3 points for the winner of a 4-player round.
- **+1 for a cut-off:** if someone hits your trail, you get a point. This keeps the sneaky reward the user liked from the first test. Hitting your own trail or a wall gives nobody a point.
- **Match:** first to 10 points with 4 players, 7 with 3, 5 with 2 (bots count as players).
- **Edge cases (my call):**
  - Cars that go out on the same tick don't score off each other.
  - The cut-off point goes to the trail's owner even if that owner is already out.
  - If two or more players reach the target in the same round, play more rounds until one of them leads alone.

### 4.7 Showing who got whom
Keep this from the test versions, since it's the moment that gets people yelling:
- When someone hits your trail: a dashed line in your color points from the crash to your car, a brief slow motion plays (only on screens of the players involved), and a big **"CUT OFF BY ROOK"** / **"YOU CUT OFF PIXEL"** message appears.
- Other crashes show up in a small feed at the side ("Rook cut off Moss", "Pixel crashed").
- Online (v1): no slow motion, since the host's slow motion would slow everyone. Banners and the tether still play. Confirm with the user.

## 5. Multiplayer

### 5.1 Approaches considered

| Approach | How it works | Pros | Cons |
|---|---|---|---|
| **A. Peer-to-peer (PeerJS), one player hosts** *(chosen)* | Browsers connect directly to each other. PeerJS's free public server only helps them find each other. The host's browser runs the game. | Free, no accounts, nothing to keep running, and good latency on the same Wi-Fi. | Some school networks block direct connections, and the game ends if the host leaves. |
| B. Realtime database relay (Firebase or Supabase free tier) | Everyone sends inputs through a hosted database. | Works on almost any network. | Needs an account and keys, and is slower (often 100 ms or more), which hurts the steering feel. |
| C. Own game server (WebSocket on Render or Fly) | A small server runs the game. | Most reliable. | Breaks the GitHub Pages-only constraint, and free tiers fall asleep. |

**Decision (my call, the user can change it):** A first, because it's free, has nothing to maintain, and gives the lowest lag for 2–4 players. Build networking behind one small interface (`createRoom`, `joinRoom`, `send`, `onMessage`, `onLeave`) so that B can be added as a fallback.

**Fallback (approved by the user):** if school Wi-Fi blocks A, use **Firebase Realtime Database (free tier)** as a relay behind the same interface. The user is fine setting up a free Firebase account. The config keys go in the client code, which is normal for Firebase. Lock down database rules so only `rooms/<code>` paths can be written and old rooms expire. The host still runs the game; Firebase only carries messages. Expect more lag on the relay, so the instant-steering prediction (5.2) matters even more there. Test on the actual school network early (see section 9).

### 5.2 How it works
- **Host-authoritative:** the host runs the real game at a fixed 60 Hz. Others send only their steering (-1, 0 or +1) when it changes. The host decides every crash and point.
- **The host sends:** car states about 30 times a second, plus only the new pieces of trail. Joiners smooth movement between updates.
- **Steering must feel instant:** each joiner's own car moves on their screen right away using the same handling code, then quietly corrects toward the host's version. Crashes and points come only from the host.
- **When the joiner's screen and the host disagree (my call):** no rewinding. The joiner's car never crashes on its own screen; it waits for the host's decision. If the host says it crashed, the explosion plays at the host's position. Small position differences are smoothed out over about 100 ms, and larger ones snap. The game logic does not need to be deterministic.
- **Measured values (built in milestone 2b):**
  - Joiners draw other cars 100 ms behind the host (`NET_INTERP_DELAY_S`), interpolating between snapshots at 30 Hz. If no snapshot arrives for 2 s (`NET_STALE_S`), the link counts as stale.
  - Own-car correction: the joiner compares the host's position against the nearest pose in its own last 0.5 s of predicted poses (so network delay doesn't pull the car back). Small errors blend out over about 100 ms (`NET_SMOOTH_S`); errors above 40 units (`NET_SNAP_DIST`) snap. No rewinding.
  - `?nettest` on localhost: rtt avg 0.8 ms, p95 1 ms, lost 0.
  - `?nettest` on school Wi-Fi: pending. Run `?nettest` on two MacBooks on school Wi-Fi. PASS keeps PeerJS; CHECK means build the Firebase relay.
- **Rooms:** "Create" gives a 4-letter code (no confusing letters like O/0 or I/1). "Join" takes a code. The lobby shows who's in (name and color) and the host has a Start button. Empty spots show as bots.
- **Leaving:** a player who leaves mid-game is replaced by a bot. If the host leaves, the game ends for everyone with a clear message. No host migration in v1.
- **Joining (my call):** players can join only while the room is in the lobby. Once the host presses Start, the room is closed until the match ends and everyone returns to the lobby. A bot that replaced a leaver keeps that spot until the match ends. No reconnecting in v1.

## 6. Bots
- Bots use the same handling as players and play fair: they only see what's on the map, and they react the way a player would.
- **Steering:** like the test version. A few times a second, the bot simulates holding left, nothing and right for about 1 s, and picks the curve that survives longest.
- **Aggression:** when its path is clear, a bot tries to cut across a nearby rival's path, but only if it will get there first and the curve is safe. Bots should also target edge campers (4.5).
- **Difficulty:** one setting (Easy / Normal / Hard) that changes reaction time and how far ahead they plan. Default Normal.
- Bots get short names and their own colors.

## 7. Look and sound

- **Style:** minimal neon. A near-black arena, a faint grid, glowing trails in each player's color, small arrow-shaped cars with a soft glow, and a vignette around the edges. Effects include sparks, crash bursts, ring shockwaves, light screen shake, speed streaks when boosted, and the shrinking-wall warning glow.
- **"Way better graphics" than the test:**
  - real bloom on trails and cars (a cheap blur of a smaller copy of the bright parts)
  - crashes that break into glowing line pieces
  - a faint glowing trail that briefly shows where the car has been
  - smooth transitions between rounds
  - a polished title screen and lobby with real typography
- **Performance budget:** steady 60 fps on a MacBook Air M4 with 4 players at the busiest point of a round. Draw each trail piece once onto a stored layer instead of redrawing all trails every frame. Use pre-drawn glow images and avoid built-in canvas blur effects inside the frame loop. Cap the pixel density at 2×. The builder chooses between Canvas 2D and WebGL, but 2D proved fast enough in the test.
- **Sound:** short generated sounds (no audio files needed): a graze tone that rises with boost, crash, countdown ticks, round win. Add one mute toggle on the title screen. Sound starts after the first click or key press.

## 8. Screens and flow
1. **Title:** the name, a one-line pitch, a 1 Player / 2 Players switch (same keyboard), buttons for Play vs Bots, Create Room and Join Room, a name field (saved in the browser), and the mute toggle.
2. **Lobby (online):** room code in large text with a copy button, the list of players, a bots on/off and difficulty setting (host only), and Start (host only).
3. **Game:** player names with points along the top, the round number, your boost bar, the crash feed, and a reminder of the controls at the bottom. Nothing else.
4. **Round end:** the order players went out and points earned, about 2.5 s, then the next round.
5. **Match end:** the winner, final standings with cut-offs, and Play Again (online, everyone returns to the lobby).

## 9. Build and deploy
- Vite + TypeScript, no UI framework, deployed to GitHub Pages by a GitHub Actions workflow. PeerJS from npm.
- Keep the game simulation (handling, collisions, scoring, bots) separate from drawing and networking, so the host, solo mode and test simulations all run the same code.
- **Build order (my call):** build solo play against bots first. The user plays it and approves the handling (turning, slide, speed, boost) before work on networking or graphics polish starts. "Feels great" is the user's decision, not a number.
- **Early checks to do before polishing:**
  1. Two laptops on the school Wi-Fi can join the same room. If they can't, build the Firebase fallback (approach B, approved) before anything else. If the direct connection fails, the game tries Firebase automatically, so players never pick a network mode.
  2. Automated simulations with all bots: rounds last 20–40 s on average, edge camping doesn't win (4.5), no errors over 100 rounds.

## 10. Left to the builder
- The exact handling, shrink timing and boost numbers. Start from the test values and tune by playing.
- Canvas 2D or WebGL, and how bloom is done, as long as it meets the performance budget.
- The message format, update rates and how joiner smoothing works, as long as steering feels instant.
- Visual details, fonts and the exact colors, within the minimal neon style.
- File structure and test setup.

## 11. Decisions marked as my calls (check these)
- Peer-to-peer (PeerJS) with one player hosting, with Firebase as a relay fallback (the user approved the fallback).
- A shrinking arena as the main fix for edge camping.
- Scoring by survival order plus +1 per cut-off, first to 10, instead of first to 3 round wins.
- No host migration; the game ends if the host leaves.
- No power-ups in v1.
