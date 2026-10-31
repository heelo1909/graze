# Graze

A minimal neon browser game. Cars drift with only two keys, leave glowing trails and cut each other off.
Up to 4 players; bots fill empty spots.

## Controls

- Steer with `←` / `→` or `A` / `D`.
- Tap to turn; hold to slide harder and build a boost.

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
