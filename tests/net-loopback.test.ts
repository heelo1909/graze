import { describe, expect, test } from 'vitest';
import { LoopbackHub } from '../src/net/loopback';
import { RoomError } from '../src/net/transport';

describe('loopback transport', () => {
  test('loopback delivers both ways', async () => {
    const hub = new LoopbackHub();
    const host = await hub.transport().createRoom();
    const joiner = await hub.transport().joinRoom(host.code);
    const joins: string[] = [];
    const hostGot: unknown[] = [];
    const joinerGot: unknown[] = [];
    host.onJoin((p) => joins.push(p));
    host.onMessage((_f, m) => hostGot.push(m));
    joiner.onMessage((_f, m) => joinerGot.push(m));
    hub.flush();
    expect(joins).toHaveLength(1);
    joiner.send({ a: 1 });
    host.send({ b: 2 });
    hub.flush();
    expect(hostGot).toEqual([{ a: 1 }]);
    expect(joinerGot).toEqual([{ b: 2 }]);
  });

  test('loopback leave', async () => {
    const hub = new LoopbackHub();
    const host = await hub.transport().createRoom();
    const joiner = await hub.transport().joinRoom(host.code);
    const joins: string[] = [];
    const left: string[] = [];
    host.onJoin((p) => joins.push(p));
    host.onLeave((p) => left.push(p));
    hub.flush();
    joiner.close();
    hub.flush();
    expect(left).toEqual(joins);
    expect(left).toHaveLength(1);

    const host2 = await hub.transport().createRoom();
    const joiner2 = await hub.transport().joinRoom(host2.code);
    const hostLeft: string[] = [];
    host2.onJoin(() => {});
    joiner2.onLeave((p) => hostLeft.push(p));
    hub.flush();
    host2.close();
    hub.flush();
    expect(hostLeft).toHaveLength(1);
  });

  test('host kick fires the joiner onLeave only', async () => {
    const hub = new LoopbackHub();
    const host = await hub.transport().createRoom();
    const joiner = await hub.transport().joinRoom(host.code);
    const joins: string[] = [];
    const hostLeft: string[] = [];
    const joinerLeft: string[] = [];
    host.onJoin((p) => joins.push(p));
    host.onLeave((p) => hostLeft.push(p));
    joiner.onLeave((p) => joinerLeft.push(p));
    hub.flush();
    const peer = joins[0]!;
    joiner.kick(peer); // no-op on a joiner link
    hub.flush();
    expect(joinerLeft).toHaveLength(0);
    host.kick(peer);
    hub.flush();
    expect(joinerLeft).toEqual([host.code]);
    expect(hostLeft).toHaveLength(0);
  });

  test('join unknown code rejects', async () => {
    const hub = new LoopbackHub();
    const err = await hub.transport().joinRoom('ZZZZ').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RoomError);
    expect((err as RoomError).kind).toBe('not-found');
  });
});
