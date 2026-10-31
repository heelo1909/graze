import { TUNING } from '../config';

/** Side margin (CSS px) between the window edge and the arena. */
export const SIDE_MARGIN = 16;
/** Space reserved for the top HUD bar and the bottom controls hint (CSS px). */
export const HUD_TOP = 58;
export const HUD_BOTTOM = 36;

export interface View { scale: number; ox: number; oy: number }

/** Largest scale that fits the arena between the margins, centred horizontally
 *  and centred vertically in the space between the top and bottom bars. */
export function fitArena(screenW: number, screenH: number, top: number, bottom: number): View {
  const W = TUNING.ARENA_W;
  const H = TUNING.ARENA_H;
  // (1 - 1e-9) keeps W*scale from rounding a hair past the available space
  const scale = Math.max(0.01, Math.min((screenW - SIDE_MARGIN * 2) / W, (screenH - top - bottom) / H) * (1 - 1e-9));
  return {
    scale,
    ox: (screenW - W * scale) / 2,
    oy: top + (screenH - top - bottom - H * scale) / 2,
  };
}
