// Online play: connects the host/join sessions (src/net) to the game screen.
// game.ts owns the canvas, input and audio; this file runs the lobby → match → match-end flow.
import type { Audio } from './audio';
import { DT, TUNING } from './config';
import type { Input } from './input';
import { matchWinJingle, roundWinJingle, stepsFor } from './loop';
import { ClientSession } from './net/client';
import { HostSession } from './net/host';
import { RoomError, type Link, type Transport } from './net/transport';
import { CarInterp, renderAlpha } from './render/interp';
import type { Renderer } from './render/renderer';
import type { Match } from './sim/match';
import { matchWinner, targetPoints } from './sim/scoring';
import type { SimEvent } from './sim/types';
import { el } from './ui/dom';
import { showLobby } from './ui/lobby';
import { clearScreen, showMatchEnd } from './ui/screens';

export interface OnlineDeps {
  ui: HTMLElement; renderer: Renderer; input: Input; audio: Audio; transport: Transport;
  toTitle(error?: string): void;
}
export interface OnlineGame {
  /** `now` and `frameDt` are in seconds. */
  frame(now: number, frameDt: number): void;
  leave(): void;
  /** Short status for the ?debug hook. */
  describe(): string;
}
export type OnlineMode = { kind: 'host'; name: string } | { kind: 'join'; name: string; code: string };

/** More events than this in one batch means the tab was in the background. */
export const BURST_MAX = 120;
const FEED_MAX = 4;
const FEED_COLOR = 'rgba(255,255,255,0.8)';

/** After a background burst only trail pieces are kept (they build the trail layer); the rest is stale. */
export function filterBurst(events: SimEvent[]): { events: SimEvent[]; burst: boolean } {
  if (events.length <= BURST_MAX) return { events, burst: false };
  return { events: events.filter((e) => e.type === 'trail'), burst: true };
}

export function refusedMessage(reason: 'full' | 'started' | null): string {
  return reason === 'full' ? 'That room is full' : 'That game already started';
}

type Screen = 'connecting' | 'lobby' | 'match' | 'end';

export function startOnline(deps: OnlineDeps, mode: OnlineMode): OnlineGame {
  const { ui, renderer, input, audio, transport, toTitle } = deps;
  let link: Link | null = null;
  let host: HostSession | null = null;
  let client: ClientSession | null = null;
  let closed = false;
  let screen: Screen = 'connecting';
  let acc = 0;
  let prevPhase = '';
  let tickShown = -1;
  const interp = new CarInterp();
  let prevBot: boolean[] = [];

  const match = (): Match | null => host?.match ?? client?.match ?? null;
  const local = (): number[] => [client ? client.you : 0];

  function close(): void {
    if (closed) return;
    closed = true;
    removeEventListener('pagehide', leave);
    renderer.setNotice(null);
    link?.close();
  }
  function leave(): void { close(); toTitle(); }
  function fail(msg: string): void { close(); toTitle(msg); }
  addEventListener('pagehide', leave);

  function connecting(): void {
    clearScreen(ui);
    const wrap = el('div', 'screen');
    const cancel = el('button', 'ghost', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', leave);
    wrap.append(el('p', 'keys', 'Connecting…'), cancel);
    ui.append(wrap);
  }

  function lobby(): void {
    screen = 'lobby';
    renderer.setNotice(null);
    input.releaseAll();
    if (host) {
      const h = host;
      showLobby(ui, {
        code: link!.code, seats: h.seats, isHost: true, you: 0, bots: h.bots, difficulty: h.difficulty, canStart: h.canStart(),
      }, {
        onStart: () => { if (h.canStart() && !h.started) beginMatch(h.start(Date.now() % 100000)); },
        onLeave: leave, onBots: (on) => h.setBots(on), onDifficulty: (d) => h.setDifficulty(d),
      });
    } else if (client?.lobby) {
      const l = client.lobby;
      showLobby(ui, {
        code: link!.code, seats: l.seats, isHost: false, you: client.you, bots: l.bots, difficulty: l.difficulty, canStart: false,
      }, { onStart: () => {}, onLeave: leave, onBots: () => {}, onDifficulty: () => {} });
    }
  }

  function beginMatch(m: Match): void {
    screen = 'match';
    renderer.setLocal(local());
    renderer.hud.clear();
    input.releaseAll();
    clearScreen(ui);
    acc = DT / 2;
    prevPhase = '';
    tickShown = -1;
    prevBot = m.slots.map((s) => s.isBot);
  }

  function react(events: SimEvent[], m: Match): void {
    const mine = local();
    const decided = matchWinner(m.totals, targetPoints(m.slots.length)) !== null;
    for (const e of events) {
      if (e.type === 'graze' && mine.includes(e.car)) audio.graze(m.world.cars[e.car]?.boost ?? 0);
      else if (e.type === 'crash') audio.crash();
      else if (e.type === 'roundOver' && roundWinJingle(e.winner, mine, decided)) audio.win();
    }
  }

  function phaseAudio(m: Match): void {
    if (m.phase === 'countdown') {
      const n = Math.ceil(TUNING.COUNTDOWN_S - m.phaseTime - 1e-6);
      if (n !== tickShown) { tickShown = n; if (n > 0) audio.tick(); }
    } else {
      tickShown = -1;
      if (prevPhase === 'countdown' && m.phase === 'play') audio.go();
    }
    prevPhase = m.phase;
    if (m.phase === 'matchEnd' && screen === 'match') matchEnd(m);
  }

  function matchEnd(m: Match): void {
    screen = 'end';
    input.releaseAll();
    if (matchWinJingle(matchWinner(m.totals, targetPoints(m.slots.length)), local())) audio.win();
    const again = host ? () => { host?.toLobby(); lobby(); } : null;
    showMatchEnd(ui, m, local(), again ?? (() => undefined), leave, { onAgain: again });
  }

  function feed(lines: string[]): void {
    for (const t of lines.slice(-FEED_MAX)) renderer.hud.feed([{ text: t, color: FEED_COLOR }]);
  }

  function hostFrame(now: number, frameDt: number, h: HostSession, m: Match): void {
    const r = stepsFor(acc, frameDt);
    acc = r.rest;
    for (let i = 0; i < r.steps; i++) {
      interp.snapshot(m.world);
      const events = h.step(input.steer());
      renderer.onEvents(events, m);
      react(events, m);
      phaseAudio(m);
    }
    m.slots.forEach((s, i) => { // a joiner who left is a bot from now on
      if (s.isBot && prevBot[i] === false) feed([`${s.name} left`]);
      prevBot[i] = s.isBot;
    });
    renderer.draw(m, now, interp.cars(m.world, renderAlpha(acc)));
  }

  function clientFrame(now: number, frameDt: number, c: ClientSession, m: Match): void {
    const r = stepsFor(acc, frameDt);
    acc = r.rest;
    for (let i = 0; i < r.steps; i++) {
      const s = input.steer();
      c.stepLocal(s);
      c.sendSteer(s);
    }
    const { events, burst } = filterBurst(c.takeEvents());
    renderer.onEvents(events, m);
    if (!burst) react(events, m);
    feed(c.takeFeed());
    phaseAudio(m);
    renderer.setNotice(m.phase !== 'matchEnd' && c.stale(now) ? 'Waiting for host…' : null);
    renderer.draw(m, now, c.cars(now));
  }

  function connected(l: Link): void {
    link = l;
    if (mode.kind === 'host') {
      const h = new HostSession(l, mode.name);
      host = h;
      h.onChange(() => { if (!closed && screen === 'lobby') lobby(); });
      lobby();
      return;
    }
    const c = new ClientSession(l, mode.name);
    client = c;
    c.onChange(() => {
      if (closed) return;
      if (c.state === 'refused') fail(refusedMessage(c.refusedReason));
      else if (c.state === 'hostLeft') fail('The host left');
      else if (c.state === 'lobby') lobby();
      else if (c.state === 'playing' && c.match && screen !== 'match' && screen !== 'end') beginMatch(c.match);
    });
  }

  connecting();
  const opening = mode.kind === 'host' ? transport.createRoom() : transport.joinRoom(mode.code);
  opening.then((l) => {
    if (closed) l.close();
    else connected(l);
  }, (err: unknown) => {
    if (closed) return;
    fail(err instanceof RoomError ? err.message : 'Could not connect');
  });

  return {
    frame(now, frameDt) {
      const m = match();
      if (closed || !m || (screen !== 'match' && screen !== 'end')) return;
      if (host) hostFrame(now, frameDt, host, m);
      else if (client) clientFrame(now, frameDt, client, m);
    },
    leave,
    describe: () => `${mode.kind} ${client ? client.state : host ? (host.started ? 'playing' : 'lobby') : 'connecting'} seats ${host?.seats.length ?? client?.lobby?.seats.length ?? 0}`,
  };
}
