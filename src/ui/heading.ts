import type { Slot } from '../sim/types';

/** Match-end heading: "You win" when the sole local player won, otherwise "<Name> wins". */
export function matchHeading(slots: Slot[], winner: number | null, local: number[]): string {
  const s = winner === null ? undefined : slots[winner];
  if (!s) return 'Match over';
  return local.length === 1 && local[0] === winner ? 'You win' : `${s.name} wins`;
}
