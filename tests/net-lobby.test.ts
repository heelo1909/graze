import { describe, expect, test } from 'vitest';
import { LoopbackHub } from '../src/net/loopback';
import { HostSession } from '../src/net/host';
import { SEAT_COLORS, isToHost, isToJoiner } from '../src/net/protocol';
import type { ToJoiner } from '../src/net/protocol';
import type { Link } from '../src/net/transport';

interface Joiner { link: Link; got: unknown[]; left: number }

async function setup() {
  const hub = new LoopbackHub();
  const hostLink = await hub.transport().createRoom();
  const session = new HostSession(hostLink, 'host');
  async function join(name: string, hello = true): Promise<Joiner> {
    const link = await hub.transport().joinRoom(hostLink.code);
    const j: Joiner = { link, got: [], left: 0 };
    link.onMessage((_f, m) => j.got.push(m));
    link.onLeave(() => j.left++);
    hub.flush();
    if (hello) link.send({ t: 'hello', name });
    hub.flush();
    return j;
  }
  return { hub, session, join };
}

const lastLobby = (j: Joiner): Extract<ToJoiner, { t: 'lobby' }> | undefined => {
  const l = j.got.filter((m) => isToJoiner(m) && m.t === 'lobby');
  return l[l.length - 1] as Extract<ToJoiner, { t: 'lobby' }> | undefined;
};

describe('host lobby', () => {
  test('joiners get seats and colors in order', async () => {
    const { session, join } = await setup();
    await join('a');
    const b = await join('b');
    expect(session.seats.map((s) => s.name)).toEqual(['host', 'a', 'b']);
    expect(session.seats.map((s) => s.color)).toEqual(SEAT_COLORS.slice(0, 3));
    expect(lastLobby(b)?.you).toBe(2);
  });

  test('fifth player refused full', async () => {
    const { session, join } = await setup();
    for (const n of ['a', 'b', 'c']) await join(n);
    const e = await join('e');
    expect(e.got).toContainEqual({ t: 'refused', reason: 'full' });
    expect(e.left).toBe(1);
    expect(session.seats).toHaveLength(4);
  });

  test('hello after start is refused', async () => {
    const { session, join } = await setup();
    session.started = true;
    const a = await join('a');
    expect(a.got).toContainEqual({ t: 'refused', reason: 'started' });
    expect(a.left).toBe(1);
    expect(session.seats).toHaveLength(1);
  });

  test('leaving in lobby frees the seat', async () => {
    const { hub, session, join } = await setup();
    const a = await join('a');
    const b = await join('b');
    a.link.close();
    hub.flush();
    expect(session.seats.map((s) => s.name)).toEqual(['host', 'b']);
    expect(lastLobby(b)?.you).toBe(1);
  });

  test('connected joiner without hello gets no seat or lobby', async () => {
    const { hub, session, join } = await setup();
    const a = await join('a', false);
    session.setBots(false);
    hub.flush();
    expect(a.got).toEqual([]);
    a.link.close();
    hub.flush();
    expect(session.seats).toHaveLength(1);
  });

  test('cannot start alone without bots', async () => {
    const { session } = await setup();
    session.setBots(false);
    expect(session.canStart()).toBe(false);
    session.setBots(true);
    expect(session.canStart()).toBe(true);
  });

  test('lobby message survives JSON and carries settings', async () => {
    const { hub, session, join } = await setup();
    const a = await join('a');
    session.setDifficulty('hard');
    session.setBots(false);
    hub.flush();
    expect(lastLobby(a)).toEqual({
      t: 'lobby',
      seats: session.seats,
      bots: false,
      difficulty: 'hard',
      you: 1,
    });
  });

  test('names are trimmed, cut to 12, and defaulted', async () => {
    const { session, join } = await setup();
    await join('  abcdefghijklmnop  ');
    await join('   ');
    expect(session.seats.map((s) => s.name)).toEqual(['host', 'abcdefghijkl', 'Player 3']);
  });

  test('onChange fires on lobby changes', async () => {
    const { session, join } = await setup();
    let n = 0;
    session.onChange(() => n++);
    await join('a');
    session.setBots(false);
    expect(n).toBe(2);
  });

  test('duplicate hello does not take a second seat', async () => {
    const { hub, session, join } = await setup();
    const a = await join('a');
    a.link.send({ t: 'hello', name: 'again' });
    hub.flush();
    expect(session.seats).toHaveLength(2);
    expect(session.seats[1]!.name).toBe('a');
    expect(lastLobby(a)?.you).toBe(1);
  });

  test('guards validate untrusted input', () => {
    expect(isToHost({ t: 'hello', name: 'x' })).toBe(true);
    expect(isToHost({ t: 'hello', name: 5 })).toBe(false);
    expect(isToHost({ t: 'steer', s: 1 })).toBe(true);
    expect(isToHost({ t: 'steer', s: 2 })).toBe(false);
    expect(isToHost(null)).toBe(false);
    expect(isToHost({ t: 'nope' })).toBe(false);
    expect(isToJoiner({ t: 'refused', reason: 'full' })).toBe(true);
    expect(isToJoiner('x')).toBe(false);
  });
});
