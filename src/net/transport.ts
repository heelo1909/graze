// Transport seam for online play. The PeerJS transport and the in-memory
// loopback both implement this, so game code never sees the wire.
// No DOM access in src/net/.

export type PeerId = string;

export interface Link {
  readonly code: string;
  readonly isHost: boolean;
  /** Host: to one peer, or every peer when `to` is omitted. Joiner: always to the host. */
  send(msg: unknown, to?: PeerId): void;
  onMessage(cb: (from: PeerId, msg: unknown) => void): void;
  /** Host only: a joiner connected. */
  onJoin(cb: (peer: PeerId) => void): void;
  /** Host: a joiner left. Joiner: the host left (peer = host). */
  onLeave(cb: (peer: PeerId) => void): void;
  /**
   * Host only: drop one joiner. On a joiner's link this is a no-op.
   * The kicked joiner's `onLeave` fires (with the host's id); the host's own
   * `onLeave` does NOT fire for a kick it initiated.
   */
  kick(peer: PeerId): void;
  close(): void;
}

export interface Transport {
  createRoom(): Promise<Link>;
  joinRoom(code: string): Promise<Link>;
}

/** Why creating or joining a room failed. */
export class RoomError extends Error {
  constructor(
    readonly kind: 'not-found' | 'network' | 'taken',
    message: string,
  ) {
    super(message);
    this.name = 'RoomError';
  }
}
