// Opponent cars that follow the spline and can be overtaken.
import * as THREE from 'three';
import { createCarVisual } from './car.js';

const UP = new THREE.Vector3(0, 1, 0);

const ROSTER = [
  { color: '#17e0c2', stripe: '#f4f7ff', accent: 0x36f2ff, lane: -4.8, speed: 62, seed: 7 },
  { color: '#ff8a2b', stripe: '#131416', accent: 0xffa63d, lane: 4.5, speed: 68, seed: 11 },
  { color: '#a56bff', stripe: '#d9f8ff', accent: 0xc23dff, lane: 5.2, speed: 60, seed: 13 },
  { color: '#d9e6f2', stripe: '#ff2f5b', accent: 0xff2f86, lane: -3.8, speed: 65, seed: 17 },
];

export class Opponent {
  constructor(track, cf, startDist) {
    this.track = track;
    this.d = startDist;
    this.laneBase = cf.lane;
    this.lane = cf.lane;
    this.laneVel = 0;
    this.speed = 0;
    this.startDist = startDist;
    this.targetSpeed = cf.speed;
    this.laps = 0;
    this.phase = Math.random() * Math.PI * 2;
    this.time = 0;
    this.yaw = 0;
    this.wheelSpin = 0;
    this.side = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.root = createCarVisual({
      color: cf.color,
      stripe: cf.stripe,
      accent: cf.accent,
      seed: cf.seed,
    });
    this.updateVisual(0, 0);
    this.root.position.y = 0.03;
  }

  update(dt, raceOn) {
    this.time += dt;
    const speedWobble = 1 + Math.sin(this.time * 0.45 + this.phase) * 0.045;
    const wantedSpeed = raceOn ? this.targetSpeed * speedWobble : 0;
    const accel = wantedSpeed > this.speed ? 16 : 20;
    if (this.speed < wantedSpeed) {
      this.speed = Math.min(wantedSpeed, this.speed + accel * dt);
    } else {
      this.speed = Math.max(wantedSpeed, this.speed - accel * dt);
    }

    const prevD = this.d;
    this.d += this.speed * dt;
    if (this.d >= this.track.length) {
      this.d -= this.track.length;
      this.laps += 1;
    }

    // Gentle lane weaving makes racing look alive without making it unfair.
    const wantedLane =
      this.laneBase + Math.sin(this.time * 0.6 + this.phase) * 0.35;
    const laneDelta = wantedLane - this.lane;
    this.laneVel = laneDelta * 1.6;
    this.lane += laneDelta * Math.min(1, dt * 1.6);

    this.updateVisual(dt, prevD);
    this.root.userData.wheels.forEach((w) => {
      w.spinGroup.rotation.x = this.wheelSpin;
    });
    this.root.position.copy(this.pos);
    return { pos: this.pos, speed: this.speed * 3.6, laps: this.laps };
  }

  updateVisual(dt, prevDist) {
    const f = this.track.frameAt(this.d);
    this.pos.copy(f.p);
    this.pos.y = 0.03;
    this.pos.addScaledVector(f.side, this.lane);
    this.side.copy(f.side);

    // Face the direction of travel including lane changes.
    const vel = f.tangent.clone().multiplyScalar(this.speed);
    vel.addScaledVector(f.side, this.laneVel);
    const targetYaw = Math.atan2(vel.x, vel.z);
    let deltaYaw = targetYaw - this.yaw;
    while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
    while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
    if (dt === 0) this.yaw = targetYaw;
    else this.yaw += deltaYaw * Math.min(1, dt * 7 + 0.05);

    this.wheelSpin += this.speed * dt * 2.1;
    const laneLean = THREE.MathUtils.clamp(-this.laneVel * 0.012, -0.06, 0.06);
    this.root.rotation.set(0, this.yaw, laneLean, 'YXZ');
  }

  reset() {
    this.d = this.startDist;
    this.laps = 0;
    this.speed = 0;
    this.lane = this.laneBase;
    this.laneVel = 0;
    this.time = 0;
    this.updateVisual(0, 0);
    this.root.position.y = 0.03;
  }

  get progress() {
    return this.laps * this.track.length + this.d;
  }
}

export function createOpponents(track) {
  const starts = [44, 38, 32, 27];
  return ROSTER.map((cf, i) => new Opponent(track, cf, starts[i]));
}
