// Wires a local match: title → match (you vs 3 bots, or P1 + P2 vs 2 bots) → match end → play again.
// The sim steps at a fixed DT; rendering, audio and screens only consume its events.
// Loaded by main.ts (unless ?nettest is set).
import { Audio } from './audio';
import { botSteer, newBotMemory, type BotMemory, type Difficulty } from './bots/bot';
import { DT, TUNING } from './config';
import { Input, type Scheme } from './input';
import { buildSlots, localSchemes, type Players } from './players';
import { matchWinJingle, roundWinJingle, stepsFor, triggersSlowmo } from './loop';
import { CarInterp, renderAlpha } from './render/interp';
import { startOnline, type OnlineGame, type OnlineMode } from './online';
import { peerTransport } from './net/peer';
import { Renderer } from './render/renderer';
import { createMatch, stepMatch, type Match } from './sim/match';
import { matchWinner, targetPoints } from './sim/scoring';
import type { SimEvent, Slot, Steer } from './sim/types';
import { clearScreen, loadPref, savePref, showMatchEnd, showTitle, showTitleError } from './ui/screens';

const HUMAN = 0;

const params = new URLSearchParams(location.search);
const debug = params.has('debug');
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const renderer = new Renderer(canvas);
renderer.setDebug(debug);
const input = new Input(window);
const audio = new Audio();
audio.setMuted(loadPref('muted') === '1');

let cfg: { name: string; difficulty: Difficulty; players: Players } = { name: 'You', difficulty: 'normal', players: 1 };
let m: Match | null = null;
/** Car ids steered on this device. */
let local: number[] = [HUMAN];
/** Steering scheme per local car, by car id. */
let schemes: Scheme[] = ['both'];
let mem: BotMemory[] = [];
let acc = 0;
const interp = new CarInterp();
let last = performance.now();
let slowLeft = 0;
let prevPhase = '';
let tickShown = -1;
let endShown = false;
/** Debug hook only: forces the human steer. */
let steerOverride: Steer | null = null;
/** Set while an online room is open; then the local match above is idle. */
let online: OnlineGame | null = null;
/** Debug pump's synthetic clock (seconds); 0 until first used. */
let pumpT = 0;
const transport = peerTransport();

// Browsers only allow sound after a gesture; Safari needs resume() inside it.
const unlock = (): void => audio.unlock();
window.addEventListener('keydown', unlock);
window.addEventListener('pointerdown', unlock);

function startMatch(): void {
  const slots: Slot[] = buildSlots(cfg.players, cfg.name);
  m = createMatch(slots, Date.now() % 100000);
  schemes = localSchemes(cfg.players);
  local = schemes.map((_, i) => i);
  renderer.setLocal(local);
  mem = slots.map(() => newBotMemory());
  acc = DT / 2; // start mid-step so the first frames are not a half-step behind
  slowLeft = 0;
  prevPhase = '';
  tickShown = -1;
  endShown = false;
  input.releaseAll();
  clearScreen(ui);
}

/** Back to the title (leaving any online room); `error` shows under the online buttons. */
function toTitle(error?: string): void {
  online = null;
  m = null;
  input.releaseAll();
  renderer.setNotice(null);
  openTitle();
  if (error) showTitleError(ui, error);
}

function goOnline(mode: OnlineMode): void {
  audio.unlock();
  m = null;
  online = startOnline({ ui, renderer, input, audio, transport, toTitle }, mode);
}

function openTitle(): void {
  showTitle(ui, {
    muted: loadPref('muted') === '1',
    onMute: (v) => { audio.setMuted(v); savePref('muted', v ? '1' : '0'); },
    onPlay: (c) => { cfg = c; audio.unlock(); startMatch(); },
    onCreate: (name) => goOnline({ kind: 'host', name }),
    onJoin: (name, code) => goOnline({ kind: 'join', name, code }),
  });
}

/** One fixed sim step plus everything that reacts to it. */
function step(): void {
  if (!m) return;
  const match = m;
  const steers: Steer[] = match.world.cars.map((car, i) => {
    if (match.phase !== 'play') return 0;
    const scheme = schemes[i];
    if (scheme) return (i === HUMAN ? steerOverride : null) ?? input.steer(scheme);
    return car.alive ? botSteer(match.world, i, mem[i]!, cfg.difficulty) : 0;
  });
  interp.snapshot(match.world);
  const events = stepMatch(match, steers);
  renderer.onEvents(events, match);
  react(events, match);
}

/** True once the totals (already updated by this roundOver) decide the match. */
function decided(match: Match): boolean {
  return matchWinner(match.totals, targetPoints(match.slots.length)) !== null;
}

function react(events: SimEvent[], match: Match): void {
  for (const e of events) {
    if (e.type === 'graze' && local.includes(e.car)) audio.graze(match.world.cars[e.car]?.boost ?? 0);
    else if (e.type === 'crash') audio.crash();
    else if (e.type === 'roundOver' && roundWinJingle(e.winner, local, decided(match))) audio.win();
  }
  if (triggersSlowmo(events, local)) slowLeft = TUNING.SLOWMO_S;

  if (match.phase === 'countdown') {
    const n = Math.ceil(TUNING.COUNTDOWN_S - match.phaseTime - 1e-6);
    if (n !== tickShown) { tickShown = n; if (n > 0) audio.tick(); }
  } else {
    tickShown = -1;
    if (prevPhase === 'countdown' && match.phase === 'play') audio.go();
  }
  prevPhase = match.phase;

  if (match.phase === 'matchEnd' && !endShown) {
    endShown = true;
    input.releaseAll();
    if (matchWinJingle(matchWinner(match.totals, targetPoints(match.slots.length)), local)) audio.win();
    showMatchEnd(ui, match, local, startMatch, openTitle);
  }
}

function frame(now: number): void {
  const frameDt = Math.min(0.25, Math.max(0, (now - last) / 1000));
  last = now;
  runFrame(now / 1000, frameDt);
  requestAnimationFrame(frame);
}

/** One frame of work (local or online) at `now` seconds; the rAF loop and the debug pump share it. */
function runFrame(now: number, frameDt: number): void {
  if (online) online.frame(now, frameDt);
  else if (m) {
    // Slow motion (spec 4.7) scales sim time only; banners/shake/screens use real time.
    const scale = slowLeft > 0 ? TUNING.SLOWMO_SCALE : 1;
    slowLeft = Math.max(0, slowLeft - frameDt);
    const r = stepsFor(acc, frameDt * scale);
    acc = r.rest;
    for (let i = 0; i < r.steps; i++) step();
    renderer.draw(m, now, interp.cars(m.world, renderAlpha(acc)));
  }
}

openTitle();
requestAnimationFrame(frame);

// Debug-only hook (?debug) so automated checks can drive a match without relying on rAF timing.
if (debug) {
  (window as unknown as Record<string, unknown>).__graze = {
    debug: (on: boolean) => renderer.setDebug(on),
    /** Starts a match as if Play was pressed. */
    start(difficulty: Difficulty = 'normal', players: Players = 1): string {
      cfg = { name: players === 2 ? 'P1' : 'You', difficulty, players };
      startMatch();
      return 'started';
    },
    /** Forces the human steer (-1/0/1), or null to hand control back to the keyboard. */
    steer(s: Steer | null): void { steerOverride = s; },
    /** Runs n seconds of sim at the fixed step through the same path the frame loop uses. */
    advance(seconds: number): string {
      for (let i = 0; i < Math.round(seconds / DT) && m; i++) {
        step();
        renderer.draw(m, performance.now() / 1000);
      }
      return state();
    },
    state,
    /** Online role, session state and seat count. */
    online: (): string => online?.describe() ?? 'offline',
    /** Runs `seconds` of frames synchronously on a synthetic clock (for a hidden tab where rAF crawls). */
    pump(seconds: number): string {
      pumpT ||= performance.now() / 1000;
      for (let i = 0; i < Math.round(seconds * 60); i++) { pumpT += 1 / 60; runFrame(pumpT, 1 / 60); }
      return online ? online.describe() : state();
    },
    /** Real frame intervals over `ms` of live rAF frames: avg and max ms. */
    frames(ms: number): Promise<string> {
      return new Promise((done) => {
        const ts: number[] = [];
        let prev = performance.now();
        const end = prev + ms;
        const tick = (now: number): void => {
          ts.push(now - prev);
          prev = now;
          if (now < end) requestAnimationFrame(tick);
          else done(`${ts.length} frames, avg ${(ms / ts.length).toFixed(2)} ms, max ${Math.max(...ts.slice(1)).toFixed(2)} ms`);
        };
        requestAnimationFrame(tick);
      });
    },
  };
}

function state(): string {
  if (!m) return 'title';
  return `${m.phase} round ${m.round} t ${m.world.time.toFixed(2)} alive ${m.world.cars.filter((c) => c.alive).length} totals ${m.totals.join(',')} cutoffs ${m.cutoffTotals.join(',')}`;
}
