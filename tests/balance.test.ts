import { describe, expect, test } from 'vitest';
import { playRound } from '../src/sim/harness';

describe('balance (headless)', () => {
  test('100 all-bot rounds: no exceptions, every round ends', () => {
    for (let s = 1; s <= 100; s++) expect(playRound(s, false).time).toBeGreaterThan(0);
  }, 60_000);

  test('average round length is between 20 and 40 seconds (normal bots)', () => {
    let sum = 0, gz = 0, ct = 0;
    const n = 100;
    for (let s = 1; s <= n; s++) { const r = playRound(s, false); sum += r.time; gz += r.graze; ct += r.carTicks; }
    const mean = sum / n;
    console.log(`mean round length ${mean.toFixed(2)}s, graze ${(100 * gz / ct).toFixed(1)}% of car-ticks`);
    expect(mean).toBeGreaterThanOrEqual(20);
    expect(mean).toBeLessThanOrEqual(40);
  }, 60_000);

  test('edge camping does not win more often than an ordinary bot', () => {
    const wins = [0, 0, 0, 0];
    const n = 200;
    for (let s = 1; s <= n; s++) {
      const r = playRound(s, true);
      if (r.winner !== null) wins[r.winner]!++;
    }
    const rate = wins.map((x) => x / n);
    console.log(`win rates ${rate.map((r) => r.toFixed(3)).join(' ')}`);
    expect(rate[0]!).toBeLessThanOrEqual(Math.max(rate[1]!, rate[2]!, rate[3]!));
  }, 60_000);
});
