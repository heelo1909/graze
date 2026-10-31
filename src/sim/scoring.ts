export function roundPoints(
  carCount: number, outOrder: number[][], winner: number | null, cutoffs: number[],
): number[] {
  const pts = new Array<number>(carCount).fill(0);
  let before = 0;
  for (const group of outOrder) {
    for (const id of group) if (id >= 0 && id < carCount) pts[id] = before;
    before += group.length;
  }
  if (winner !== null && winner >= 0 && winner < carCount) pts[winner] = carCount - 1;
  for (const owner of cutoffs) if (owner >= 0 && owner < carCount) pts[owner]! += 1;
  return pts;
}

export function targetPoints(carCount: number): number {
  if (carCount >= 4) return 10;
  if (carCount === 3) return 7;
  return 5;
}

/** Sole leader at or above target, else null (a tied lead keeps play going). */
export function matchWinner(totals: number[], target: number): number | null {
  let best = -Infinity;
  let idx = -1;
  let tied = false;
  totals.forEach((t, i) => {
    if (t > best) { best = t; idx = i; tied = false; }
    else if (t === best) tied = true;
  });
  return idx >= 0 && best >= target && !tied ? idx : null;
}
