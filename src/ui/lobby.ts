// Online lobby screen: room code, four seats, host controls. Names via textContent only.
import type { Difficulty } from '../bots/bot';
import type { LobbySeat } from '../net/protocol';
import { difficultyNote, difficultyPicker } from './difficulty';
import { el, segGroup } from './dom';
import { clearScreen } from './screens';

export interface LobbyView { code: string; seats: LobbySeat[]; isHost: boolean; you: number; bots: boolean; difficulty: Difficulty; canStart: boolean }
export interface LobbyHandlers { onStart(): void; onLeave(): void; onBots(on: boolean): void; onDifficulty(d: Difficulty): void }

const SEATS = 4;

export function showLobby(root: HTMLElement, view: LobbyView, h: LobbyHandlers): void {
  clearScreen(root);
  const wrap = el('div', 'screen lobby');
  wrap.append(el('p', 'field-label', 'Room code'), el('div', 'room-code', view.code));

  const copy = el('button', 'ghost', 'Copy');
  copy.type = 'button';
  copy.addEventListener('click', () => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(view.code);
        copy.textContent = 'Copied';
      } catch {
        copy.textContent = 'Select and copy the code';
      }
    })();
  });
  wrap.append(copy);

  const list = el('ul', 'seats');
  for (let i = 0; i < SEATS; i++) {
    const seat = view.seats[i];
    const li = el('li', 'seat', seat ? seat.name + (i === view.you ? ' (you)' : '') : view.bots ? 'Bot' : '—');
    if (seat) li.style.setProperty('--c', seat.color);
    else li.classList.add('empty');
    list.append(li);
  }
  wrap.append(list);

  if (view.isHost) {
    const bots = segGroup('Bots', ['Bots on', 'Bots off'], (i) => h.onBots(i === 0));
    bots.paint(view.bots ? 0 : 1);
    const diff = difficultyPicker(view.difficulty, h.onDifficulty);
    const start = el('button', 'primary', 'Start');
    start.type = 'button';
    start.disabled = !view.canStart;
    start.addEventListener('click', h.onStart);
    wrap.append(bots.group, diff, start);
  } else {
    if (view.bots) wrap.append(difficultyNote(view.difficulty));
    wrap.append(el('p', 'keys', 'Waiting for the host to start…'));
  }

  const leave = el('button', 'ghost', 'Leave');
  leave.type = 'button';
  leave.addEventListener('click', h.onLeave);
  wrap.append(leave);
  root.append(wrap);
}
