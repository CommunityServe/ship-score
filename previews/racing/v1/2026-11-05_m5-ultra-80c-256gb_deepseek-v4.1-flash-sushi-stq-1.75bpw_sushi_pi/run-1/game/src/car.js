// Car visual model + arcade driving physics. All materials use generated
// canvas textures where a texture is needed.
import * as THREE from 'three';
import { createPaintTexture, createGlowTexture, createRimTexture } from './textures.js';

const UP = new THREE.Vector3(0, 1, 0);
function carPaintTexture(base, stripe, seed) {
  return createPaintTexture(base, stripe, seed);
}

export function createCarVisual({ color, stripe, accent = 0x36f2ff, seed = 1 }) {
  const root = new THREE.Group();

  const paintMap = carPaintTexture(color, stripe, seed);
  const paint = new THREE.MeshStandardMaterial({
    map: paintMap,
    metalness: 0.55,
    roughness: 0.28,
    envMapIntensity: 1.5,
    color: 0xffffff,
  });
  const darkTrim = new THREE.MeshStandardMaterial({
    color: 0x0c1018,
    metalness: 0.7,
    roughness: 0.45,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0a1524,
    metalness: 0.85,
    roughness: 0.08,
    transparent: true,
    opacity: 0.88,
    envMapIntensity: 2.2,
    side: THREE.DoubleSide,
  });
  const neon = new THREE.MeshBasicMaterial({ color: accent, toneMapped: false });
  const headMat = new THREE.MeshBasicMaterial({ color: 0xeafcff, toneMapped: false });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a44, toneMapped: false });

  // Body extruded from a side profile ---------------------------------------
  const shape = new THREE.Shape();
  shape.moveTo(-2.05, 0.22);
  shape.lineTo(2.0, 0.22);
  shape.quadraticCurveTo(2.24, 0.26, 2.22, 0.46);
  shape.quadraticCurveTo(2.2, 0.62, 2.0, 0.66);
  shape.lineTo(1.0, 0.72);
  shape.quadraticCurveTo(0.78, 0.76, 0.6, 0.9);
  shape.lineTo(0.43, 1.27);
  shape.quadraticCurveTo(0.35, 1.35, -0.2, 1.36);
  shape.lineTo(-0.82, 1.33);
  shape.quadraticCurveTo(-1.13, 1.26, -1.22, 1.0);
  shape.lineTo(-1.5, 0.78);
  shape.lineTo(-1.98, 0.72);
  shape.quadraticCurveTo(-2.12, 0.7, -2.15, 0.55);
  shape.lineTo(-2.05, 0.22);

  const bodyGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 1.72,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 3,
    curveSegments: 8,
    steps: 1,
  });
  bodyGeo.rotateY(-Math.PI / 2);
  bodyGeo.translate(0.86 + 0, 0, 0);
  const body = new THREE.Mesh(bodyGeo, paint);
  body.castShadow = true;
  root.add(body);

  // Upper greenhouse / roof (body shape covers it elegantly) ----------------
  // Side windows.
  const winMat = glass;
  const sideWinShape = [
    [0.5, 0.84],
    [0.3, 1.24],
    [-0.55, 1.27],
    [-0.72, 0.84],
  ];
  for (const sx of [-0.925, 0.925]) {
    const pos = [];
    for (const [z, y] of sideWinShape) pos.push(sx, y, z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    const win = new THREE.Mesh(g, winMat);
    root.add(win);
  }
  // Windshield (front slanted quad).
  {
    const g = new THREE.BufferGeometry();
    const verts = [
      -0.82, 0.76, 1.0,
      0.82, 0.76, 1.0,
      0.6, 1.25, 0.44,
      -0.6, 1.25, 0.44,
    ];
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    root.add(new THREE.Mesh(g, winMat));
  }
  // Rear window.
  {
    const g = new THREE.BufferGeometry();
    const verts = [
      -0.7, 0.86, -1.22,
      0.7, 0.86, -1.22,
      0.6, 1.23, -0.76,
      -0.6, 1.23, -0.76,
    ];
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    root.add(new THREE.Mesh(g, winMat));
  }

  // Underbody shadow plate to cover the gap under the car.
  const underbody = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 3.6), darkTrim);
  underbody.position.y = 0.2;
  root.add(underbody);

  // Neon accent strips along the flanks.
  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 2.6), neon);
    strip.position.set(side * 0.91, 0.38, 0.1);
    root.add(strip);
  }

  // Spoiler / wing.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.07, 0.36), darkTrim);
  wing.position.set(0, 1.18, -2.02);
  root.add(wing);
  for (const x of [-0.7, 0.7]) {
    const support = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.09), darkTrim);
    support.position.set(x, 1.05, -2.0);
    root.add(support);
  }

  // Lights.
  for (const x of [-0.62, 0.62]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.05), headMat);
    lamp.position.set(x, 0.68, 2.19);
    root.add(lamp);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.09, 0.04), tailMat);
    tail.position.set(x, 0.73, -2.1);
    root.add(tail);
  }

  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.39, 0.39, 0.3, 20);
  const rimGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.315, 16);
  const rimTex = createRimTexture();
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x08080d,
    roughness: 0.55,
    metalness: 0.15,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    map: rimTex,
    color: 0xffffff,
    metalness: 0.9,
    roughness: 0.2,
    envMapIntensity: 1.8,
    side: THREE.DoubleSide,
  });
  const rimDiscGeo = new THREE.CircleGeometry(0.26, 18);
  const wheels = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1.35, 1.35]) {
      const steerGroup = new THREE.Group();
      steerGroup.position.set(sx * 0.92, 0.4, sz);
      const spinGroup = new THREE.Group();
      steerGroup.add(spinGroup);

      const tire = new THREE.Mesh(wheelGeo, tireMat);
      tire.rotation.z = Math.PI / 2;
      spinGroup.add(tire);

      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.z = Math.PI / 2;
      spinGroup.add(rim);

      const disc = new THREE.Mesh(rimDiscGeo, rimMat);
      disc.rotation.y = (sx > 0 ? 1 : -1) * Math.PI / 2;
      disc.position.x = sx * 0.16;
      spinGroup.add(disc);

      root.add(steerGroup);
      wheels.push({ steerGroup, spinGroup, front: sz > 0, side: sx });
    }
  }

  // Cast a soft fake shadow / underglow on the road.
  const shadowTex = createGlowTexture();
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    color: 0x000000,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 8.5), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.005;
  shadow.renderOrder = -1;
  root.add(shadow);

  const underGlowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    color: accent,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const underGlow = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 9.0), underGlowMat);
  underGlow.rotation.x = -Math.PI / 2;
  underGlow.position.y = 0.005;
  underGlow.renderOrder = 1;
  root.add(underGlow);

  // Point glows for the headlights.
  const glowMat = new THREE.SpriteMaterial({
    map: shadowTex,
    color: 0xd8fbff,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (const x of [-0.62, 0.62]) {
    const sprite = new THREE.Sprite(glowMat);
    sprite.position.set(x, 0.7, 2.25);
    sprite.scale.set(1.0, 1.0, 1);
    root.add(sprite);
  }

  root.userData.body = body;
  root.userData.underglow = underGlow;
  root.userData.parts = { underGlowMat, glowMat };
  root.userData.wheels = wheels;
  root.userData.bodyMat = paint;

  return root;
}

const FORWARD = new THREE.Vector3();
const RIGHT = new THREE.Vector3();
const damping = (rate, dt) => Math.exp(-rate * dt);

/**
 * Arcade racing physics. Heading is tracked separately from velocity so the car
 * can slide / drift (especially with the handbrake).
 */
export class PlayerCar {
  constructor(track, visual, startDist = 24) {
    this.track = track;
    this.root = visual;
    this.scene = null;
    this.pos = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.roll = 0;
    this.pitch = 0;
    this.speedKmh = 0;
    this.slip = 0;
    this.lastIdx = -1;
    this.wallContact = false;
    this.hitFlash = 0;
    this.wheelSpin = 0;
    this.steerSmooth = 0;
    this.wallHitCooldown = 0;
    this.reset(startDist);
  }

  reset(dist = 24) {
    const f = this.track.frameAt(dist);
    this.pos.copy(f.p);
    this.pos.y = 0.03;
    this.yaw = Math.atan2(f.tangent.x, f.tangent.z);
    this.velocity.set(0, 0, 0);
    this.speedKmh = 0;
    this.steerSmooth = 0;
    this.wallHitCooldown = 0;
    this.lastIdx = -1;
    const loc = this.track.locate(this.pos, -1);
    this.lastIdx = loc.index;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }

  get forward() {
    return FORWARD.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  get right() {
    return RIGHT.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  update(dt, input) {
    dt = Math.min(dt, 0.05);
    const forward = this.forward;
    const right = this.right;

    // Current longitudinal / lateral speed relative to the heading.
    let f = this.velocity.dot(forward);
    let l = this.velocity.dot(right);
    const absF = Math.abs(f);

    // Smooth the steering wheel so a digital key press doesn't snap the nose.
    const steerTarget = THREE.MathUtils.clamp(input.steer, -1, 1);
    this.steerSmooth += (steerTarget - this.steerSmooth) * Math.min(1, dt * 7.5);
    const steer = this.steerSmooth;

    // Steering gets a little less sharp at very high speed. Low-speed turns
    // remain quick enough to recover from a spin.
    let turnRate = 0.55 + 1.25 * Math.min(absF / 18, 1);
    if (absF > 20) turnRate /= 1 + (absF - 20) * 0.007;
    if (absF > 0.4) {
      const direction = f >= 0 ? 1 : -1;
      this.yaw += steer * turnRate * dt * direction;
    } else if (input.throttle) {
      this.yaw += steer * 0.9 * dt;
    }

    const fwd = this.forward;
    const rgt = this.right;

    // Engine / braking.
    let throttlePower = 0;
    if (input.throttle) {
      throttlePower = Math.max(2.0, 21.0 - f * 0.05);
    }
    if (input.boost) throttlePower += 9.0 * (1 - Math.min(Math.max(f, 0) / 108, 1));
    if (input.brake) {
      if (f > 0.6) {
        f = Math.max(0, f - 26 * dt);
      } else {
        f = Math.max(-11, f - 7.5 * dt);
      }
    } else {
      f += throttlePower * dt;
    }
    if (input.handbrake) f -= Math.sign(f) * 13 * dt;

    // Aerodynamic + rolling resistance.
    const drag = 0.0017 * f * f + Math.abs(f) * 0.08;
    f -= Math.sign(f) * drag * dt;

    // Lateral grip. Handbrake nearly removes it -> slides.
    let grip = input.handbrake ? 1.15 : (input.brake && absF > 16 ? 5.2 : 8.5);
    l *= damping(grip, dt);

    // Clamp speed envelope.
    f = THREE.MathUtils.clamp(f, -12, 96);

    this.velocity.copy(fwd).multiplyScalar(f).addScaledVector(rgt, l);

    // Integrate.
    this.pos.addScaledVector(this.velocity, dt);

    // Keep the car inside the barriers.
    const loc = this.track.locate(this.pos, this.lastIdx);
    this.lastIdx = loc.index;
    const limit = this.track.halfWidth - 0.3;
    let lateral = loc.lateral;
    this.wallContact = false;
    if (Math.abs(lateral) > limit) {
      const sign = Math.sign(lateral);
      this.pos.addScaledVector(loc.side, sign * limit - lateral);
      const out = this.velocity.dot(loc.side);
      if (out * sign > 0) {
        this.velocity.addScaledVector(loc.side, -out);
        if (Math.abs(out) > 5 && this.wallHitCooldown <= 0) {
          this.velocity.multiplyScalar(0.9);
          this.wallHitCooldown = 0.7;
          this.hitFlash = 1;
        }
      }
      this.wallContact = true;
      lateral = sign * limit;
    }
    this.wallHitCooldown = Math.max(0, this.wallHitCooldown - dt);

    // Re-project lateral slip for audio / particles.
    const loc2 = this.track.locate(this.pos, this.lastIdx);
    this.lastIdx = loc2.index;
    const latSpeed = Math.abs(this.velocity.dot(loc2.side));
    this.slip = latSpeed;
    this.speedKmh = this.velocity.length() * 3.6;

    // Visual polish.
    const leanTarget = THREE.MathUtils.clamp(-steer * (absF / 60), -1, 1) * 0.10;
    const pitchTarget = THREE.MathUtils.clamp((input.brake ? 0.035 : 0) - (input.throttle ? 0.025 : 0), -0.05, 0.05);
    this.roll += (leanTarget - this.roll) * Math.min(1, dt * 8);
    this.pitch += (pitchTarget - this.pitch) * Math.min(1, dt * 6);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);

    this.root.position.copy(this.pos);
    this.root.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');

    // Wheel spin and steer.
    this.wheelSpin += f * dt * 2.1;
    for (const wheel of this.root.userData.wheels) {
      wheel.spinGroup.rotation.x = this.wheelSpin;
      if (wheel.front) wheel.steerGroup.rotation.y = steer * 0.38;
    }

    // Headlight glow gets stronger at speed. Slight flicker on impacts.
    const glowMat = this.root.userData.parts.glowMat;
    glowMat.opacity = 0.75 + Math.sin(performance.now() * 0.015) * 0.05 + this.hitFlash * 0.2;
    this.root.userData.parts.underGlowMat.opacity = 0.55 + Math.min(absF / 100, 1) * 0.35;

    return {
      speed: this.speedKmh,
      slip: this.slip,
      wallContact: this.wallContact,
      dist: loc2.dist,
      lateral: loc2.lateral,
    };
  }
}
