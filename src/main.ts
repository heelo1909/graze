// TEMPORARY dev entry (Task 8): a live match where every car, including slot 0
// ("you", isBot=false so banners show), is steered by a normal bot. Task 9 replaces this.
import { DT } from './config';
import { botSteer, newBotMemory } from './bots/bot';
import { createMatch, stepMatch } from './sim/match';
import type { Slot, Steer } from './sim/types';
import { Renderer } from './render/renderer';

const SLOTS: Slot[] = [
  { name: 'You', color: '#4de3ff', isBot: false },
  { name: 'Pixel', color: '#ff4d8d', isBot: true },
  { name: 'Rook', color: '#ffd84d', isBot: true },
  { name: 'Moss', color: '#7dff6a', isBot: true },
];

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
renderer.setDebug(new URLSearchParams(location.search).has('debug'));

let m = createMatch(SLOTS, Date.now() % 100000);
let mem = SLOTS.map(() => newBotMemory());
let acc = 0;
let last = performance.now();
let endT = 0;

function step(): void {
  const steers: Steer[] = SLOTS.map((_, i) => (m.phase === 'play' ? botSteer(m.world, i, mem[i]!, 'normal') : 0));
  renderer.onEvents(stepMatch(m, steers), m);
  if (m.phase === 'matchEnd' && (endT += DT) > 4) {
    m = createMatch(SLOTS, Date.now() % 100000);
    mem = SLOTS.map(() => newBotMemory());
    endT = 0;
  }
}

function frame(now: number): void {
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  while (acc >= DT) { acc -= DT; step(); }
  renderer.draw(m, now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug-only hook (?debug) so automated checks can fast-forward without relying on rAF timing.
if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as Record<string, unknown>).__graze = {
    debug: (on: boolean) => renderer.setDebug(on),
    /** Times n draws of the current state (CPU submission cost only; GPU work is deferred). */
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
    bench(n: number): string {
      const ts: number[] = [];
      for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        renderer.draw(m, t0 / 1000);
        ts.push(performance.now() - t0);
      }
      return `draw avg ${(ts.reduce((a, b) => a + b, 0) / n).toFixed(2)} ms, max ${Math.max(...ts).toFixed(2)} ms`;
    },
    advance(seconds: number): string {
      for (let i = 0; i < Math.round(seconds / DT); i++) {
        step();
        renderer.draw(m, performance.now() / 1000);
      }
      return `${m.phase} round ${m.round} t ${m.world.time.toFixed(2)} alive ${m.world.cars.filter((c) => c.alive).length}`;
    },
  };
}
