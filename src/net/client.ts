// Joiner side of an online room: mirrors the host's match from snapshots so the
// normal renderer and HUD can draw it. No DOM access in src/net/.
import { createMatch } from '../sim/match';
import type { Match } from '../sim/match';
import { createWorld } from '../sim/world';
import type { Car, SimEvent, Steer } from '../sim/types';
import { isToJoiner } from './protocol';
import type { NetSnap, ToHost, ToJoiner } from './protocol';
import { Predictor } from './predict';
import { SnapBuffer } from './snapbuf';
import type { Link } from './transport';

export type ClientState = 'lobby' | 'refused' | 'playing' | 'hostLeft';

export class ClientSession {
  state: ClientState = 'lobby';
  refusedReason: 'full' | 'started' | null = null;
  lobby: Extract<ToJoiner, { t: 'lobby' }> | null = null;
  you = 0;
  /** The mirror of the host's match; null outside a match. */
  match: Match | null = null;
  private readonly buf = new SnapBuffer();
  private readonly predictor = new Predictor();
  private events: SimEvent[] = [];
  private feed: string[] = [];
  private lastSent: Steer | null = null;
  /** Clock time of the newest snap this match (null before the first). */
  lastSnapAt: number | null = null;
  private out: Car[] = [];
  private readonly changeCbs: Array<() => void> = [];

  constructor(
    private readonly link: Link,
    name: string,
    private readonly clock: () => number = () => performance.now() / 1000,
  ) {
    link.onMessage((_from, msg) => this.handle(msg));
    link.onLeave(() => {
      if (this.state !== 'refused') this.state = 'hostLeft'; // a refusal kicks us too
      this.changed();
    });
    link.send({ t: 'hello', name } satisfies ToHost);
  }

  onChange(cb: () => void): void {
    this.changeCbs.push(cb);
  }

  sendSteer(s: Steer): void {
    if (s === this.lastSent) return;
    this.lastSent = s;
    this.link.send({ t: 'steer', s } satisfies ToHost);
  }

  /** Events from snaps since the last call, for the renderer and audio. */
  takeEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Feed lines (e.g. "Rook left") since the last call. */
  takeFeed(): string[] {
    const f = this.feed;
    this.feed = [];
    return f;
  }

  stale(now: number): boolean {
    return this.buf.stale(now);
  }

  /** One fixed step of the own-car prediction; only while the round is live. */
  stepLocal(steer: Steer): void {
    if (this.predicting()) this.predictor.step(steer);
  }

  /** Cars to draw at `now`: own car predicted during play, everything else interpolated. */
  cars(now: number): Car[] {
    const m = this.match;
    if (!m) return this.out;
    const poses = this.buf.poses(now);
    const cars = m.world.cars;
    while (this.out.length < cars.length) this.out.push({ ...cars[this.out.length]! });
    this.out.length = cars.length;
    const own = this.predicting();
    cars.forEach((c, i) => {
      const o = this.out[i]!;
      Object.assign(o, c);
      const p = own && i === this.you ? this.predictor.car : poses?.[i];
      if (!p) return;
      o.x = p.x; o.y = p.y; o.vx = p.vx; o.vy = p.vy;
      o.heading = p.heading; o.hold = p.hold; o.boost = p.boost;
    });
    return this.out;
  }

  private predicting(): boolean {
    const m = this.match;
    return m !== null && m.phase === 'play' && m.world.cars[this.you]?.alive === true;
  }

  private handle(msg: unknown): void {
    if (!isToJoiner(msg)) return;
    switch (msg.t) {
      case 'lobby':
        this.lobby = msg;
        this.you = msg.you;
        if (this.state === 'playing') this.endMatch();
        this.state = 'lobby';
        break;
      case 'refused':
        this.state = 'refused';
        this.refusedReason = msg.reason;
        break;
      case 'start':
        this.you = msg.you;
        this.match = createMatch(msg.slots, msg.seed);
        this.buf.clear();
        this.events = [];
        this.lastSent = null;
        this.lastSnapAt = null;
        this.predictor.reset(this.match.world.cars[this.you] ?? this.predictor.car);
        this.state = 'playing';
        break;
      case 'snap':
        this.applySnap(msg.snap);
        break;
      case 'left': {
        const m = this.match;
        const slot = m?.slots[msg.seat];
        if (!m || !slot) return;
        slot.isBot = true;
        const car = m.world.cars[msg.seat];
        if (car) car.isBot = true;
        this.feed.push(`${slot.name} left`);
        break;
      }
    }
    this.changed();
  }

  private endMatch(): void {
    this.match = null;
    this.lastSnapAt = null;
    this.buf.clear();
    this.events = [];
  }

  private applySnap(s: NetSnap): void {
    const m = this.match;
    if (!m) return;
    if (s.round !== m.round) {
      m.world = createWorld(m.slots, m.seed + s.round);
      this.events = []; // queued old-round events would paint ghost trails on the new world
      this.buf.clear();
      this.predictor.reset(m.world.cars[this.you] ?? this.predictor.car);
    }
    m.phase = s.phase;
    m.phaseTime = s.phaseTime;
    m.round = s.round;
    m.totals = s.totals;
    m.lastRound = s.lastRound;
    m.cutoffTotals = s.cutoffTotals;
    m.world.time = s.time;
    m.world.bounds = s.bounds;
    s.cars.forEach((n, i) => {
      const c = m.world.cars[i];
      if (!c) return;
      c.x = n.x; c.y = n.y; c.vx = n.vx; c.vy = n.vy;
      c.heading = n.heading; c.hold = n.hold; c.boost = n.boost; c.alive = n.alive;
    });
    this.lastSnapAt = this.clock();
    this.buf.push(s, this.lastSnapAt);
    const mine = s.cars[this.you];
    if (mine?.alive) this.predictor.correct(mine);
    this.events.push(...s.events);
  }

  private changed(): void {
    for (const cb of this.changeCbs) cb();
  }
}
