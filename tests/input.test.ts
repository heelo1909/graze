// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { Input } from '../src/input';

const inputs: Input[] = [];
function make(): Input {
  const i = new Input(window);
  inputs.push(i);
  return i;
}
afterEach(() => { while (inputs.length) inputs.pop()!.dispose(); });

const down = (code: string): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { code, key: code, cancelable: true });
  window.dispatchEvent(e);
  return e;
};
const up = (code: string): void => { window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code })); };

test('both keys held → 0, release one → the other', () => {
  const i = make();
  expect(i.steer()).toBe(0);
  down('ArrowLeft');
  expect(i.steer()).toBe(-1);
  down('ArrowRight');
  expect(i.steer()).toBe(0);
  up('ArrowLeft');
  expect(i.steer()).toBe(1);
  up('ArrowRight');
  expect(i.steer()).toBe(0);
});

test('A/D work like arrows', () => {
  const i = make();
  down('KeyA');
  expect(i.steer()).toBe(-1);
  down('KeyD');
  expect(i.steer()).toBe(0);
  up('KeyA');
  expect(i.steer()).toBe(1);
});

test('blur releases all keys', () => {
  const i = make();
  down('ArrowLeft');
  window.dispatchEvent(new Event('blur'));
  expect(i.steer()).toBe(0);
});

test('visibilitychange to hidden releases all keys', () => {
  const i = make();
  down('KeyD');
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  expect(i.steer()).toBe(0);
});

test('preventDefault on arrows and Space, not on other keys', () => {
  make();
  expect(down('ArrowLeft').defaultPrevented).toBe(true);
  expect(down('ArrowUp').defaultPrevented).toBe(true);
  expect(down('Space').defaultPrevented).toBe(true);
  expect(down('KeyQ').defaultPrevented).toBe(false);
});

test('dispose removes listeners', () => {
  const i = new Input(window);
  i.dispose();
  down('ArrowLeft');
  expect(i.steer()).toBe(0);
});
