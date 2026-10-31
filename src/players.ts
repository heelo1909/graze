// Who sits at this keyboard: solo (you vs 3 bots) or two players sharing it (P1 A/D, P2 ←/→, 2 bots).
import type { Scheme } from './input';
import type { Slot } from './sim/types';

export type Players = 1 | 2;

const BOTS: { name: string; color: string }[] = [
  { name: 'Pixel', color: '#ff4d8d' },
  { name: 'Rook', color: '#ffd84d' },
  { name: 'Moss', color: '#7dff6a' },
];
const P1_COLOR = '#4de3ff';
const P2_COLOR = '#ff9a3d';
const CARS = 4;

/** Slots for a local match: the local players first, then bots up to 4 cars. */
export function buildSlots(players: Players, p1Name: string): Slot[] {
  const humans: Slot[] = [{ name: p1Name, color: P1_COLOR, isBot: false }];
  if (players === 2) humans.push({ name: 'P2', color: P2_COLOR, isBot: false });
  const bots = BOTS.slice(0, CARS - humans.length).map((b) => ({ ...b, isBot: true }));
  return [...humans, ...bots];
}

/** Steering scheme for each local car, by car id. */
export function localSchemes(players: Players): Scheme[] {
  return players === 2 ? ['ad', 'arrows'] : ['both'];
}

/** The controls reminder along the bottom of the game screen. */
export function hintText(players: Players): string {
  return players === 2
    ? 'P1  A D   ·   P2  ← →   ·   hold to drift harder   ·   skim past trails to boost'
    : '←  →  steer   ·   hold to drift harder   ·   skim past trails to boost   ·   gaps let you slip through';
}
