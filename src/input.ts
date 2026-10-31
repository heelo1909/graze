// Keyboard steering: ←/A and →/D. Window-level listeners; everything is released on blur
// and when the tab is hidden so a key can never stay stuck.
import type { Steer } from './sim/types';

const LEFT = ['ArrowLeft', 'KeyA'];
const RIGHT = ['ArrowRight', 'KeyD'];
const BLOCKED = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];

function inField(e: KeyboardEvent): boolean {
  const t = e.target as { tagName?: string } | null;
  const tag = t?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export class Input {
  private readonly down = new Set<string>();

  constructor(private readonly target: Window) {
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', this.releaseAll);
    target.document.addEventListener('visibilitychange', this.onVisibility);
  }

  steer(): Steer {
    const l = LEFT.some((k) => this.down.has(k));
    const r = RIGHT.some((k) => this.down.has(k));
    return l === r ? 0 : l ? -1 : 1;
  }

  releaseAll = (): void => { this.down.clear(); };

  dispose(): void {
    this.target.removeEventListener('keydown', this.onDown);
    this.target.removeEventListener('keyup', this.onUp);
    this.target.removeEventListener('blur', this.releaseAll);
    this.target.document.removeEventListener('visibilitychange', this.onVisibility);
    this.down.clear();
  }

  private readonly onDown = (e: KeyboardEvent): void => {
    // Typing in a text field (the name box) must work normally and must not steer.
    if (inField(e)) return;
    // Block page scroll and Alt/Cmd+Arrow history navigation even when a modifier is held.
    // Space on a focused button must still activate it (Firefox cancels the click otherwise).
    const onButton = (e.target as { tagName?: string } | null)?.tagName === 'BUTTON';
    if (BLOCKED.includes(e.code) && !(onButton && e.code === 'Space')) e.preventDefault();
    // macOS sends no keyup for a non-modifier key while Cmd is down, so a chord would latch.
    if (e.code === 'MetaLeft' || e.code === 'MetaRight' || e.metaKey) { this.releaseAll(); return; }
    if (e.ctrlKey || e.altKey) return;
    this.down.add(e.code);
  };

  private readonly onUp = (e: KeyboardEvent): void => { this.down.delete(e.code); };

  private readonly onVisibility = (): void => {
    if (this.target.document.visibilityState === 'hidden') this.releaseAll();
  };
}
