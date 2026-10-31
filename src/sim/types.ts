import type { Grid } from './grid';
import type { Rng } from './rng';

export type Steer = -1 | 0 | 1;

export interface Slot {
  name: string;
  color: string;
  isBot: boolean;
}

export type CrashCause = 'wall' | 'trail' | 'own' | 'head';

export type SimEvent =
  | { type: 'trail'; car: number; x0: number; y0: number; x1: number; y1: number }
  | { type: 'graze'; car: number; x: number; y: number; source: number }
  | { type: 'crash'; car: number; cause: CrashCause; by: number | null; x: number; y: number; tick: number }
  | { type: 'roundOver'; winner: number | null; outOrder: number[][]; cutoffs: number[] };

export interface World {
  tick: number;
  time: number;
  cars: Car[];
  grid: Grid;
  bounds: Bounds;
  rng: Rng;
  /** undefined = not decided yet; null = nobody won */
  winner: number | null | undefined;
  endTimer: number;
  over: boolean;
  outOrder: number[][];
  cutoffs: number[];
}

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Car {
  id: number;
  name: string;
  color: string;
  isBot: boolean;
  x: number;
  y: number;
  heading: number;
  vx: number;
  vy: number;
  hold: number;
  lastSteer: Steer;
  boost: number;
  alive: boolean;
  gapOn: boolean;
  gapTimer: number;
  lastX: number;
  lastY: number;
  grazing: boolean;
  edgeTime: number;
}
