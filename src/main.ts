// Wires the solo match: title → match (you vs 3 bots) → match end → play again.
// The sim steps at a fixed DT; rendering, audio and screens only consume its events.
import { Audio } from './audio';
import { botSteer, newBotMemory, type BotMemory, type Difficulty } from './bots/bot';
import { DT, TUNING } from './config';
import { Input } from './input';
import { stepsFor, triggersSlowmo } from './loop';
import { Renderer } from './render/renderer';
import { createMatch, stepMatch, type Match } from './sim/match';
import type { SimEvent, Slot, Steer } from './sim/types';
import { clearScreen, loadPref, savePref, showMatchEnd, showTitle } from './ui/screens';

const HUMAN = 0;
const BOTS: { name: string; color: string }[] = [
  { name: 'Pixel', color: '#ff4d8d' },
  { name: 'Rook', color: '#ffd84d' },
  { name: 'Moss', color: '#7dff6a' },
];
const PLAYER_COLOR = '#4de3ff';

const params = new URLSearchParams(location.search);
const debug = params.has('debug');
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const renderer = new Renderer(canvas);
renderer.setDebug(debug);
const input = new Input(window);
const audio = new Audio();
audio.setMuted(loadPref('muted') === '1');

let cfg: { name: string; difficulty: Difficulty } = { name: 'You', difficulty: 'normal' };
let m: Match | null = null;
let mem: BotMemory[] = [];
let acc = 0;
let last = performance.now();
let slowLeft = 0;
let prevPhase = '';
let tickShown = -1;
let endShown = false;
/** Debug hook only: forces the human steer. */
let steerOverride: Steer | null = null;

// Browsers only allow sound after a gesture; Safari needs resume() inside it.
const unlock = (): void => audio.unlock();
window.addEventListener('keydown', unlock);
window.addEventListener('pointerdown', unlock);

function startMatch(): void {
  const slots: Slot[] = [
    { name: cfg.name, color: PLAYER_COLOR, isBot: false },
    ...BOTS.map((b) => ({ name: b.name, color: b.color, isBot: true })),
  ];
  m = createMatch(slots, Date.now() % 100000);
  mem = slots.map(() => newBotMemory());
  acc = 0;
  slowLeft = 0;
  prevPhase = '';
  tickShown = -1;
  endShown = false;
  input.releaseAll();
  clearScreen(ui);
}

function openTitle(): void {
  showTitle(ui, {
    muted: loadPref('muted') === '1',
    onMute: (v) => { audio.setMuted(v); savePref('muted', v ? '1' : '0'); },
    onPlay: (c) => { cfg = c; audio.unlock(); startMatch(); },
  });
}

/** One fixed sim step plus everything that reacts to it. */
function step(): void {
  if (!m) return;
  const match = m;
  const steers: Steer[] = match.world.cars.map((car, i) => {
    if (match.phase !== 'play') return 0;
    if (i === HUMAN) return steerOverride ?? input.steer();
    return car.alive ? botSteer(match.world, i, mem[i]!, cfg.difficulty) : 0;
  });
  const events = stepMatch(match, steers);
  renderer.onEvents(events, match);
  react(events, match);
}

function react(events: SimEvent[], match: Match): void {
  for (const e of events) {
    if (e.type === 'graze' && e.car === HUMAN) audio.graze(match.world.cars[HUMAN]?.boost ?? 0);
    else if (e.type === 'crash') audio.crash();
    else if (e.type === 'roundOver' && e.winner === HUMAN) audio.win(); // also covers the deciding round
  }
  if (triggersSlowmo(events, HUMAN)) slowLeft = TUNING.SLOWMO_S;

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
    showMatchEnd(ui, match, startMatch);
  }
}

function frame(now: number): void {
  const frameDt = Math.min(0.25, Math.max(0, (now - last) / 1000));
  last = now;
  if (m) {
    // Slow motion (spec 4.7) scales sim time only; banners/shake/screens use real time.
    const scale = slowLeft > 0 ? TUNING.SLOWMO_SCALE : 1;
    slowLeft = Math.max(0, slowLeft - frameDt);
    const r = stepsFor(acc, frameDt * scale);
    acc = r.rest;
    for (let i = 0; i < r.steps; i++) step();
    renderer.draw(m, now / 1000);
  }
  requestAnimationFrame(frame);
}

openTitle();
requestAnimationFrame(frame);

// Debug-only hook (?debug) so automated checks can drive a match without relying on rAF timing.
if (debug) {
  (window as unknown as Record<string, unknown>).__graze = {
    debug: (on: boolean) => renderer.setDebug(on),
    /** Starts a match as if Play was pressed. */
    start(difficulty: Difficulty = 'normal'): string {
      cfg = { name: 'You', difficulty };
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
