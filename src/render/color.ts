// Colour string helpers. Results are cached so the frame loop doesn't build strings.
const cache = new Map<string, string>();

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

/** '#rrggbb' + alpha → 'rgba(r,g,b,a)'. Alpha is rounded to 2 decimals for caching. */
export function hexA(hex: string, a: number): string {
  const q = Math.round(Math.max(0, Math.min(1, a)) * 100);
  const key = `${hex}|${q}`;
  let s = cache.get(key);
  if (s === undefined) {
    const [r, g, b] = rgb(hex);
    s = `rgba(${r},${g},${b},${q / 100})`;
    cache.set(key, s);
  }
  return s;
}

/** Mixes '#rrggbb' toward white by k (0..1). */
export function lighten(hex: string, k: number): string {
  const key = `${hex}|L${k}`;
  let s = cache.get(key);
  if (s === undefined) {
    const f = (c: number): number => Math.round(c + (255 - c) * k);
    const [r, g, b] = rgb(hex);
    s = `rgb(${f(r)},${f(g)},${f(b)})`;
    cache.set(key, s);
  }
  return s;
}

/** Scales '#rrggbb' toward black by k (0..1): the opaque equivalent of alpha k over black. */
export function darken(hex: string, k: number): string {
  const key = `${hex}|D${k}`;
  let s = cache.get(key);
  if (s === undefined) {
    const [r, g, b] = rgb(hex);
    s = `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
    cache.set(key, s);
  }
  return s;
}
