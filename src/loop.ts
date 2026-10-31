// Fixed-timestep helpers. The frame loop in main.ts owns the accumulator; the sim only ever
// advances in DT steps.
import { DT } from './config';
import type { SimEvent } from './sim/types';

/** Longest frame we simulate; a longer gap (tab switch) is clamped so we don't spiral. */
export const MAX_FRAME_S = 0.25;
const EPS = 1e-9;

export function stepsFor(accumulator: number, frameDt: number): { steps: number; rest: number } {
  const dt = Math.min(MAX_FRAME_S, Math.max(0, frameDt));
  const total = accumulator + dt;
  const steps = Math.floor(total / DT + EPS);
  return { steps, rest: Math.max(0, total - steps * DT) };
}

/** Spec 4.7: slow motion when the human car crashes or its trail causes a crash. */
export function triggersSlowmo(events: SimEvent[], humanId: number): boolean {
  if (humanId < 0) return false;
  return events.some((e) => e.type === 'crash' && (e.car === humanId || e.by === humanId));
}
