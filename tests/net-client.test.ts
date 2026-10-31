import { describe, expect, test } from 'vitest';
import { LoopbackHub } from '../src/net/loopback';
import { HostSession } from '../src/net/host';
import { ClientSession } from '../src/net/client';
import { DT } from '../src/config';

async function setup() {
  const hub = new LoopbackHub();
  const hostLink = await hub.transport().createRoom();
  const host = new HostSession(hostLink, 'host');
  let now = 0;
  const join = async () => {
    const c = new ClientSession(await hub.transport().joinRoom(hostLink.code), 'j', () => now);
    hub.flush();
    return c;
  };
  const client = await join();
  return { hub, host, client, join, hostLink, clock: (t: number) => (now = t) };
}

function run(s: Awaited<ReturnType<typeof setup>>, seconds: number, t0 = 0) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    s.clock(t0 + (i + 1) * DT);
    s.host.step(0);
    s.hub.flush();
    s.client.stepLocal(0);
  }
  return t0 + n * DT;
}

describe('ClientSession', () => {
  test('mirror follows the host', async () => {
    const s = await setup();
    expect(s.client.state).toBe('lobby');
    expect(s.client.you).toBe(1);
    s.host.start(7);
    s.hub.flush();
    expect(s.client.state).toBe('playing');
    const now = run(s, 3);
    s.hub.flush();
    const hm = s.host.match!;
    const cm = s.client.match!;
    expect(cm.phase).toBe(hm.phase);
    expect(cm.round).toBe(hm.round);
    expect(cm.totals).toEqual(hm.totals);
    expect(s.client.cars(now).length).toBe(4);
  });

  test('new round resets the world object', async () => {
    const s = await setup();
    s.host.start(3);
    s.hub.flush();
    const first = s.client.match!.world;
    let t = 0;
    for (let i = 0; i < 60 * 120 && s.host.match!.round === 1; i++) t = run(s, DT, t);
    expect(s.host.match!.round).toBeGreaterThan(1);
    run(s, 0.1, t);
    expect(s.client.match!.round).toBe(s.host.match!.round);
    expect(s.client.match!.world).not.toBe(first);
  });

  test('host leaving ends the session', async () => {
    const s = await setup();
    s.hostLink.close();
    s.hub.flush();
    expect(s.client.state).toBe('hostLeft');
  });

  test('refused when started', async () => {
    const s = await setup();
    s.host.start(1);
    s.hub.flush();
    const late = await s.join();
    s.hub.flush();
    expect(late.state).toBe('refused');
    expect(late.refusedReason).toBe('started');
  });

  test('sendSteer only sends changes', async () => {
    const s = await setup();
    s.host.start(1);
    s.hub.flush();
    const sent: unknown[] = [];
    const link = (s.client as unknown as { link: { send(m: unknown): void } }).link;
    const orig = link.send.bind(link);
    link.send = (m) => { sent.push(m); orig(m); };
    s.client.sendSteer(1); s.client.sendSteer(1); s.client.sendSteer(-1);
    expect(sent).toEqual([{ t: 'steer', s: 1 }, { t: 'steer', s: -1 }]);
  });
});
