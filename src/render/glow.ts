// Pre-rendered glow images. Everything here is drawn once and cached, so the
// frame loop only ever calls drawImage (no shadowBlur, no ctx.filter).
import { hexA } from './color';

export const DISPLAY_FONT = '"Unbounded", "Avenir Next", "Futura", system-ui, sans-serif';
export const BODY_FONT = '"Manrope", "Avenir Next", "Helvetica Neue", system-ui, sans-serif';
export const font = (weight: number, px: number, face = BODY_FONT): string => `${weight} ${px}px ${face}`;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas not available');
  return g;
}

const sprites = new Map<string, HTMLCanvasElement>();

/** Soft radial glow in `color`, 128 px square. Draw it scaled to any size. */
export function glowSprite(color: string): HTMLCanvasElement {
  let c = sprites.get(color);
  if (!c) {
    const s = 128;
    c = makeCanvas(s, s);
    const g = ctx2d(c);
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, hexA(color, 1));
    gr.addColorStop(0.25, hexA(color, 0.4));
    gr.addColorStop(0.6, hexA(color, 0.08));
    gr.addColorStop(1, hexA(color, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
    sprites.set(color, c);
  }
  return c;
}

export interface TextLine { text: string; font: string; color: string; dy: number; glow: boolean }

/** Renders centred text lines with a neon halo into a new canvas (device pixels).
 *  The halo is made by drawing the glowing lines into ¼- and ⅛-size canvases and
 *  scaling them back up with smoothing: a blur without filters. Call once per message. */
export function glowText(lines: TextLine[], dpr: number): { canvas: HTMLCanvasElement; w: number; h: number } {
  const probe = ctx2d(makeCanvas(1, 1));
  let maxW = 0;
  let minY = 0;
  let maxY = 0;
  for (const l of lines) {
    probe.font = l.font;
    maxW = Math.max(maxW, probe.measureText(l.text).width);
    const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(l.font)?.[1] ?? '20');
    minY = Math.min(minY, l.dy - size);
    maxY = Math.max(maxY, l.dy + size);
  }
  const pad = 40;
  const w = maxW + pad * 2;
  const h = maxY - minY + pad * 2;
  const cy = pad - minY;
  const out = makeCanvas(w * dpr, h * dpr);
  const g = ctx2d(out);
  const paint = (t: CanvasRenderingContext2D, k: number, onlyGlow: boolean): void => {
    t.setTransform(k, 0, 0, k, 0, 0);
    t.textAlign = 'center';
    t.textBaseline = 'middle';
    for (const l of lines) {
      if (onlyGlow && !l.glow) continue;
      t.font = l.font;
      t.fillStyle = l.color;
      t.fillText(l.text, w / 2, cy + l.dy);
    }
  };
  const q = makeCanvas((w * dpr) / 4, (h * dpr) / 4);
  const e = makeCanvas((w * dpr) / 8, (h * dpr) / 8);
  const qg = ctx2d(q);
  const eg = ctx2d(e);
  paint(qg, dpr / 4, true);
  eg.imageSmoothingEnabled = true;
  eg.drawImage(q, 0, 0, e.width, e.height);
  g.imageSmoothingEnabled = true;
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.9;
  g.drawImage(e, 0, 0, out.width, out.height);
  g.globalAlpha = 0.7;
  g.drawImage(q, 0, 0, out.width, out.height);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  paint(g, dpr, false);
  return { canvas: out, w, h };
}
