// ?nettest: a throwaway page that checks whether two machines can reach each
// other through PeerJS and how steady the link is. One side creates a room, the
// other joins with the code and pings the host for 20 s.
import type { Link, Transport } from './transport';

const PING_EVERY_MS = 100;
const RUN_MS = 20000;
const LOST_AFTER_MS = 2000;
const PASS_P95_MS = 80;

export interface RttStats { avg: number; p95: number; max: number; lost: number; pass: boolean }

/** Round-trip stats over the pongs received. Passes only with samples, p95 < 80 ms and no loss. */
export function rttStats(samples: number[], lost: number): RttStats {
  if (samples.length === 0) return { avg: 0, p95: 0, max: 0, lost, pass: false };
  const sorted = [...samples].sort((a, b) => a - b);
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  return { avg, p95, max, lost, pass: p95 < PASS_P95_MS && lost === 0 };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const ms = (n: number): string => n.toFixed(0);

function isMsg(msg: unknown, t: string): msg is { t: string; at: number } {
  return typeof msg === 'object' && msg !== null && (msg as { t?: unknown }).t === t;
}

export function runNetTest(root: HTMLElement, t: Transport): void {
  const wrap = el('div', 'screen title');
  wrap.append(
    el('h1', 'logo', 'NET TEST'),
    el('p', 'pitch', 'One player creates a room. The other types the code and joins. Keep both tabs open for 20 seconds.'),
  );

  const create = el('button', 'primary', 'Create');
  const label = el('label', 'field');
  const input = el('input');
  input.maxLength = 8;
  input.autocomplete = 'off';
  label.append(el('span', 'field-label', 'Room code'), input);
  const join = el('button', 'primary', 'Join');
  const status = el('p', 'pitch');
  const peers = el('p', 'keys');
  const live = el('p', 'pitch');
  const verdict = el('h2', 'winner');
  const explain = el('div', 'keys');
  wrap.append(create, label, join, status, peers, live, verdict, explain);
  root.replaceChildren(wrap);

  let link: Link | null = null;
  let pingTimer = 0;
  let endTimer = 0;
  let joinedCount = 0;

  const setBusy = (busy: boolean): void => {
    create.disabled = busy;
    join.disabled = busy;
    input.disabled = busy;
  };
  const teardown = (): void => {
    clearInterval(pingTimer);
    clearTimeout(endTimer);
    link?.close();
    link = null;
  };

  create.addEventListener('click', () => {
    setBusy(true);
    status.textContent = 'Creating room...';
    t.createRoom().then((l) => {
      link = l;
      status.textContent = `Room ${l.code}. Tell the other player this code.`;
      l.onJoin((p) => {
        joinedCount++;
        peers.textContent = `Peers joined: ${joinedCount} (latest ${p})`;
      });
      l.onLeave(() => {
        joinedCount = Math.max(0, joinedCount - 1);
        peers.textContent = `Peers joined: ${joinedCount}`;
      });
      l.onMessage((from, msg) => {
        if (isMsg(msg, 'ping')) l.send({ t: 'pong', at: msg.at }, from);
      });
    }, (e: unknown) => {
      status.textContent = e instanceof Error ? e.message : 'Could not create a room';
      setBusy(false);
    });
  });

  join.addEventListener('click', () => {
    const code = input.value;
    setBusy(true);
    status.textContent = `Joining ${code}...`;
    t.joinRoom(code).then((l) => {
      link = l;
      status.textContent = `Connected to ${l.code}. Testing for ${RUN_MS / 1000} s...`;
      startPinging(l);
    }, (e: unknown) => {
      status.textContent = e instanceof Error ? e.message : 'Could not join';
      setBusy(false);
    });
  });

  function startPinging(l: Link): void {
    const samples: number[] = [];
    const sent = new Set<number>(); // pings awaiting a pong, keyed by their send time
    let lost = 0;
    const started = performance.now();

    l.onMessage((_from, msg) => {
      if (isMsg(msg, 'pong') && sent.delete(msg.at)) samples.push(performance.now() - msg.at);
    });
    l.onLeave(() => {
      status.textContent = 'The host left.';
      teardown();
      setBusy(false);
    });

    const show = (): RttStats => {
      const s = rttStats(samples, lost);
      live.textContent = `rtt avg ${ms(s.avg)} ms · p95 ${ms(s.p95)} ms · max ${ms(s.max)} ms · lost ${s.lost}`;
      return s;
    };

    pingTimer = window.setInterval(() => {
      const now = performance.now();
      for (const at of sent) {
        if (now - at > LOST_AFTER_MS) {
          sent.delete(at);
          lost++;
        }
      }
      sent.add(now);
      l.send({ t: 'ping', at: now });
      show();
    }, PING_EVERY_MS);

    endTimer = window.setTimeout(() => {
      clearInterval(pingTimer);
      // Give the last pings their full 2 s window before judging.
      endTimer = window.setTimeout(() => {
        lost += sent.size;
        sent.clear();
        const s = show();
        verdict.textContent = s.pass ? 'PASS' : 'CHECK';
        status.textContent = `Done after ${((performance.now() - started) / 1000).toFixed(0)} s.`;
        explain.replaceChildren(
          el('p', undefined, 'avg: the typical round trip, there and back. Lower is better.'),
          el('p', undefined, `p95: 19 in 20 pings were faster than this. It must be under ${PASS_P95_MS} ms.`),
          el('p', undefined, 'max: the single worst ping. Spikes here show up as stutter.'),
          el('p', undefined, 'lost: pings with no reply within 2 s. It must be 0.'),
        );
        teardown();
        setBusy(false);
      }, LOST_AFTER_MS);
    }, RUN_MS);
  }
}
