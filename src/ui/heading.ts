import type { Slot } from '../sim/types';

/** Match-end heading: "You win" for the human slot, "<Name> wins" for a bot. */
export function matchHeading(slots: Slot[], winner: number | null): string {
  const s = winner === null ? undefined : slots[winner];
  if (!s) return 'Match over';
  return s.isBot ? `${s.name} wins` : 'You win';
}
