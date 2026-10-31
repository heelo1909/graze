export type Steer = -1 | 0 | 1;

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
