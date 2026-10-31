import { TUNING } from '../config';
import type { Car, Steer } from './types';

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function makeCar(
  id: number, name: string, color: string, isBot: boolean,
  x: number, y: number, heading: number,
): Car {
  return {
    id, name, color, isBot, x, y, heading,
    vx: Math.cos(heading) * TUNING.BASE_SPEED,
    vy: Math.sin(heading) * TUNING.BASE_SPEED,
    hold: 0, lastSteer: 0, boost: 0, alive: true,
    gapOn: false, gapTimer: 0, lastX: x, lastY: y,
    grazing: false, edgeTime: 0,
  };
}

/** Moves the car only: hold, heading, velocity, position. No collisions, gaps or boost changes. */
export function stepCar(car: Car, steer: Steer, dt: number): void {
  if (steer !== 0) {
    if (steer !== car.lastSteer) car.hold = 0;
    car.hold = Math.min(1, car.hold + dt / TUNING.HOLD_RAMP_S);
  } else {
    car.hold = Math.max(0, car.hold - dt / TUNING.HOLD_DECAY_S);
  }
  car.lastSteer = steer;

  car.heading += steer * lerp(TUNING.TURN_MIN, TUNING.TURN_MAX, car.hold) * dt;
  const speed = TUNING.BASE_SPEED * (1 + TUNING.BOOST_MAX * car.boost);
  const grip = lerp(TUNING.GRIP_MAX, TUNING.GRIP_MIN, car.hold);
  const k = 1 - Math.exp(-grip * dt);
  car.vx += (Math.cos(car.heading) * speed - car.vx) * k;
  car.vy += (Math.sin(car.heading) * speed - car.vy) * k;
  const m = Math.hypot(car.vx, car.vy) || 1;
  car.vx = (car.vx / m) * speed;
  car.vy = (car.vy / m) * speed;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
}
