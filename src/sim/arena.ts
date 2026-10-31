import { TUNING } from '../config';
import type { Bounds } from './types';

const CX = TUNING.ARENA_W / 2;
const CY = TUNING.ARENA_H / 2;

/** Playable bounds at time t: full arena until SHRINK_START_S, then a linear
 *  even shrink around the arena centre to SHRINK_TO of each dimension, then hold. */
export function boundsAt(t: number): Bounds {
  const p = Math.min(1, Math.max(0, (t - TUNING.SHRINK_START_S) / TUNING.SHRINK_DURATION_S));
  const k = 1 - (1 - TUNING.SHRINK_TO) * p;
  const hw = (TUNING.ARENA_W / 2) * k;
  const hh = (TUNING.ARENA_H / 2) * k;
  return { left: CX - hw, top: CY - hh, right: CX + hw, bottom: CY + hh };
}

/** 0 before SHRINK_START_S - SHRINK_WARN_S, linear ramp to 1 at SHRINK_START_S, then 1. */
export function shrinkWarning(t: number): number {
  return Math.min(1, Math.max(0, (t - (TUNING.SHRINK_START_S - TUNING.SHRINK_WARN_S)) / TUNING.SHRINK_WARN_S));
}
