import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Track } from './track.js';
import { createCar, setBrakeLights } from './cars.js';
import { EngineAudio } from './audio.js';
import { Hud } from './hud.js';
import { skyTexture } from './textures.js';

const GEAR_MAX_KMH = [45, 85, 130, 175, 215, 245];
const TOP_SPEED = 66; // m/s (~238 km/h)
const MAX_RPM = 8000;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function smoothstep(v) { return clamp(v, 0, 1); }

function gearState(speedKmh, throttle, reverse) {
  if (reverse) return { gear: 'R', rpm: 1400 };
  let gear = 1;
  while (gear < GEAR_MAX_KMH.length && speedKmh > GEAR_MAX_KMH[gear - 1]) gear++;
  const min = gear === 1 ? 0 : GEAR_MAX_KMH[gear - 2];
  const max = GEAR_MAX_KMH[gear - 1];
  const frac = clamp((speedKmh - min) / Math.max(1, max - min), 0, 1);
  let rpm = 1100 + frac * (MAX_RPM - 1400);
  if (speedKmh < 2) rpm = 850 + throttle * 650;
  return { gear, rpm };
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.scene.background = skyTexture();
    this.scene.fog = new THREE.FogExp2(0x0c0718, 0.0016);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.2, 3500);

    // lighting: moody moonlight + neon bounce
    this.scene.add(new THREE.HemisphereLight(0x7088ff, 0x181020, 1.35));
    const moon = new THREE.DirectionalLight(0xa6bcff, 1.3);
    moon.position.set(-260, 420, -180);
    this.scene.add(moon);
    this.scene.add(new THREE.AmbientLight(0x3a2455, 1.0));

    this.track = new Track(this.scene);
    this.hud = new Hud(this.track);
    this.audio = new EngineAudio();

    this.buildCars();
    this.setupComposer();

    this.keys = new Set();
    this.frames = 0;
    this.elapsed = 0;
    this.lastFrame = performance.now();
    this.cameraShake = 0;
    this.raceStarted = false;
    this.raceStartMs = null;
    this.player.lapStartMs = null;
    this.lastProgress = this.player.progress;

    this.bindInput();
    this.bindResize();
    this.exposeDebug();

    this.camera.position.copy(this.player.pos)
      .addScaledVector(this.player.forward, -8)
      .add(new THREE.Vector3(0, 3.3, 0));
    this.camera.lookAt(this.player.pos.clone().addScaledVector(this.player.forward, 8));

    this.renderer.setAnimationLoop(() => this.frame());
    window.__gameReady = false;
  }

  buildCars() {
    const start = this.track.samples[0];
    const startHeading = this.track.startHeading;

    // player starts on the left of the grid
    this.player = {
      pos: start.p.clone().addScaledVector(start.r, 0),
      heading: startHeading,
      forward: start.t.clone(),
      right: start.r.clone(),
      vel: new THREE.Vector3(),
      vf: 0,
      vl: 0,
      steer: 0,
      lap: 1,
      progress: 0,
      lapMs: 0,
      bestMs: null,
      lapStartMs: null,
      offroad: false,
      gear: 1,
      rpm: 850,
    };
    this.player.visual = createCar({ color: 0xff6b1c, accent: 0x42f5ff, detailed: true });
    this.scene.add(this.player.visual.root);
    this.player.forward.y = 0;

    const aiSpecs = [
      { lane: 3.5, dist: 0.008 * this.track.length, speed: 28, color: 0x4a9fff, accent: 0xff2bd6 },
      { lane: -3.5, dist: 0.016 * this.track.length, speed: 31, color: 0xd05cff, accent: 0x42f5ff },
      { lane: -4.8, dist: 0.024 * this.track.length, speed: 34, color: 0x4dffa0, accent: 0xffb347 },
    ];
    this.opponents = aiSpecs.map((spec, i) => {
      const visual = createCar({ color: spec.color, accent: spec.accent, detailed: false });
      this.scene.add(visual.root);
      return {
        lane: spec.lane,
        dist: spec.dist,
        baseSpeed: spec.speed,
        speed: spec.speed,
        color: `#${spec.color.toString(16).padStart(6, '0')}`,
        visual,
        pos: new THREE.Vector3(),
        heading: 0,
        lap: 1,
        progress: spec.dist / this.track.length,
      };
    });
    this.updateOpponentTransforms(0);
  }

  setupComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.5, 0.55,
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  bindInput() {
    const drivingKeys = new Set([
      'KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'KeyA', 'ArrowLeft',
      'KeyD', 'ArrowRight', 'Space', 'KeyR',
    ]);
    const startAudio = () => {
      if (this.audio.ready) return;
      this.audio.start().then((ok) => {
        if (ok) this.hud.setAudioStarted();
      }).catch(() => {});
    };

    window.addEventListener('keydown', (e) => {
      if (drivingKeys.has(e.code)) {
        e.preventDefault();
        startAudio();
      }
      if (e.code === 'KeyR') this.resetPlayer();
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('pointerdown', () => {
      startAudio();
      this.canvas.focus();
    });
    this.canvas.addEventListener('pointerdown', () => {
      startAudio();
      this.canvas.focus();
    });
  }

  bindResize() {
    window.addEventListener('resize', () => {
      const w = window.innerWidth, h = window.innerHeight;
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    });
  }

  startRace(now = performance.now()) {
    this.raceStarted = true;
    this.raceStartMs = now;
    this.player.lapStartMs = now;
    this.lastProgress = this.player.progress;
    this.hud.setAudioStarted();
  }

  resetPlayer() {
    // find nearest track sample and put the car back on the racing line
    const found = this.nearestSample(this.player.pos);
    const s = this.track.samples[found.index];
    this.player.pos.copy(s.p).addScaledVector(s.r, -1.5);
    this.player.heading = Math.atan2(s.t.x, s.t.z);
    this.player.forward.copy(s.t);
    this.player.forward.y = 0;
    this.player.right.copy(s.r);
    this.player.vel.set(0, 0, 0);
    this.player.vf = 0;
    this.player.vl = 0;
    this.player.steer = 0;
  }

  nearestSample(pos) {
    const samples = this.track.samples;
    const N = samples.length;
    let bestIndex = 0;
    let bestD = Infinity;
    for (let i = 0; i < N; i++) {
      const p = samples[i].p;
      const dx = p.x - pos.x;
      const dz = p.z - pos.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; bestIndex = i; }
    }
    return { index: bestIndex, distSq: bestD, progress: bestIndex / N };
  }

  updateOpponentTransforms(dt) {
    const L = this.track.length;
    const N = this.track.N;
    for (const o of this.opponents) {
      const u = ((o.dist % L) + L) % L / L;
      const idx = Math.floor(u * N) % N;
      const next = this.track.samples[(idx + 1) % N];
      const s = this.track.samples[idx];
      o.progress = idx / N;
      o.lap = Math.floor(o.dist / L) + 1;
      o.pos.copy(s.p).addScaledVector(s.r, o.lane);
      o.vel = s.t.clone().multiplyScalar(o.speed);
      o.heading = Math.atan2(next.t.x, next.t.z);
      o.visual.root.position.copy(o.pos);
      o.visual.root.position.y = 0.02;
      o.visual.root.rotation.y = o.heading;

      o.vel = s.t.clone().multiplyScalar(o.speed);
      const wheelSpin = (o.speed / 0.37) * dt;
      for (const w of o.visual.wheels) {
        w.spin.rotation.x += wheelSpin;
        if (w.isFront) w.pivot.rotation.y = clamp(s.curvature * o.speed * 0.9, -0.35, 0.35);
      }
      setBrakeLights(o.visual, o.speed < o.baseSpeed * 0.85, 0.4);
    }
  }

  frame() {
    const now = performance.now();
    const rawDt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    const dt = clamp(rawDt, 0.001, 0.05);
    this.elapsed += dt;
    this.frames++;

    this.updatePlayer(dt, now);
    this.updateOpponents(dt);
    this.updateCamera(dt);
    this.updateHud(now);
    this.updateAudio();

    this.composer.render();
    if (!window.__gameReady) window.__gameReady = true;
  }

  updatePlayer(dt, now) {
    const p = this.player;
    const throttle = (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ? 1 : 0;
    const braking = (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ? 1 : 0;
    const handbrake = this.keys.has('Space');
    let steerTarget = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) steerTarget -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) steerTarget += 1;
    p.steer += (steerTarget - p.steer) * Math.min(1, dt * 9);

    if (!this.raceStarted && (throttle || braking || steerTarget !== 0 || handbrake)) {
      this.startRace(now);
    }

    p.forward.set(Math.sin(p.heading), 0, Math.cos(p.heading));
    p.right.set(-Math.cos(p.heading), 0, Math.sin(p.heading));

    const near = this.nearestSample(p.pos);
    const sample = this.track.samples[near.index];
    const rel = p.pos.clone().sub(sample.p);
    const lat = rel.dot(sample.r);
    const along = rel.dot(sample.t);
    p.offroad = Math.abs(lat) > this.track.halfWidth + 0.55;
    p.progress = near.index / this.track.N;
    p.lateral = lat;
    p.trackHeading = Math.atan2(sample.t.x, sample.t.z);
    const aheadIdx = (near.index + Math.floor(this.track.N * 0.025)) % this.track.N;
    const aheadSample = this.track.samples[aheadIdx];
    p.aheadHeading = Math.atan2(aheadSample.t.x, aheadSample.t.z);
    p.targetX = aheadSample.p.x;
    p.targetZ = aheadSample.p.z;

    let vf = p.vel.dot(p.forward);
    let vl = p.vel.dot(p.right);

    const offroad = p.offroad;
    let accel = throttle * (offroad ? 11 : 20);
    if (braking) {
      if (vf > 0.4) accel -= offroad ? 20 : 31;
      else accel -= 9;
    }
    accel -= 0.0034 * vf * Math.abs(vf) + 0.09 * vf;
    if (offroad) accel -= 0.55 * Math.abs(vf);
    if (handbrake) accel -= 5 * Math.sign(vf);

    vf += accel * dt;
    vf = clamp(vf, -13, TOP_SPEED);
    if (braking && vf < -13) vf = -13;
    if (vf < -13) vf = -13;

    const grip = handbrake ? 1.4 : (offroad ? 2.2 : 6.0);
    vl *= Math.exp(-grip * dt);
    if (handbrake) vl *= 0.93;

    // velocity keeps its world direction while the car rotates; grip pulls it back
    p.vel.copy(p.forward).multiplyScalar(vf).addScaledVector(p.right, vl);
    p.vf = vf;
    p.vl = vl;

    const speedFactor = clamp(Math.abs(vf) / 6, 0, 1) * (1 - 0.52 * smoothstep(Math.abs(vf) / TOP_SPEED));
    let turnRate = 1.9 * speedFactor;
    if (handbrake) turnRate *= 1.33;
    p.heading -= p.steer * turnRate * dt * (vf < 0 ? -1 : 1);

    p.pos.addScaledVector(p.vel, dt);
    p.pos.y = 0;

    // wall collision: clamp to the barrier and scrub off speed
    const check = this.nearestSample(p.pos);
    const cs = this.track.samples[check.index];
    const rel2 = p.pos.clone().sub(cs.p);
    const lat2 = rel2.dot(cs.r);
    const along2 = rel2.dot(cs.t);
    const wallLimit = this.track.railDist - 0.45;
    if (Math.abs(lat2) > wallLimit) {
      const clamped = Math.sign(lat2) * wallLimit;
      p.pos.copy(cs.p).addScaledVector(cs.r, clamped).addScaledVector(cs.t, along2);
      // scrape the barrier instead of scrubbing all speed every frame
      const latVel = p.vel.dot(cs.r);
      const outward = Math.sign(lat2) * latVel;
      if (outward > 0) {
        p.vel.addScaledVector(cs.r, -latVel);
        const loss = Math.min(0.16, outward / 55);
        p.vel.multiplyScalar(1 - loss);
        if (outward > 2.5) this.cameraShake = Math.min(1, this.cameraShake + 0.25);
      }
    }

    // collisions with opponents: shove out, kill closing velocity, light speed loss
    for (const o of this.opponents) {
      const d = p.pos.distanceTo(o.pos);
      if (d < 3.1 && d > 0.001) {
        const n = p.pos.clone().sub(o.pos).normalize();
        p.pos.addScaledVector(n, 3.1 - d);
        const rel = p.vel.clone().sub(o.vel || new THREE.Vector3());
        const closing = rel.dot(n);
        if (closing < 0) {
          p.vel.addScaledVector(n, -closing);
          const impact = Math.min(0.22, -closing / 40);
          p.vel.multiplyScalar(1 - impact);
          if (-closing > 3) this.cameraShake = Math.min(1, this.cameraShake + 0.3);
        }
      }
    }

    // lap counting via start/finish wrap
    const prev = this.lastProgress;
    if (this.raceStarted && prev > 0.82 && p.progress < 0.18) {
      const lapMs = now - p.lapStartMs;
      p.lapMs = lapMs;
      if (p.bestMs == null || lapMs < p.bestMs) p.bestMs = lapMs;
      p.lap += 1;
      p.lapStartMs = now;
    }
    this.lastProgress = p.progress;
    if (this.raceStarted && p.lapStartMs != null) {
      p.lapMs = now - p.lapStartMs;
    } else {
      p.lapMs = 0;
    }

    // gear / rpm
    const speedKmh = p.vel.length() * 3.6;
    const g = gearState(speedKmh, throttle, vf < -0.5);
    p.gear = g.gear;
    p.rpm = g.rpm;
    p.speedKmh = speedKmh;

    // visual car
    p.visual.root.position.copy(p.pos);
    p.visual.root.rotation.y = p.heading;
    const wheelSpin = (vf / 0.37) * dt;
    for (const w of p.visual.wheels) {
      w.spin.rotation.x += wheelSpin;
      if (w.isFront) w.pivot.rotation.y = p.steer * 0.42;
    }
    setBrakeLights(p.visual, braking || handbrake, braking ? 1 : 0.5);
  }

  updateOpponents(dt) {
    if (!this.raceStarted) {
      this.updateOpponentTransforms(dt);
      return;
    }
    const L = this.track.length;
    const N = this.track.N;
    for (const o of this.opponents) {
      const idx = Math.floor(((o.dist % L) / L) * N) % N;
      const curvature = this.track.samples[idx].curvature;
      const cornerSlow = 1 - Math.min(0.42, curvature * 42);
      const wobble = 1 + Math.sin(this.elapsed * 0.7 + o.lane) * 0.035;
      const target = o.baseSpeed * cornerSlow * wobble;
      o.speed += (target - o.speed) * Math.min(1, dt * 1.4);
      o.dist += o.speed * dt;
    }
    this.updateOpponentTransforms(dt);
  }

  updateCamera(dt) {
    const p = this.player;
    const speed = p.vel.length();
    const dist = 8.1 + speed * 0.052;
    const height = 3.15 + speed * 0.012;
    const desired = p.pos.clone()
      .addScaledVector(p.forward, -dist)
      .add(new THREE.Vector3(0, height, 0));

    const lerp = 1 - Math.exp(-dt * 6.5);
    this.camera.position.lerp(desired, lerp);

    // shake from impacts / offroad
    if (this.cameraShake > 0.001) {
      const s = this.cameraShake;
      this.camera.position.x += (Math.random() - 0.5) * s * 0.14;
      this.camera.position.y += (Math.random() - 0.5) * s * 0.1;
      this.camera.position.z += (Math.random() - 0.5) * s * 0.14;
      this.cameraShake *= Math.exp(-dt * 6);
    }

    const lookAhead = p.pos.clone()
      .addScaledVector(p.forward, 9 + speed * 0.12)
      .add(new THREE.Vector3(0, 1.15, 0));
    // frame-rate independent look smoothing
    this.camera.lookAt(lookAhead);
    const targetFov = clamp(59 + (p.speedKmh || 0) * 0.075, 59, 86);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 3);
    this.camera.updateProjectionMatrix();

    // keep fog interesting; no shadows needed here
  }

  updateHud(now) {
    const p = this.player;
    const totals = [
      { total: (p.lap - 1) * this.track.length + p.progress * this.track.length, player: true },
      ...this.opponents.map((o) => ({ total: o.dist, player: false })),
    ].sort((a, b) => b.total - a.total);
    const position = totals.findIndex((t) => t.player) + 1;

    this.hud.update({
      speedKmh: p.speedKmh || 0,
      gear: p.gear,
      rpm: p.rpm,
      lap: p.lap,
      lapMs: p.lapMs,
      bestMs: p.bestMs,
      raceMs: this.raceStarted ? now - this.raceStartMs : 0,
      position,
      cars: this.opponents.length + 1,
      offroad: p.offroad,
      playerPos: p.pos,
      opponents: this.opponents.map((o) => ({ x: o.pos.x, z: o.pos.z, color: o.color })),
      audioReady: this.audio.ready,
    });
  }

  updateAudio() {
    const p = this.player;
    const throttle = (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ? 1 : 0;
    const braking = (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ? 1 : 0;
    const drift = clamp(Math.abs(p.vl) / 5, 0, 1);
    this.audio.update({
      speedKmh: p.speedKmh || 0,
      rpm: p.rpm,
      throttle,
      brake: braking,
      drift,
      offroad: p.offroad,
      gear: p.gear,
    });
  }

  exposeDebug() {
    const self = this;
    window.__game = {
      frames: () => self.frames,
      telemetry: () => {
        const p = self.player;
        return {
          speedKmh: p.speedKmh || 0,
          gear: p.gear,
          rpm: p.rpm,
          lap: p.lap,
          lapMs: p.lapMs,
          bestMs: p.bestMs,
          progress: p.progress,
          raceStarted: self.raceStarted,
          offroad: p.offroad,
          x: p.pos.x,
          z: p.pos.z,
          heading: p.heading,
          trackHeading: p.trackHeading,
          aheadHeading: p.aheadHeading,
          lateral: p.lateral,
          targetX: p.targetX,
          targetZ: p.targetZ,
          audio: self.audio.state(),
          frames: self.frames,
          opponents: self.opponents.map((o) => ({ x: o.pos.x, z: o.pos.z, speed: o.speed })),
        };
      },
      press: (code) => self.keys.add(code),
      release: (code) => self.keys.delete(code),
      startAudio: () => self.audio.start(),
      reset: () => self.resetPlayer(),
      fps: () => {
        return 1 / Math.max(0.001, (performance.now() - self.lastFrame) / 1000);
      },
    };
  }
}
