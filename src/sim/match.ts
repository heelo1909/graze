import { DT, TUNING } from '../config';
import { roundPoints, targetPoints, matchWinner } from './scoring';
import type { SimEvent, Slot, Steer, World } from './types';
import { createWorld, stepWorld } from './world';

export type Phase = 'countdown' | 'play' | 'roundEnd' | 'matchEnd';

export interface Match {
  phase: Phase;
  phaseTime: number;
  round: number;
  totals: number[];
  lastRound: number[];
  world: World;
  slots: Slot[];
  seed: number;
}

const EPS = 1e-9;

export function createMatch(slots: Slot[], seed: number): Match {
  return {
    phase: 'countdown', phaseTime: 0, round: 1,
    totals: slots.map(() => 0), lastRound: slots.map(() => 0),
    world: createWorld(slots, seed + 1), slots, seed,
  };
}

export function stepMatch(m: Match, steers: Steer[]): SimEvent[] {
  switch (m.phase) {
    case 'countdown':
      m.phaseTime += DT;
      if (m.phaseTime >= TUNING.COUNTDOWN_S - EPS) { m.phase = 'play'; m.phaseTime = 0; }
      return [];
    case 'play': {
      m.phaseTime += DT;
      const ev = stepWorld(m.world, steers);
      for (const e of ev) {
        if (e.type !== 'roundOver') continue;
        m.lastRound = roundPoints(m.slots.length, e.outOrder, e.winner, e.cutoffs);
        m.totals = m.totals.map((t, i) => t + (m.lastRound[i] ?? 0));
        m.phase = 'roundEnd';
        m.phaseTime = 0;
      }
      return ev;
    }
    case 'roundEnd':
      m.phaseTime += DT;
      if (m.phaseTime >= TUNING.ROUND_END_PAUSE_S - EPS) {
        if (matchWinner(m.totals, targetPoints(m.slots.length)) !== null) {
          m.phase = 'matchEnd';
        } else {
          m.round++;
          m.world = createWorld(m.slots, m.seed + m.round);
          m.phase = 'countdown';
        }
        m.phaseTime = 0;
      }
      return [];
    case 'matchEnd':
      return [];
  }
}
