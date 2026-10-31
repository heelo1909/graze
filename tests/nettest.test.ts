import { describe, expect, test } from 'vitest';
import { rttStats } from '../src/net/nettest';

describe('rttStats', () => {
  test('avg, p95 and max over the samples', () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    const s = rttStats(samples, 0);
    expect(s.avg).toBeCloseTo(50.5);
    expect(s.p95).toBe(95);
    expect(s.max).toBe(100);
    expect(s.lost).toBe(0);
  });

  test('passes when p95 < 80 ms and nothing is lost', () => {
    expect(rttStats([10, 20, 30, 40], 0).pass).toBe(true);
  });

  test('fails on a slow p95', () => {
    expect(rttStats([10, 20, 30, 120], 0).pass).toBe(false);
  });

  test('fails on any loss', () => {
    expect(rttStats([10, 20, 30, 40], 1).pass).toBe(false);
  });

  test('no samples never passes', () => {
    const s = rttStats([], 0);
    expect(s.pass).toBe(false);
    expect(s.avg).toBe(0);
  });
});
