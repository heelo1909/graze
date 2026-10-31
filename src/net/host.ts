// Host side of an online room. This file holds the lobby; the match loop is
// added to the same class. No DOM access in src/net/.
import type { Difficulty } from '../bots/bot';
import { TUNING } from '../config';
import { SEAT_COLORS, isToHost } from './protocol';
import type { LobbySeat, ToJoiner } from './protocol';
import type { Link, PeerId } from './transport';

const NAME_MAX = 12;

export class HostSession {
  /** Seat 0 is the host. */
  seats: LobbySeat[];
  bots = true;
  difficulty: Difficulty = 'normal';
  /** Set once the match begins; later hellos are refused. */
  started = false;
  /** peers[i] is the peer in seat i; seat 0 (the host) has no peer. */
  protected peers: Array<PeerId | null> = [null];
  private readonly changeCbs: Array<() => void> = [];

  constructor(
    protected readonly link: Link,
    hostName: string,
  ) {
    this.seats = [{ name: cleanName(hostName, 1), color: SEAT_COLORS[0] }];
    link.onMessage((from, msg) => this.handleMessage(from, msg));
    link.onLeave((peer) => this.handleLeave(peer));
  }

  onChange(cb: () => void): void {
    this.changeCbs.push(cb);
  }

  setBots(on: boolean): void {
    this.bots = on;
    this.lobbyChanged();
  }

  setDifficulty(d: Difficulty): void {
    this.difficulty = d;
    this.lobbyChanged();
  }

  canStart(): boolean {
    const cars = this.bots ? TUNING.NET_MAX_CARS : this.seats.length;
    return cars >= 2;
  }

  protected handleMessage(from: PeerId, msg: unknown): void {
    if (!isToHost(msg)) return;
    if (msg.t === 'hello') this.handleHello(from, msg.name);
  }

  private handleHello(from: PeerId, rawName: string): void {
    if (this.peers.includes(from)) return;
    if (this.started) return this.refuse(from, 'started');
    if (this.seats.length >= TUNING.NET_MAX_CARS) return this.refuse(from, 'full');
    const seat = this.seats.length;
    this.seats.push({ name: cleanName(rawName, seat + 1), color: SEAT_COLORS[seat] ?? SEAT_COLORS[0] });
    this.peers.push(from);
    this.lobbyChanged();
  }

  private refuse(peer: PeerId, reason: 'full' | 'started'): void {
    this.link.send({ t: 'refused', reason } satisfies ToJoiner, peer);
    this.link.kick(peer);
  }

  protected handleLeave(peer: PeerId): void {
    const i = this.peers.indexOf(peer);
    if (i < 1 || this.started) return;
    this.seats.splice(i, 1);
    this.peers.splice(i, 1);
    this.seats.forEach((s, k) => (s.color = SEAT_COLORS[k] ?? SEAT_COLORS[0]));
    this.lobbyChanged();
  }

  protected lobbyChanged(): void {
    for (let i = 1; i < this.peers.length; i++) {
      const peer = this.peers[i];
      if (peer == null) continue;
      const m: ToJoiner = {
        t: 'lobby',
        seats: this.seats,
        bots: this.bots,
        difficulty: this.difficulty,
        you: i,
      };
      this.link.send(m, peer);
    }
    for (const cb of this.changeCbs) cb();
  }
}

function cleanName(raw: string, seatNumber: number): string {
  const n = raw.trim().slice(0, NAME_MAX).trim();
  return n === '' ? `Player ${seatNumber}` : n;
}
