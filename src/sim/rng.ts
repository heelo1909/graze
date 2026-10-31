export interface Rng {
  next(): number;
  range(a: number, b: number): number;
}

// mulberry32: small, fast, seedable PRNG. Returns floats in [0, 1).
export function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a: number, b: number): number => a + (b - a) * next(),
  };
}
