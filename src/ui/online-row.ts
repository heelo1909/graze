// The title's online row: Create Room, Join Room (reveals a code field + Go) and a hint line.
import { normalizeCode } from '../net/code';
import { el } from './dom';

export function buildOnlineRow(onCreate: () => void, onJoin: (code: string) => void): HTMLElement {
  const box = el('div', 'online');
  const row = el('div', 'row online-row');
  const create = el('button', 'ghost', 'Create Room');
  create.type = 'button';
  create.addEventListener('click', onCreate);
  const join = el('button', 'ghost', 'Join Room');
  join.type = 'button';
  row.append(create, join);

  const joinRow = el('div', 'row join-row');
  joinRow.hidden = true;
  const code = el('input', 'code');
  code.type = 'text';
  code.maxLength = 6;
  code.autocomplete = 'off';
  code.spellcheck = false;
  code.setAttribute('autocapitalize', 'characters');
  code.setAttribute('aria-label', 'Room code');
  const go = el('button', 'ghost', 'Go');
  go.type = 'button';
  joinRow.append(code, go);
  const hint = el('p', 'hint');

  const submit = (): void => {
    const c = normalizeCode(code.value);
    hint.textContent = c === null ? 'Check the code' : '';
    if (c !== null) onJoin(c);
  };
  go.addEventListener('click', submit);
  code.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  join.addEventListener('click', () => {
    joinRow.hidden = !joinRow.hidden;
    if (!joinRow.hidden) code.focus();
  });
  box.append(row, joinRow, hint);
  return box;
}
