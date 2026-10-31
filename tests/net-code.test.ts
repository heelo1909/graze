import { describe, expect, test } from 'vitest';
import { makeRoomCode, normalizeCode, peerIdFor } from '../src/net/code';

describe('room codes', () => {
  test('makeRoomCode gives 4 alphabet letters', () => {
    for (let i = 0; i < 200; i++) {
      expect(makeRoomCode(Math.random)).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
    }
  });

  test('normalizeCode accepts messy input', () => {
    expect(normalizeCode(' kq-zt ')).toBe('KQZT');
    expect(normalizeCode('kqzt')).toBe('KQZT');
  });

  test('normalizeCode rejects ambiguous letters', () => {
    expect(normalizeCode('KQ0T')).toBeNull();
    expect(normalizeCode('KQIT')).toBeNull();
    expect(normalizeCode('KQOT')).toBeNull();
    expect(normalizeCode('KQZ')).toBeNull();
    expect(normalizeCode('KQZTA')).toBeNull();
  });

  test('peerIdFor prefixes the code', () => {
    expect(peerIdFor('KQZT')).toBe('graze-KQZT');
  });
});
