// PeerJS transport (WebRTC data channels, brokered by the public PeerJS cloud).
// peerjs is loaded with a dynamic import so it ships in its own chunk and the
// solo game never downloads it. Same semantics as the loopback; see transport.ts.
import type { DataConnection, Peer } from 'peerjs';
import { makeRoomCode, normalizeCode, peerIdFor } from './code';
import { RoomError } from './transport';
import type { Link, PeerId, Transport } from './transport';

const MAX_CODE_TRIES = 5;
const JOIN_TIMEOUT_MS = 8000;

async function loadPeer(): Promise<typeof Peer> {
  const mod = await import('peerjs');
  return mod.Peer;
}

/** Resolves when the Peer is registered with the broker; rejects with the PeerJS error. */
function whenOpen(peer: Peer): Promise<void> {
  return new Promise((resolve, reject) => {
    peer.once('open', () => resolve());
    peer.once('error', (err) => reject(err));
  });
}

function errType(err: unknown): string {
  return typeof err === 'object' && err !== null && 'type' in err ? String((err as { type: unknown }).type) : '';
}

class PeerLink implements Link {
  private readonly msgCbs: Array<(from: PeerId, msg: unknown) => void> = [];
  private readonly joinCbs: Array<(peer: PeerId) => void> = [];
  private readonly leaveCbs: Array<(peer: PeerId) => void> = [];
  /** Host: open joiner connections by peer id. Joiner: just the host. */
  private readonly conns = new Map<PeerId, DataConnection>();
  private closed = false;

  constructor(
    private readonly peer: Peer,
    readonly code: string,
    readonly isHost: boolean,
  ) {}

  /** @internal Wires a connection into this link (already open for a joiner). */
  attach(conn: DataConnection): void {
    const id = conn.peer;
    conn.on('data', (msg) => {
      if (this.conns.get(id) === conn) for (const cb of this.msgCbs) cb(id, msg);
    });
    conn.on('close', () => {
      if (this.conns.get(id) !== conn) return; // already removed (kick or close)
      this.conns.delete(id);
      if (!this.closed) for (const cb of this.leaveCbs) cb(id);
    });
    conn.on('error', () => conn.close());
    this.conns.set(id, conn);
  }

  /** @internal Host: a joiner's channel opened. */
  joined(conn: DataConnection): void {
    this.attach(conn);
    for (const cb of this.joinCbs) cb(conn.peer);
  }

  send(msg: unknown, to?: PeerId): void {
    if (this.closed) return;
    if (this.isHost && to !== undefined) this.conns.get(to)?.send(msg);
    else for (const c of this.conns.values()) c.send(msg);
  }
  onMessage(cb: (from: PeerId, msg: unknown) => void): void {
    this.msgCbs.push(cb);
  }
  onJoin(cb: (peer: PeerId) => void): void {
    this.joinCbs.push(cb);
  }
  onLeave(cb: (peer: PeerId) => void): void {
    this.leaveCbs.push(cb);
  }
  kick(peer: PeerId): void {
    if (!this.isHost) return;
    const conn = this.conns.get(peer);
    if (!conn) return;
    this.conns.delete(peer); // removed first, so our own 'close' handler stays silent
    conn.close();
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.conns.clear();
    this.peer.destroy();
  }
}

export function peerTransport(): Transport {
  return {
    async createRoom(): Promise<Link> {
      const PeerCtor = await loadPeer();
      for (let i = 0; i < MAX_CODE_TRIES; i++) {
        const code = makeRoomCode(Math.random);
        const peer = new PeerCtor(peerIdFor(code));
        try {
          await whenOpen(peer);
        } catch (err) {
          peer.destroy();
          if (errType(err) === 'unavailable-id') continue;
          throw new RoomError('network', `Could not reach the room server (${errType(err) || 'error'})`);
        }
        const link = new PeerLink(peer, code, true);
        peer.on('connection', (conn) => conn.on('open', () => link.joined(conn)));
        peer.on('error', () => { /* a failed joiner attempt must not kill the room */ });
        return link;
      }
      throw new RoomError('taken', 'Could not find a free room code');
    },

    async joinRoom(raw: string): Promise<Link> {
      const code = normalizeCode(raw);
      if (code === null) throw new RoomError('not-found', 'Check the code');
      const PeerCtor = await loadPeer();
      const peer = new PeerCtor();
      try {
        await whenOpen(peer);
      } catch (err) {
        peer.destroy();
        throw new RoomError('network', `Could not reach the room server (${errType(err) || 'error'})`);
      }
      const conn = await new Promise<DataConnection>((resolve, reject) => {
        const c = peer.connect(peerIdFor(code), { reliable: true });
        const timer = setTimeout(() => reject(new RoomError('not-found', 'Room not found')), JOIN_TIMEOUT_MS);
        const fail = (e: RoomError): void => { clearTimeout(timer); reject(e); };
        c.on('open', () => { clearTimeout(timer); resolve(c); });
        peer.on('error', (err) => {
          fail(errType(err) === 'peer-unavailable'
            ? new RoomError('not-found', 'Room not found')
            : new RoomError('network', `Connection failed (${errType(err) || 'error'})`));
        });
      }).catch((e: unknown) => {
        peer.destroy();
        throw e;
      });
      const link = new PeerLink(peer, code, false);
      link.attach(conn);
      return link;
    },
  };
}
