import { describe, expect, test } from 'vitest';
import { LoopbackHub } from '../src/net/loopback';
import { HostSession } from '../src/net/host';
import { SEAT_COLORS, isToJoiner } from '../src/net/protocol';
import type { NetSnap, ToJoiner } from '../src/net/protocol';
import type { Link } from '../src/net/transport';
import { DT } from '../src/config';

interface Joiner { link: Link; got: unknown[] }

async function setup(joiners: number) {
  const hub = new LoopbackHub();
  const hostLink = await hub.transport().createRoom();
  const session = new HostSession(hostLink, 'host');
  const js: Joiner[] = [];
  for (let i = 0; i < joiners; i++) {
    const link = await hub.transport().joinRoom(hostLink.code);
    const j: Joiner = { link, got: [] };
    link.onMessage((_f, m) => j.got.push(m));
    hub.flush();
    link.send({ t: 'hello', name: `j${i + 1}` });
    hub.flush();
    js.push(j);
  }
  return { hub, session, js };
}

const ofType = <T extends ToJoiner['t']>(j: Joiner, t: T): Array<Extract<ToJoiner, { t: T }>> =>
  j.got.filter((m) => isToJoiner(m) && m.t === t) as Array<Extract<ToJoiner, { t: T }>>;

function run(session: HostSession, hub: LoopbackHub, seconds: number) {
  const events = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    events.push(...session.step(0));
    hub.flush();
  }
  return events;
}

describe('host match loop', () => {
  test('start builds human then bot slots', async () => {
    const { hub, session, js } = await setup(1);
    const m = session.start(1);
    hub.flush();
    expect(m.slots.map((s) => s.name)).toEqual(['host', 'j1', 'Pixel', 'Rook']);
    expect(m.slots.map((s) => s.isBot)).toEqual([false, false, true, true]);
    expect(m.slots.map((s) => s.color)).toEqual([...SEAT_COLORS]);
    expect(session.started).toBe(true);
    expect(session.match).toBe(m);
    expect(ofType(js[0]!, 'start')[0]).toMatchObject({ seed: 1, you: 1 });

    const b = await setup(1);
    b.session.setBots(false);
    expect(b.session.start(1).slots).toHaveLength(2);
  });

  test('snapshots at 30 Hz carry trail events', async () => {
    const { hub, session, js } = await setup(1);
    session.start(3);
    const events = run(session, hub, 4);
    const snaps = ofType(js[0]!, 'snap').map((m) => m.snap);
    expect(Math.abs(snaps.length - 120)).toBeLessThanOrEqual(2);
    for (let i = 1; i < snaps.length; i++) expect(snaps[i]!.tick).toBeGreaterThan(snaps[i - 1]!.tick);
    const trails = (s: NetSnap[]) => s.reduce((n, x) => n + x.events.filter((e) => e.type === 'trail').length, 0);
    expect(trails(snaps)).toBe(events.filter((e) => e.type === 'trail').length);
    expect(trails(snaps)).toBeGreaterThan(0);
  });

  test('joiner steer moves its car', async () => {
    const { hub, session, js } = await setup(1);
    const m = session.start(5);
    run(session, hub, 3.5); // through the countdown
    expect(m.phase).toBe('play');
    const h0 = m.world.cars[1]!.heading;
    js[0]!.link.send({ t: 'steer', s: 1 });
    hub.flush();
    run(session, hub, 1);
    expect(Math.abs(m.world.cars[1]!.heading - h0)).toBeGreaterThan(0.5);
  });

  test('steer from a peer with no seat is ignored', async () => {
    const { hub, session } = await setup(1);
    const stray = await hub.transport().joinRoom((session as unknown as { link: Link }).link.code);
    hub.flush();
    session.start(5);
    stray.send({ t: 'steer', s: 1 });
    hub.flush();
    expect(() => run(session, hub, 0.5)).not.toThrow();
  });

  test('leaver becomes a bot mid-match', async () => {
    const { hub, session, js } = await setup(2);
    const m = session.start(7);
    run(session, hub, 4);
    js[0]!.link.close();
    hub.flush();
    expect(m.slots[1]!.isBot).toBe(true);
    expect(m.world.cars[1]!.isBot).toBe(true);
    expect(ofType(js[1]!, 'left')).toEqual([{ t: 'left', seat: 1 }]);
    expect(() => run(session, hub, 5)).not.toThrow();
  });

  test('later rounds build the leaver as a bot', async () => {
    const { hub, session, js } = await setup(1);
    const m = session.start(7);
    js[0]!.link.close();
    hub.flush();
    expect(m.slots[1]!.isBot).toBe(true);
    for (let i = 0; i < 60 * 120 && m.round < 2; i++) session.step(0);
    expect(m.round).toBe(2);
    expect(m.world.cars[1]!.isBot).toBe(true);
  });

  test('settings are frozen once started', async () => {
    const { hub, session, js } = await setup(1);
    session.start(1);
    hub.flush();
    const n = js[0]!.got.length;
    let changes = 0;
    session.onChange(() => changes++);
    session.setBots(false);
    session.setDifficulty('hard');
    hub.flush();
    expect(session.bots).toBe(true);
    expect(session.difficulty).toBe('normal');
    expect(js[0]!.got.length).toBe(n);
    expect(changes).toBe(0);
  });

  test('toLobby only at match end', async () => {
    const { hub, session, js } = await setup(2);
    const m = session.start(9);
    run(session, hub, 4);
    js[0]!.link.close();
    hub.flush();
    session.toLobby();
    expect(session.match).toBe(m);
    expect(session.started).toBe(true);
    m.phase = 'matchEnd';
    const before = ofType(js[1]!, 'lobby').length;
    session.toLobby();
    hub.flush();
    expect(session.match).toBeNull();
    expect(session.started).toBe(false);
    expect(session.seats.map((s) => s.name)).toEqual(['host', 'j2']);
    const lobbies = ofType(js[1]!, 'lobby');
    expect(lobbies.length).toBe(before + 1);
    expect(lobbies[lobbies.length - 1]!.you).toBe(1);
  });
});
