// In-memory transport for tests. Everything is queued and delivered in order
// on flush(); messages round-trip through JSON so non-serialisable data fails.
import { makeRoomCode } from './code';
import { RoomError } from './transport';
import type { Link, PeerId, Transport } from './transport';

interface Callbacks {
  message: Array<(from: PeerId, msg: unknown) => void>;
  join: Array<(peer: PeerId) => void>;
  leave: Array<(peer: PeerId) => void>;
}

class LoopLink implements Link {
  readonly cb: Callbacks = { message: [], join: [], leave: [] };
  /** True once this side called close(); nothing more is delivered to it. */
  closed = false;
  /** Joiner only: false once kicked, so it can no longer send. */
  connected = true;

  constructor(
    private readonly hub: LoopbackHub,
    readonly code: string,
    readonly isHost: boolean,
    readonly id: PeerId,
  ) {}

  send(msg: unknown, to?: PeerId): void {
    this.hub.route(this, JSON.parse(JSON.stringify(msg)) as unknown, to);
  }
  onMessage(cb: (from: PeerId, msg: unknown) => void): void {
    this.cb.message.push(cb);
  }
  onJoin(cb: (peer: PeerId) => void): void {
    this.cb.join.push(cb);
  }
  onLeave(cb: (peer: PeerId) => void): void {
    this.cb.leave.push(cb);
  }
  kick(peer: PeerId): void {
    if (this.isHost) this.hub.kick(this, peer);
  }
  close(): void {
    this.hub.close(this);
  }
}

interface Room {
  host: LoopLink;
  joiners: Map<PeerId, LoopLink>;
}

/** Connects any number of loopback transports; call flush() to deliver. */
export class LoopbackHub {
  private readonly rooms = new Map<string, Room>();
  private queue: Array<() => void> = [];
  private nextId = 1;

  /** A transport for one player. */
  transport(): Transport {
    return {
      createRoom: () => Promise.resolve(this.create()),
      joinRoom: (code) => this.join(code),
    };
  }

  /** Delivers queued messages, joins and leaves in order (including any they queue). */
  flush(): void {
    while (this.queue.length > 0) {
      const batch = this.queue;
      this.queue = [];
      for (const job of batch) job();
    }
  }

  private create(): Link {
    let code = makeRoomCode(Math.random);
    while (this.rooms.has(code)) code = makeRoomCode(Math.random);
    const host = new LoopLink(this, code, true, code);
    this.rooms.set(code, { host, joiners: new Map() });
    return host;
  }

  private join(code: string): Promise<Link> {
    const room = this.rooms.get(code);
    if (!room) return Promise.reject(new RoomError('not-found', `No room ${code}`));
    const id = `joiner-${this.nextId++}`;
    const link = new LoopLink(this, code, false, id);
    room.joiners.set(id, link);
    this.queue.push(() => this.deliverJoin(room.host, id));
    return Promise.resolve(link);
  }

  /** @internal Called by links. */
  route(from: LoopLink, msg: unknown, to?: PeerId): void {
    if (from.closed || !from.connected) return;
    const room = this.rooms.get(from.code);
    if (!room || (!from.isHost && room.joiners.get(from.id) !== from)) return;
    const targets: LoopLink[] = from.isHost
      ? to === undefined
        ? [...room.joiners.values()]
        : [room.joiners.get(to)].filter((l): l is LoopLink => l !== undefined)
      : [room.host];
    for (const t of targets) this.queue.push(() => this.deliverMessage(t, from.id, msg));
  }

  /** @internal Host drops a joiner; only the joiner hears about it. */
  kick(host: LoopLink, peer: PeerId): void {
    const room = this.rooms.get(host.code);
    const joiner = room?.joiners.get(peer);
    if (!room || room.host !== host || !joiner) return;
    room.joiners.delete(peer);
    joiner.connected = false;
    this.queue.push(() => this.deliverLeave(joiner, host.id));
  }

  /** @internal */
  close(link: LoopLink): void {
    if (link.closed) return;
    link.closed = true;
    const room = this.rooms.get(link.code);
    if (!room) return;
    if (link.isHost) {
      this.rooms.delete(link.code);
      for (const j of room.joiners.values()) this.queue.push(() => this.deliverLeave(j, link.id));
    } else if (room.joiners.delete(link.id)) {
      this.queue.push(() => this.deliverLeave(room.host, link.id));
    }
  }

  private deliverMessage(to: LoopLink, from: PeerId, msg: unknown): void {
    if (to.closed) return;
    for (const cb of to.cb.message) cb(from, msg);
  }
  private deliverJoin(host: LoopLink, peer: PeerId): void {
    if (host.closed) return;
    for (const cb of host.cb.join) cb(peer);
  }
  private deliverLeave(to: LoopLink, peer: PeerId): void {
    if (to.closed) return;
    for (const cb of to.cb.leave) cb(peer);
  }
}
