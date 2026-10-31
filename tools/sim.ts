// Headless balance harness: npm run sim -- [--rounds N] [--matches N] [--seed S] [--camper]
import { playMatch, playRound, tunnelCheck } from '../src/sim/harness';

declare const process: { argv: string[] };
const args = process.argv.slice(2);
const num = (flag: string, dflt: number): number => {
  const i = args.indexOf(flag);
  const v = i >= 0 ? Number(args[i + 1]) : dflt;
  return Number.isFinite(v) ? v : dflt;
};
const rounds = num('--rounds', 100);
const seed0 = num('--seed', 1);
const matchCount = num('--matches', 30);
const camper = args.includes('--camper');

const times: number[] = [];
const wins = [0, 0, 0, 0];
let draws = 0, graze = 0, carTicks = 0;
for (let i = 0; i < rounds; i++) {
  const r = playRound(seed0 + i, camper);
  times.push(r.time);
  graze += r.graze;
  carTicks += r.carTicks;
  if (r.winner === null) draws++; else wins[r.winner]!++;
}
const sorted = [...times].sort((a, b) => a - b);
const mean = times.reduce((a, b) => a + b, 0) / rounds;
const median = sorted[Math.floor(rounds / 2)]!;
const tun = tunnelCheck();

console.log(`rounds ${rounds}, seeds ${seed0}..${seed0 + rounds - 1}${camper ? ', car 0 = edge camper' : ''}`);
console.log(`round length s: mean ${mean.toFixed(2)}  median ${median.toFixed(2)}  min ${sorted[0]!.toFixed(2)}  max ${sorted[rounds - 1]!.toFixed(2)}`);
console.log(`win rate: ${wins.map((x, i) => `car${i} ${(100 * x / rounds).toFixed(1)}%`).join('  ')}  draws ${(100 * draws / rounds).toFixed(1)}%`);
console.log(`graze: ${(100 * graze / carTicks).toFixed(1)}% of car-ticks`);
console.log(`tunnel check: ${tun.misses.length} of ${tun.total} crossings passed through a trail`);
for (const m of tun.misses.slice(0, 5)) console.log(`  ${m}`);

const ms = Array.from({ length: matchCount }, (_, i) => playMatch(seed0 + i));
if (ms.length > 0) {
  const mins = ms.map((r) => r.minutes);
  const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
  console.log(`matches ${matchCount}: minutes mean ${avg(mins).toFixed(2)}  min ${Math.min(...mins).toFixed(2)}  max ${Math.max(...mins).toFixed(2)}  rounds/match mean ${avg(ms.map((r) => r.rounds)).toFixed(2)}`);
}
