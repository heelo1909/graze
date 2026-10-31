import { describe, expect, test } from 'vitest';
import { Grid } from '../src/sim/grid';

describe('Grid', () => {
  test('stamp marks a 3x3 block of cells', () => {
    const g = new Grid(1200, 760, 4);
    g.stamp(100, 100, 2, 0);
    expect(g.hitAt(100, 100, 0, 1, 0.3)).toBe(2);
    expect(g.hitAt(105, 100, 0, 1, 0.3)).toBe(2); // neighbour cell
    expect(g.hitAt(112, 100, 0, 1, 0.3)).toBe(-1);
  });

  test('own fresh trail is ignored, own old trail is not', () => {
    const g = new Grid(1200, 760, 4);
    g.stamp(50, 50, 1, 10);
    expect(g.hitAt(50, 50, 1, 10.1, 0.3)).toBe(-1);
    expect(g.hitAt(50, 50, 1, 10.5, 0.3)).toBe(1);
  });

  test('stamping never overwrites an occupied cell', () => {
    const g = new Grid(1200, 760, 4);
    g.stamp(50, 50, 1, 0);
    g.stamp(50, 50, 2, 5);
    expect(g.hitAt(50, 50, 3, 6, 0.3)).toBe(1);
  });

  test('out of range is empty', () => {
    expect(new Grid(1200, 760, 4).hitAt(-5, 9999, 0, 0, 0.3)).toBe(-1);
  });

  test('clear empties every cell', () => {
    const g = new Grid(1200, 760, 4);
    g.stamp(50, 50, 1, 0);
    g.clear();
    expect(g.hitAt(50, 50, 3, 10, 0.3)).toBe(-1);
  });
});
