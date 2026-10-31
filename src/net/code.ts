// Room codes: 4 letters, no I or O so they can't be misread as 1 or 0.

export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LEN = 4;

/** A fresh room code. `rand` returns [0, 1). */
export function makeRoomCode(rand: () => number): string {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) {
    const idx = Math.min(ROOM_ALPHABET.length - 1, Math.floor(rand() * ROOM_ALPHABET.length));
    s += ROOM_ALPHABET.charAt(idx);
  }
  return s;
}

/** Uppercases and strips spaces and dashes; null unless exactly 4 alphabet letters. */
export function normalizeCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== CODE_LEN) return null;
  for (const ch of s) if (!ROOM_ALPHABET.includes(ch)) return null;
  return s;
}

/** The PeerJS id a host registers for a room code. */
export function peerIdFor(code: string): string {
  return `graze-${code}`;
}
