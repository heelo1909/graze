// DOM screens in #ui: title and match end. Minimal neon; styles live in index.html.
// Text is always set via textContent (the player's name is user input).
import type { Difficulty } from '../bots/bot';
import { matchWinner, targetPoints } from '../sim/scoring';
import type { Players } from '../players';
import type { Match } from '../sim/match';
import { matchHeading } from './heading';
import { el } from './dom';
import { buildOnlineRow } from './online-row';

export const NAME_MAX = 12;
const DIFFS: { id: Difficulty; label: string }[] = [
  { id: 'easy', label: 'Easy' }, { id: 'normal', label: 'Normal' }, { id: 'hard', label: 'Hard' },
];

export function loadPref(key: string): string | null {
  try { return localStorage.getItem(`graze.${key}`); } catch { return null; }
}
export function savePref(key: string, value: string): void {
  try { localStorage.setItem(`graze.${key}`, value); } catch { /* storage blocked: skip */ }
}

let cleanup: (() => void) | null = null;

export function clearScreen(root: HTMLElement): void {
  cleanup?.();
  cleanup = null;
  root.replaceChildren();
}

/** Enter/Space presses the primary button when nothing else is focused. Native buttons and
 *  the name box handle their own keys. */
function bindPrimary(primary: HTMLButtonElement): void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'Enter' && e.code !== 'Space') return;
    const a = document.activeElement;
    if (a instanceof HTMLButtonElement || a instanceof HTMLInputElement) return;
    e.preventDefault();
    primary.click();
  };
  window.addEventListener('keydown', onKey);
  cleanup = () => window.removeEventListener('keydown', onKey);
}

export function showTitle(
  root: HTMLElement,
  opts: {
    onPlay(cfg: { name: string; difficulty: Difficulty; players: Players }): void;
    onCreate(name: string): void;
    onJoin(name: string, code: string): void;
    muted: boolean;
    onMute(m: boolean): void;
  },
): void {
  clearScreen(root);
  const saved = loadPref('difficulty');
  let difficulty: Difficulty = DIFFS.some((d) => d.id === saved) ? (saved as Difficulty) : 'normal';
  let muted = opts.muted;
  let players: Players = loadPref('players') === '2' ? 2 : 1;

  const wrap = el('div', 'screen title');
  wrap.append(el('h1', 'logo', 'GRAZE'), el('p', 'pitch', 'Skim past trails to boost. Cut your rivals off. Last car glowing wins.'));

  const label = el('label', 'field');
  const nameLabel = el('span', 'field-label');
  label.append(nameLabel);
  const input = el('input');
  input.type = 'text';
  input.maxLength = NAME_MAX;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.value = (loadPref('name') ?? 'You').slice(0, NAME_MAX);
  label.append(input);

  const diffGroup = el('div', 'seg');
  diffGroup.setAttribute('role', 'group');
  diffGroup.setAttribute('aria-label', 'Bot difficulty');
  const diffBtns = DIFFS.map((d) => {
    const b = el('button', 'seg-btn', d.label);
    b.type = 'button';
    b.addEventListener('click', () => { difficulty = d.id; paint(); });
    diffGroup.append(b);
    return { b, id: d.id };
  });
  const playGroup = el('div', 'seg');
  playGroup.setAttribute('role', 'group');
  playGroup.setAttribute('aria-label', 'Players');
  const playBtns = ([1, 2] as const).map((n) => {
    const b = el('button', 'seg-btn', n === 1 ? '1 Player' : '2 Players');
    b.type = 'button';
    b.addEventListener('click', () => { players = n; paint(); });
    playGroup.append(b);
    return { b, n };
  });
  const keys = el('p', 'keys');
  const paint = (): void => {
    diffBtns.forEach(({ b, id }) => b.setAttribute('aria-pressed', String(id === difficulty)));
    playBtns.forEach(({ b, n }) => b.setAttribute('aria-pressed', String(n === players)));
    nameLabel.textContent = players === 2 ? 'P1 name' : 'Your name';
    keys.textContent = players === 2 ? 'P1: A D   ·   P2: ← →' : '← →  or  A D  to steer';
  };
  paint();

  const mute = el('button', 'ghost');
  mute.type = 'button';
  const paintMute = (): void => {
    mute.textContent = muted ? 'Sound: off' : 'Sound: on';
    mute.setAttribute('aria-pressed', String(muted));
  };
  paintMute();
  mute.addEventListener('click', () => { muted = !muted; paintMute(); opts.onMute(muted); });

  const play = el('button', 'primary', 'Play');
  play.type = 'button';
  const go = (): void => {
    const typed = input.value.trim().slice(0, NAME_MAX) || 'You';
    savePref('name', typed);
    // The default "You" would read as "YOU" on a shared screen, so P1 falls back to "P1".
    const name = players === 2 && typed === 'You' ? 'P1' : typed;
    savePref('difficulty', difficulty);
    savePref('players', String(players));
    opts.onPlay({ name, difficulty, players });
  };
  play.addEventListener('click', go);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });

  // Online is one player per laptop: the typed name goes as-is (no 2P "P1" fallback).
  const typedName = (): string => {
    const typed = input.value.trim().slice(0, NAME_MAX) || 'You';
    savePref('name', typed);
    return typed;
  };
  const online = buildOnlineRow(() => opts.onCreate(typedName()), (code) => opts.onJoin(typedName(), code));

  wrap.append(label, playGroup, diffGroup, play, online, mute, keys);
  root.append(wrap);
  bindPrimary(play);
  play.focus();
}

/** Shows a message line on the title that is currently up; no-op when there is none. */
export function showTitleError(root: HTMLElement, message: string): void {
  const title = root.querySelector('.title');
  if (!title) return;
  let line = title.querySelector('.title-error');
  if (!line) {
    line = el('p', 'title-error');
    title.querySelector('.online')?.after(line);
  }
  line.textContent = message;
}

export function showMatchEnd(root: HTMLElement, m: Match, local: number[], onAgain: () => void, onMenu: () => void): void {
  clearScreen(root);
  const w = matchWinner(m.totals, targetPoints(m.slots.length));
  const wrap = el('div', 'screen end');
  const head = el('h2', 'winner', matchHeading(m.slots, w, local));
  if (w !== null) head.style.setProperty('--c', m.slots[w]?.color ?? '#fff');
  wrap.append(head);

  const table = el('table', 'standings');
  const order = m.slots.map((_, i) => i).sort((a, b) => (m.totals[b] ?? 0) - (m.totals[a] ?? 0));
  order.forEach((i, rank) => {
    const s = m.slots[i]!;
    const tr = el('tr');
    const name = el('td', 'nm', `${rank + 1}. ${s.name}`);
    name.style.setProperty('--c', s.color);
    tr.append(name, el('td', 'pts', `${m.totals[i] ?? 0} pts`), el('td', 'cut', `cut off ${m.cutoffTotals[i] ?? 0}`));
    table.append(tr);
  });
  wrap.append(table);

  const again = el('button', 'primary', 'Play Again');
  again.type = 'button';
  again.addEventListener('click', onAgain);
  const menu = el('button', 'ghost', 'Menu');
  menu.type = 'button';
  menu.addEventListener('click', onMenu);
  wrap.append(again, menu);
  root.append(wrap);
  bindPrimary(again);
  again.focus();
}
