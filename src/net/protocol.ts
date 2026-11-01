// Wire messages for online play. Every message has a `t` tag.
// Joiners are untrusted: the guards check the fields the host actually reads.
// No DOM access in src/net/.
import type { Difficulty } from '../bots/bot';
import type { Phase } from '../sim/match';
import type { Bounds, SimEvent, Slot, Steer } from '../sim/types';

export const SEAT_COLORS = ['#4de3ff', '#ff9a3d', '#ff4d8d', '#7dff6a'] as const;
export const BOT_NAMES = ['Pixel', 'Rook', 'Moss'] as const;

export interface LobbySeat {
  name: string;
  color: string;
}

export type ToHost = { t: 'hello'; name: string } | { t: 'steer'; s: Steer };

export type ToJoiner =
  | { t: 'lobby'; seats: LobbySeat[]; bots: boolean; difficulty: Difficulty; you: number }
  | { t: 'refused'; reason: 'full' | 'started' }
  | { t: 'start'; slots: Slot[]; seed: number; you: number }
  | { t: 'snap'; snap: NetSnap }
  | { t: 'left'; seat: number };

export interface NetCar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  hold: number;
  boost: number;
  alive: boolean;
}

export interface NetSnap {
  tick: number;
  phase: Phase;
  phaseTime: number;
  round: number;
  totals: number[];
  lastRound: number[];
  cutoffTotals: number[];
  time: number;
  bounds: Bounds;
  cars: NetCar[];
  events: SimEvent[];
}

const TO_HOST_TAGS: readonly string[] = ['hello', 'steer'];
const TO_JOINER_TAGS: readonly string[] = ['lobby', 'refused', 'start', 'snap', 'left'];

function tag(m: unknown): string | null {
  if (typeof m !== 'object' || m === null) return null;
  const t = (m as { t?: unknown }).t;
  return typeof t === 'string' ? t : null;
}

export function isToHost(m: unknown): m is ToHost {
  const t = tag(m);
  if (t === null || !TO_HOST_TAGS.includes(t)) return false;
  const o = m as Record<string, unknown>;
  if (t === 'hello') return typeof o.name === 'string';
  return o.s === -1 || o.s === 0 || o.s === 1;
}

export function isToJoiner(m: unknown): m is ToJoiner {
  const t = tag(m);
  return t !== null && TO_JOINER_TAGS.includes(t);
}
