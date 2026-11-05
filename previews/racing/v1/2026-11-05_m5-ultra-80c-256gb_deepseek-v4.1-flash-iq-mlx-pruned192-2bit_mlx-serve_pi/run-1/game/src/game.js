import * as THREE from 'three';
import { createTrack } from './track.js';
import { createCar } from './cars.js';
import { EngineAudio } from './audio.js';

export const MAX_SPEED = 260;

export class Game {
  constructor(renderer, canvas, hud) {
    this.renderer = renderer;
    this.canvas = canvas;
    this.hud = hud;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
    this.track = createTrack(this.scene);
    this.audio = new EngineAudio();

    const start = this.track.transformAt(0);
    this.speedKmh = 0;
    this.heading = start.heading;
    this.position = start.position.clone();
    this.position.y = this.track.roadY + 0.14;
    this.lastProgress = 0;
    this.lapCount = 1;
    this.lapStart = performance.now();
    this.lastLapSeconds = 0;
    this.bestLapSeconds = 0;
    this.currentLapSeconds = 0;
    this.edgeActive = false;
    this.startedAt = performance.now();
    this.frameIndex = 0;
    this.lastDt = 0;

    this.input = {
      accelerate: false,
      brake: false,
      left: false,
      right: false,
    };

    this.playerParts = createCar({
      color: 0x8b3a2a,
      accent: 0xffb13d,
      player: true,
    });
    this.playerParts.group.position.copy(this.position);
    this.playerParts.group.rotation.y = this.heading;
    this.scene.add(this.playerParts.group);

    const opponentConfigs = [
      { color: 0x244a90, accent: 0x38e8ff, speed: 214, u: 0.006, lane: 2.6 },
      { color: 0x522f8f, accent: 0xc53cff, speed: 233, u: 0.012, lane: -2.2 },
      { color: 0x332f21, accent: 0xffc23d, speed: 199, u: 0.022, lane: 4.0 },
    ];
    this.opponents = opponentConfigs.map((cfg) => {
      const parts = createCar({ color: cfg.color, accent: cfg.accent });
      const t = this.track.transformAt(cfg.u);
      const offset = t.position.clone().add(
        new THREE.Vector3(-Math.cos(t.heading), 0, Math.sin(t.heading)).multiplyScalar(cfg.lane)
      );
      parts.group.position.set(
        offset.x,
        this.track.roadY + 0.14,
        offset.z
      );
      parts.group.rotation.y = t.heading;
      this.scene.add(parts.group);
      return {
        parts,
        speedKmh: cfg.speed,
        u: cfg.u,
        lane: cfg.lane,
      };
    });

    // A dynamic racing vignette: faint wind streaks behind the camera.
    const streakGeo = new THREE.BufferGeometry();
    const streakCount = 40;
    const streakPos = new Float32Array(streakCount * 3);
    const streakSeeds = new Float32Array(streakCount);
    for (let i = 0; i < streakCount; i++) {
      streakPos[i * 3 + 0] = (Math.random() - 0.5) * 27;
      streakPos[i * 3 + 1] = Math.random() * 9 + 1;
      streakPos[i * 3 + 2] = -Math.random() * 20 - 3;
      streakSeeds[i] = Math.random();
    }
    streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
    this.streaks = new THREE.Points(
      streakGeo,
      new THREE.PointsMaterial({
        color: 0x9bb5ff,
        size: 0.16,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      })
    );
    this.streakSeeds = streakSeeds;
    this.scene.add(this.streaks);

    this.streaks.position.copy(this.playerParts.group.position);

    this.bindControls();
    this.updateHud();
  }

  bindControls() {
    const mapped = {
      ArrowUp: 'accelerate',
      ArrowDown: 'brake',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    };
    window.addEventListener('keydown', (event, raw) => {
      const key = event.key.toLowerCase();
      const normalized = key === 'w' || key === 'up' ? 'accelerate'
        : key === 's' || key === 'down' ? 'brake'
        : key === 'a' || key === 'left' ? 'left'
        : key === 'd' || key === 'right' ? 'right'
        : null;
      const mappedKey = mapped[event.key];
      if (normalized) {
        event.preventDefault();
        this.input[normalized] = true;
        // Starting audio inside a user gesture makes WebAudio legal in browsers.
        this.audio.start();
        this.audio.applySpeed(this.speedKmh);
        this.flashInput(normalized);
      } else if (mappedKey) {
        event.preventDefault();
        this.input[mappedKey] = true;
        this.audio.start();
        this.audio.applySpeed(this.speedKmh);
        this.flashInput(mappedKey);
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        this.resetPlayer();
      } else if (event.key === 'm' || event.key === 'M') {
        event.preventDefault();
        this.audio.start();
        this.audio.mute();
      }
    });
    window.addEventListener('keyup', (event) => {
      const key = event.key.toLowerCase();
      const normalized = key === 'w' || key === 'up' ? 'accelerate'
        : key === 's' || key === 'down' ? 'brake'
        : key === 'a' || key === 'left' ? 'left'
        : key === 'd' || key === 'right' ? 'right'
        : null;
      const mappedKey = {
        ArrowUp: 'accelerate',
        ArrowDown: 'brake',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      }[event.key];
      if (normalized) this.input[normalized] = false;
      else if (mappedKey) this.input[mappedKey] = false;
    });
    window.addEventListener('pointerdown', () => {
      this.audio.start();
      this.audio.applySpeed(this.speedKmh);
    });
  }

  flashInput(name) {
    const keyEl = document.querySelector(`[data-control="${name}"]`);
    if (keyEl) {
      keyEl.classList.add('active');
      setTimeout(() => keyEl.classList.remove('active'), 120);
    }
  }

  resetPlayer() {
    const start = this.track.transformAt(0);
    this.position.copy(start.position);
    this.position.y = this.track.roadY + 0.14;
    this.heading = start.heading;
    this.speedKmh = 0;
    this.lapCount = 1;
    this.lapStart = performance.now();
    this.lapStartWall = this.lapStart;
    this.lastLapSeconds = 0;
    this.bestLapSeconds = 0;
    this.lastProgress = 0;
    this.playerParts.group.position.copy(this.position);
    this.playerParts.group.rotation.y = this.heading;
    this.updateHud();
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.08);

    const seconds = dt;
    const speedMs = this.speedKmh / 3.6;

    // Driving input. Braking dominates accelerating if both are held.
    if (this.input.brake) {
      this.speedKmh = Math.max(0, this.speedKmh - 215 * seconds);
    } else if (this.input.accelerate) {
      this.speedKmh = Math.min(MAX_SPEED, this.speedKmh + 132 * seconds);
    }
    if (this.speedKmh < 0.1) this.speedKmh = 0;

    // Steering rate grows slightly with velocity so high-speed turns stay sharp.
    const steerRate = 0.82 + Math.min(this.speedKmh / MAX_SPEED, 1) * 0.74;
    if (this.input.left) this.heading -= steerRate * seconds;
    if (this.input.right) this.heading += steerRate * seconds;

    const forward = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    if (this.speedKmh > 0.05) {
      const movement = forward.clone().multiplyScalar(speedMs * seconds);
      this.position.x += movement.x;
      this.position.z += movement.z;
    }

    // Stay on the asphalt: clamp laterally to the road boundary.
    const near = this.track.nearest(this.position);
    const half = this.track.roadWidth / 2 - 1.2;
    const rel = new THREE.Vector3(this.position.x - near.p.x, 0, this.position.z - near.p.z);
    const lateral = rel.dot(near.normal);
    if (Math.abs(lateral) > half) {
      // Scraping the barrier does not kill momentum; the road steers the car
      // back down the tangent direction while the player can still steer.
      const clampedLateral = Math.sign(lateral) * half;
      const clamped = near.p.clone().add(near.normal.clone().multiplyScalar(clampedLateral));
      this.position.x = clamped.x;
      this.position.z = clamped.z;
      const roadHeading = Math.atan2(near.tangent.x, near.tangent.z);
      let diff = roadHeading - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += diff * Math.min(1, seconds * 6);
      this.edgeActive = true;
    } else {
      this.edgeActive = false;
    }

    // Track progress & lap timer.
    const nearIndex = this.track.samples.indexOf(near);
    const progress = this.track.progress(nearIndex);
    const prev = this.lastProgress;
    if (prev > 0.82 && progress < 0.18 && this.speedKmh > 8) {
      const now = performance.now();
      const lapSeconds = (now - this.lapStart) / 1000;
      this.lastLapSeconds = lapSeconds;
      this.bestLapSeconds = this.bestLapSeconds === 0
        ? lapSeconds
        : Math.min(this.bestLapSeconds, lapSeconds);
      this.lapCount += 1;
      this.lapStart = now;
    }
    this.lastProgress = progress;
    this.nearIndex = nearIndex;
    this.currentLapSeconds = (performance.now() - this.lapStart) / 1000;

    // Cache latest nav information for HUD warnings.
    const slope = Math.abs(lateral);
    this.edgeActive = slope > half + 0.35 || this.edgeActive;

    // Opponents race continuously around the same procedural track.
    for (const opp of this.opponents) {
      const uAdvance = (opp.speedKmh / 3.6) / this.track.trackLength * seconds;
      opp.u = (opp.u + uAdvance) % 1;
      const t = this.track.transformAt(opp.u);
      const lateralDir = new THREE.Vector3(-Math.cos(t.heading), 0, Math.sin(t.heading));
      const pos = t.position.clone().add(lateralDir.multiplyScalar(opp.lane));
      opp.parts.group.position.set(pos.x, this.track.roadY + 0.14, pos.z);
      opp.parts.group.rotation.y = t.heading;
      opp.currentU = opp.u;
    }

    this.playerParts.group.position.copy(this.position);
    this.playerParts.group.rotation.y = this.heading;

    // Chase camera. Position trails the car, easing slightly as speed rises.
    const norm = Math.min(this.speedKmh / MAX_SPEED, 1);
    const trail = 13 + norm * 5;
    const camPos = this.position.clone()
      .addScaledVector(forward, -trail)
      .add(new THREE.Vector3(0, 7.1 + norm * 1.0, 0));
    const lateralSway = Math.sin(performance.now() / 900) * norm * 0.7;
    camPos.add(new THREE.Vector3(lateralSway, 0, 0));
    this.camera.position.copy(camPos);
    const lookPoint = this.position.clone().addScaledVector(forward, 14 + norm * 8);
    lookPoint.y += 1.6;
    this.camera.lookAt(lookPoint);
    this.camera.updateProjectionMatrix();

    // Update physics-driven audio. Pitch and level track velocity.
    this.audio.setSpeed(this.speedKmh);
    this.audio.applySpeed(this.speedKmh);

    // Wind streak particles stream backward while driving fast.
    if (norm > 0.02) {
      const positions = this.streaks.geometry.attributes.position.array;
      for (let i = 0; i < positions.length / 3; i++) {
        const shift = norm * seconds * 6;
        positions[i * 3 + 2] -= shift;
        if (positions[i * 3 + 2] < -26) {
          positions[i * 3 + 2] += 26;
          positions[i * 3 + 0] = (Math.random() - 0.5) * 30;
        }
      }
      this.streaks.geometry.attributes.position.needsUpdate = true;
      this.streaks.position.copy(this.position);
      this.streaks.position.y += 1.0;
    } else {
      this.streaks.visible = false;
    }
    if (norm > 0.02) this.streaks.visible = true;

    this.updateHud();
    this.renderer.render(this.scene, this.camera);
  }

  updateHud() {
    const speed = Math.round(this.speedKmh);
    this.hud.speedNum.textContent = String(speed);
    this.hud.lapNum.textContent = String(this.lapCount);
    this.hud.lapTime.textContent = `${this.currentLapSeconds.toFixed(2)}s`;
    const best = this.bestLapSeconds > 0 ? `${this.bestLapSeconds.toFixed(2)}s best` : 'first lap pending';
    const oppSpeeds = this.opponents.map((o) => Math.round(o.speedKmh)).join(' / ');
    this.hud.opps.textContent = `Opponents ${oppSpeeds} km/h · ${best}`;
    this.hud.edge.style.opacity = this.edgeActive ? '1' : '0';
    this.hud.edge.textContent = this.edgeActive ? 'ROAD EDGE — VEER BACK IN' : '';
  }
}
