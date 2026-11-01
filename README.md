# Graze

A minimal neon browser game. Cars drift with only two keys, leave glowing trails and cut each other off.
Play solo against 3 bots, share one keyboard for 2 players, or play online with up to 4 players.

## Controls

- Steer with `←` / `→` or `A` / `D`.
- Tap to turn; hold to slide harder. Skim past trails (without touching them) to build a boost.

## Play online

1. Open https://heelo1909.github.io/graze/
2. One player picks Create Room and shares the 4-letter code.
3. Everyone else picks Join Room and types the code.
4. The host presses Start. Bots fill any empty seats.

It works best when everyone is on the same Wi-Fi. Some school networks block direct connections. If it won't connect there, tell the host. A fallback is planned if that happens.

## Run locally

```
npm i
npm run dev          # add ?debug to the URL for the debug overlay
npm test             # unit, world and balance tests
npm run sim -- --rounds 100   # headless bot matches
```

## Deploy

Push to `main`. GitHub Actions runs the tests, builds, and publishes `dist` to GitHub Pages.
One-time setup: repo Settings → Pages → Source: GitHub Actions.
