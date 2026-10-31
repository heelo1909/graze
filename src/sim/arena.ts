import { TUNING } from '../config';
import type { Bounds } from './types';

/** Playable bounds at time t. Stub: full arena (Task 5 adds shrinking). */
export function boundsAt(_t: number): Bounds {
  return { left: 0, top: 0, right: TUNING.ARENA_W, bottom: TUNING.ARENA_H };
}
