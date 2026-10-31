// Host side of an online room. This file holds the lobby; the match loop is
// added to the same class. No DOM access in src/net/.
import { botSteer, newBotMemory } from '../bots/bot';
import type { BotMemory, Difficulty } from '../bots/bot';
import { TUNING } from '../config';
import { createMatch, stepMatch } from '../sim/match';
import type { Match } from '../sim/match';
import type { SimEvent, Slot, Steer } from '../sim/types';
import { BOT_NAMES, SEAT_COLORS, isToHost } from './protocol';
import type { LobbySeat, NetSnap, ToJoiner } from './protocol';
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
  match: Match | null = null;
  private readonly steers = new Map<PeerId, Steer>();
  private mem: BotMemory[] = [];
  private tickCount = 0;
  private pending: SimEvent[] = [];
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
    if (this.started) return;
    this.bots = on;
    this.lobbyChanged();
  }

  setDifficulty(d: Difficulty): void {
    if (this.started) return;
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
    else if (this.match && this.peers.includes(from)) this.steers.set(from, msg.s);
  }

  /** Builds the slots (seats as humans, then bots up to the car cap), tells every joiner, returns the match. */
  start(seed: number): Match {
    const slots: Slot[] = this.seats.map((s) => ({ name: s.name, color: s.color, isBot: false }));
    if (this.bots) {
      for (let i = slots.length; i < TUNING.NET_MAX_CARS; i++) {
        slots.push({
          name: BOT_NAMES[i - this.seats.length] ?? `Bot ${i}`,
          color: SEAT_COLORS[i] ?? SEAT_COLORS[0],
          isBot: true,
        });
      }
    }
    this.started = true;
    this.steers.clear();
    this.mem = slots.map(() => newBotMemory());
    this.tickCount = 0;
    this.pending = [];
    const match = createMatch(slots, seed);
    this.match = match;
    for (let i = 1; i < this.peers.length; i++) {
      const peer = this.peers[i];
      if (peer == null) continue;
      this.link.send({ t: 'start', slots, seed, you: i } satisfies ToJoiner, peer);
    }
    return match;
  }

  /** One fixed step. Returns this tick's events for the host's own renderer. */
  step(localSteer: Steer): SimEvent[] {
    const m = this.match;
    if (!m || m.phase === 'matchEnd') return [];
    const steers: Steer[] = m.world.cars.map((car, i) => {
      if (m.phase !== 'play') return 0;
      if (car.isBot) return car.alive ? botSteer(m.world, i, this.mem[i]!, this.difficulty) : 0;
      if (i === 0) return localSteer;
      const peer = this.peers[i];
      return (peer == null ? undefined : this.steers.get(peer)) ?? 0;
    });
    const events = stepMatch(m, steers);
    const ended = (): boolean => m.phase === 'matchEnd'; // stepMatch may have moved it on
    this.pending.push(...events);
    this.tickCount++;
    if (this.tickCount % TUNING.NET_SNAP_EVERY_TICKS === 0 || ended()) this.sendSnap(m);
    return events;
  }

  private sendSnap(m: Match): void {
    const snap: NetSnap = {
      tick: this.tickCount,
      phase: m.phase,
      phaseTime: m.phaseTime,
      round: m.round,
      totals: m.totals,
      lastRound: m.lastRound,
      cutoffTotals: m.cutoffTotals,
      time: m.world.time,
      bounds: m.world.bounds,
      cars: m.world.cars.map((c) => ({
        x: c.x, y: c.y, vx: c.vx, vy: c.vy, heading: c.heading,
        hold: c.hold, boost: c.boost, alive: c.alive,
      })),
      events: this.pending,
    };
    this.pending = [];
    this.link.send({ t: 'snap', snap } satisfies ToJoiner);
  }

  /** Back to the lobby after a match; leavers' seats are dropped. Only valid in matchEnd. */
  toLobby(): void {
    if (!this.match || this.match.phase !== 'matchEnd') return;
    const keep = this.peers.map((p, i) => i === 0 || p != null);
    this.seats = this.seats.filter((_, i) => keep[i]);
    this.peers = this.peers.filter((_, i) => keep[i]);
    this.seats.forEach((s, k) => (s.color = SEAT_COLORS[k] ?? SEAT_COLORS[0]));
    this.match = null;
    this.started = false;
    this.steers.clear();
    this.pending = [];
    this.lobbyChanged();
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
    if (i < 1) return;
    if (this.started) return this.leaveMatch(i, peer);
    this.seats.splice(i, 1);
    this.peers.splice(i, 1);
    this.seats.forEach((s, k) => (s.color = SEAT_COLORS[k] ?? SEAT_COLORS[0]));
    this.lobbyChanged();
  }

  /** A joiner left mid-match: its seat keeps playing as a bot. */
  private leaveMatch(seat: number, peer: PeerId): void {
    this.peers[seat] = null;
    this.steers.delete(peer);
    const m = this.match;
    const slot = m?.slots[seat];
    if (m && slot) {
      slot.isBot = true;
      const car = m.world.cars[seat];
      if (car) car.isBot = true;
      this.mem[seat] = newBotMemory();
    }
    this.link.send({ t: 'left', seat } satisfies ToJoiner);
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
