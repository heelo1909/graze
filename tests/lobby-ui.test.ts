// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { showTitle, showTitleError } from '../src/ui/screens';
import { showLobby, type LobbyHandlers, type LobbyView } from '../src/ui/lobby';

let root: HTMLElement;
beforeEach(() => { document.body.replaceChildren(); root = document.createElement('div'); document.body.append(root); });

function title(): { onCreate: ReturnType<typeof vi.fn>; onJoin: ReturnType<typeof vi.fn> } {
  const onCreate = vi.fn(); const onJoin = vi.fn();
  showTitle(root, { onPlay: vi.fn(), muted: false, onMute: vi.fn(), onCreate, onJoin });
  return { onCreate, onJoin };
}
const btn = (label: string): HTMLButtonElement =>
  [...root.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement;
const codeField = (): HTMLInputElement => root.querySelector('input.code') as HTMLInputElement;

test('join with a bad code shows the hint', () => {
  const { onJoin } = title();
  btn('Join Room').click();
  codeField().value = 'kq0t';
  btn('Go').click();
  expect(root.querySelector('.hint')?.textContent).toBe('Check the code');
  expect(onJoin).not.toHaveBeenCalled();
});

test('join with a messy good code', () => {
  const { onJoin } = title();
  btn('Join Room').click();
  codeField().value = ' kqzt ';
  btn('Go').click();
  expect(onJoin).toHaveBeenCalledWith('You', 'KQZT');
});

test('create sends the typed name; error line shows on the title', () => {
  const { onCreate } = title();
  (root.querySelector('input') as HTMLInputElement).value = 'Ann';
  btn('Create Room').click();
  expect(onCreate).toHaveBeenCalledWith('Ann');
  showTitleError(root, 'Room not found');
  expect(root.querySelector('.title-error')?.textContent).toBe('Room not found');
});

test('showTitleError with no title is a no-op', () => {
  root.replaceChildren();
  expect(() => showTitleError(root, 'x')).not.toThrow();
  expect(root.childElementCount).toBe(0);
});

const handlers = (): LobbyHandlers => ({ onStart: vi.fn(), onLeave: vi.fn(), onBots: vi.fn(), onDifficulty: vi.fn() });
const view = (o: Partial<LobbyView> = {}): LobbyView => ({
  code: 'KQZT', seats: [{ name: 'Ann', color: '#f00' }, { name: 'Bo', color: '#0f0' }],
  isHost: true, you: 0, bots: true, difficulty: 'normal', canStart: true, ...o,
});
const lbtn = (label: string): HTMLButtonElement | undefined =>
  [...root.querySelectorAll('button')].find((b) => b.textContent === label);

test('lobby shows host controls only to host', () => {
  showLobby(root, view(), handlers());
  expect(lbtn('Start')).toBeDefined();
  expect(lbtn('Bots on')).toBeDefined();
  showLobby(root, view({ isHost: false, you: 1 }), handlers());
  expect(lbtn('Start')).toBeUndefined();
  expect(lbtn('Bots on')).toBeUndefined();
  expect(root.textContent).toContain('Waiting for the host to start…');
  expect(lbtn('Leave')).toBeDefined();
  expect(root.querySelectorAll('.seat')[1]?.textContent).toBe('Bo (you)');
});

test('start disabled when canStart is false', () => {
  showLobby(root, view({ canStart: false }), handlers());
  expect(lbtn('Start')!.disabled).toBe(true);
});

test('empty seats show Bot or dash', () => {
  showLobby(root, view({ bots: true }), handlers());
  expect(root.querySelectorAll('.seat').length).toBe(4);
  expect([...root.querySelectorAll('.seat')].filter((s) => s.textContent === 'Bot').length).toBe(2);
  showLobby(root, view({ bots: false }), handlers());
  expect([...root.querySelectorAll('.seat')].filter((s) => s.textContent === '—').length).toBe(2);
});

const diffLabel = (): string | undefined =>
  [...root.querySelectorAll('.field-label')].map((e) => e.textContent ?? '').find((t) => t === 'Bot difficulty');
const blurb = (): string => root.querySelector('.diff-blurb')?.textContent ?? '';

test('title labels the bot difficulty and describes the picked level', () => {
  localStorage.clear();
  const onPlay = vi.fn();
  showTitle(root, { onPlay, muted: false, onMute: vi.fn(), onCreate: vi.fn(), onJoin: vi.fn() });
  expect(diffLabel()).toBe('Bot difficulty');
  expect(blurb()).toMatch(/^Normal/);
  btn('Hard').click();
  expect(btn('Hard').getAttribute('aria-pressed')).toBe('true');
  expect(blurb()).toMatch(/^Hard/);
  btn('Play').click();
  expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ difficulty: 'hard' }));
});

test('lobby: host gets the labeled picker, joiners see the level read-only', () => {
  const h = handlers();
  showLobby(root, view({ difficulty: 'easy' }), h);
  expect(diffLabel()).toBe('Bot difficulty');
  expect(blurb()).toMatch(/^Easy/);
  lbtn('Hard')!.click();
  expect(h.onDifficulty).toHaveBeenCalledWith('hard');
  showLobby(root, view({ isHost: false, you: 1, difficulty: 'hard' }), handlers());
  expect(lbtn('Hard')).toBeUndefined();
  expect(diffLabel()).toBe('Bot difficulty');
  expect(blurb()).toMatch(/^Hard/);
  showLobby(root, view({ isHost: false, you: 1, bots: false }), handlers());
  expect(diffLabel()).toBeUndefined();
});
