import * as THREE from 'three';
import { Track } from './track.js';
import { PlayerCar, createCarVisual } from './car.js';
import { createOpponents } from './opponents.js';
import { Hud } from './hud.js';
import { Soundscape } from './audio.js';
import { ParticleFX } from './particles.js';
import {
  makeSkyDome,
  createCubeEnvironment,
} from './textures.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x3a1c35, 0.00155);
scene.environment = createCubeEnvironment();

const camera = new THREE.PerspectiveCamera(
  61,
  window.innerWidth / window.innerHeight,
  0.1,
  2400
);
camera.position.set(0, 4, -8);

const sky = makeSkyDome();
sky.renderOrder = -1000;
sky.material.depthTest = false;
scene.add(sky);

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0x9ec8ff, 0x5b2634, 0.85);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xffb174, 2.4);
sunLight.position.set(-90, 90, 30);
scene.add(sunLight);
const rimLight = new THREE.DirectionalLight(0x5c7cff, 1.15);
rimLight.position.set(120, 60, -150);
scene.add(rimLight);
const glow = new THREE.DirectionalLight(0xff2f86, 0.45);
glow.position.set(0, 18, -120);
scene.add(glow);

// ---------------------------------------------------------------------------
// World and cars
// ---------------------------------------------------------------------------
const track = new Track(scene);
const playerVisual = createCarVisual({
  color: '#ff3b2f',
  stripe: '#f5f9ff',
  accent: 0x36f2ff,
  seed: 23,
});
scene.add(playerVisual);
const player = new PlayerCar(track, playerVisual, 24);

const opponents = createOpponents(track);
opponents.forEach((opp) => scene.add(opp.root));

const particles = new ParticleFX(scene);
const sound = new Soundscape();
const hud = new Hud(track, {
  colors: ['#17e0c2', '#ff8a2b', '#a56bff', '#d9e6f2'],
});

// ---------------------------------------------------------------------------
// Race state
// ---------------------------------------------------------------------------
const TOTAL_LAPS = 3;
const race = {
  phase: 'countdown',
  countdownLeft: 3.0,
  countdownText: '',
  startedAt: 0,
  laps: 0,
  lapStartAt: 0,
  lastLapMs: null,
  bestLapMs: null,
  finishedAt: 0,
  finishPlace: 0,
  prevDist: 24,
};

let nitro = 1.0;
let demoMode = false;
let cameraMode = 0;
const CAMERA_NAMES = ['CHASE', 'BUMPER CAM'];
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const camForward = new THREE.Vector3();
const camRight = new THREE.Vector3();
const camUp = new THREE.Vector3(0, 1, 0);
let cameraReady = false;
let lastImpactAt = 0;
let lastInput = { throttle: false, brake: false, steer: 0, handbrake: false, boost: false };
let ready = false;

const held = new Set();
const preventKeys = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);

function startAudio() {
  sound.start();
}

window.addEventListener('keydown', (e) => {
  if (preventKeys.has(e.code)) e.preventDefault();
  held.add(e.code);
  startAudio();
  if (e.code === 'KeyC') {
    cameraMode = (cameraMode + 1) % CAMERA_NAMES.length;
    hud.setCam(CAMERA_NAMES[cameraMode]);
  }
  if (e.code === 'KeyM') {
    sound.setMuted(!sound.muted);
  }
  if (e.code === 'KeyR') {
    resetRace();
  }
});

window.addEventListener('keyup', (e) => {
  held.delete(e.code);
});

window.addEventListener('pointerdown', () => {
  startAudio();
});

function resetRace() {
  race.phase = 'countdown';
  race.countdownLeft = 3.0;
  race.countdownText = '';
  race.startedAt = 0;
  race.laps = 0;
  race.lapStartAt = 0;
  race.lastLapMs = null;
  race.bestLapMs = null;
  race.finishedAt = 0;
  race.finishPlace = 0;
  race.prevDist = 24;
  nitro = 1.0;
  player.reset(24);
  opponents.forEach((opp) => opp.reset());
  hud.hideResults();
  hud.clearMessage();
  hud.setMessage('3', 0.9, 'count');
  hud.setCam(CAMERA_NAMES[cameraMode].replace(' CAM', ' CAM'));
  cameraReady = false;
  sound.beep(520, 0.1, 0.06);
}

function angleDelta(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function demoControls() {
  // Only used by the screenshot driver to showcase clean laps. It is never
  // enabled by normal keyboard play. Pure-pursuit aims at the centre line.
  const loc = track.locate(player.pos, player.lastIdx);
  const speedMps = player.speedKmh / 3.6;
  const aimAhead = 18 + speedMps * 0.7;
  const target = track.frameAt((loc.dist + aimAhead) % track.length).p;
  const bearing = Math.atan2(
    target.x - player.pos.x,
    target.z - player.pos.z
  );
  const diff = angleDelta(player.yaw, bearing);
  const steer = THREE.MathUtils.clamp(diff * 1.6, -1, 1);
  const throttle = player.speedKmh < 285;
  const brake = player.speedKmh > 305;
  lastInput = { throttle, brake, steer, handbrake: false, boost: false };
  return lastInput;
}
function raceInput() {
  if (demoMode && race.phase === 'racing') return demoControls();
  const raceOn = race.phase === 'racing';
  let steer = 0;
  if (raceOn) {
    if (held.has('KeyD') || held.has('ArrowRight')) steer += 1;
    if (held.has('KeyA') || held.has('ArrowLeft')) steer -= 1;
  }
  const throttle = raceOn && (held.has('KeyW') || held.has('ArrowUp'));
  const brake = raceOn && (held.has('KeyS') || held.has('ArrowDown'));
  const handbrake = raceOn && held.has('Space');
  const wantsBoost =
    raceOn &&
    (held.has('ShiftLeft') || held.has('ShiftRight')) &&
    nitro > 0.02 &&
    throttle;
  lastInput = { throttle, brake, steer, handbrake, boost: wantsBoost };
  return lastInput;
}

function computePosition(playerDist) {
  const totalPlayer = race.laps * track.length + playerDist;
  let ahead = 0;
  for (const opp of opponents) {
    if (opp.laps * track.length + opp.d > totalPlayer) ahead++;
  }
  return ahead + 1;
}

// ---------------------------------------------------------------------------
// Per-frame simulation
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let time = 0;
let simTime = 0;
let spawnAccum = 0;
let wallWasTouching = false;
const FIXED_STEP = 1 / 60;
const MAX_STEPS = 8;
let accumulator = 0;
const simNowMs = () => simTime * 1000;

function updateCountdown(dt) {
  race.countdownLeft -= dt;
  if (race.countdownLeft > 0) {
    const txt = race.countdownLeft > 2 ? '3' : race.countdownLeft > 1 ? '2' : '1';
    if (txt !== race.countdownText) {
      race.countdownText = txt;
      hud.setMessage(txt, 0.95, 'count');
      sound.beep(txt === '1' ? 690 : txt === '2' ? 610 : 520, 0.1, 0.055);
    }
  } else if (race.phase === 'countdown') {
    race.phase = 'racing';
    race.startedAt = simNowMs();
    race.lapStartAt = race.startedAt;
    race.prevDist = player.track.locate(player.pos, player.lastIdx).dist;
    hud.setMessage('GO!', 0.9, 'go');
    sound.beep(900, 0.2, 0.1);
  }
}

function finishRace(now, dist) {
  race.phase = 'finished';
  race.finishPlace = computePosition(dist);
  hud.showResults(
    now - race.startedAt,
    race.bestLapMs,
    `${race.finishPlace} / ${opponents.length + 1}`
  );
  hud.clearMessage();
  sound.beep(620, 0.15, 0.1);
  sound.beep(800, 0.25, 0.1);
}

function handleLapEvents(now, dist) {
  if (race.phase !== 'racing') return;
  const L = track.length;
  if (race.prevDist > L * 0.68 && dist < L * 0.32) {
    // Forward crossing of the start/finish line.
    const lapMs = now - race.lapStartAt;
    race.lastLapMs = lapMs;
    race.bestLapMs = race.bestLapMs == null ? lapMs : Math.min(race.bestLapMs, lapMs);
    race.laps += 1;
    if (race.laps >= TOTAL_LAPS) {
      finishRace(now, dist);
    } else {
      race.lapStartAt = now;
      hud.setMessage(`LAP ${race.laps + 1}/${TOTAL_LAPS}`, 1.2, 'flash');
      sound.beep(720, 0.12, 0.08);
    }
  } else if (race.prevDist < L * 0.32 && dist > L * 0.68) {
    // Reverse crossing: do not award a lap.
    race.lapStartAt = now;
  }
  race.prevDist = dist;
}

function resolveCollisions() {
  if (race.phase === 'finished') return;
  const now = performance.now();
  for (const opp of opponents) {
    const dx = player.pos.x - opp.pos.x;
    const dz = player.pos.z - opp.pos.z;
    const dist = Math.hypot(dx, dz);
    const minDist = 2.9;
    if (dist > 0.001 && dist < minDist) {
      const nx = dx / dist;
      const nz = dz / dist;
      const overlap = (minDist - dist) * 0.75;
      player.pos.x += nx * overlap;
      player.pos.z += nz * overlap;
      const vn = player.velocity.x * nx + player.velocity.z * nz;
      if (vn < 0) {
        player.velocity.x -= nx * vn * 1.4;
        player.velocity.z -= nz * vn * 1.4;
      }
      if (now - lastImpactAt > 650 && overlap > 0.25) {
        lastImpactAt = now;
        player.velocity.multiplyScalar(0.92);
        sound.crash(0.35);
        const contact = player.pos.clone().lerp(opp.pos, 0.5);
        for (let i = 0; i < 10; i++) {
          particles.spraySparks(
            contact.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 0.2, (Math.random() - 0.5) * 1.4)),
            new THREE.Color('#ff9b3d')
          );
        }
      }
    }
  }
}

function emitSmoke(character, dt) {
  if (race.phase !== 'racing') return;
  const speed = character.speedKmh;
  const slip = character.slip;
  if ((slip > 6.0 && speed > 35) || (lastInput.handbrake && speed > 12)) {
    spawnAccum += dt;
    const fwd = character.forward;
    const rgt = character.right;
    while (spawnAccum > 0.09) {
      spawnAccum -= 0.09;
      for (const sx of [-1, 1]) {
        const pos = character.pos
          .clone()
          .addScaledVector(rgt, sx * 0.9)
          .addScaledVector(fwd, -1.3);
        pos.y = 0.35;
        particles.spraySmoke(
          pos,
          rgt.clone().multiplyScalar(sx * 2 + (Math.random() - 0.5) * 2),
          new THREE.Color(0.24, 0.26, 0.32)
        );
      }
    }
  } else {
    spawnAccum = 0;
  }
}

function updateCamera(dt) {
  const speedNorm = Math.min(player.speedKmh / 320, 1);
  // In bumper view the camera sits at the nose; hide the car so its roof
  // cannot fill the frame. Chase view always shows the full car.
  player.root.visible = cameraMode === 0;
  camForward.set(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  camRight.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));

  const boost = lastInput.boost ? 1 : 0;
  let targetFov;
  let targetPos;
  let targetLook;

  if (cameraMode === 1) {
    // Bumper camera, just past the nose so the car body never fills the frame.
    targetFov = 67 + speedNorm * 12 + boost * 5;
    targetPos = player.pos
      .clone()
      .addScaledVector(camForward, 2.42)
      .add(new THREE.Vector3(0, 1.32, 0));
    targetLook = player.pos
      .clone()
      .addScaledVector(camForward, 30)
      .add(new THREE.Vector3(0, 1.1, 1.0));
  } else {
    // Chase camera. The faster we go, the further back and higher it sits.
    targetFov = 58 + speedNorm * 13 + boost * 4;
    const distance = 7.8 + speedNorm * 1.2;
    const height = 3.2 + speedNorm * 0.5;
    targetPos = player.pos
      .clone()
      .addScaledVector(camForward, -distance)
      .addScaledVector(camRight, lastInput.steer * 0.55)
      .add(new THREE.Vector3(0, height, 0));
    targetLook = player.pos
      .clone()
      .addScaledVector(camForward, 5.0 + speedNorm * 10)
      .add(new THREE.Vector3(0, 1.1, 0));
  }

  // Keep the camera above the road.
  targetPos.y = Math.max(targetPos.y, 0.9);

  if (!cameraReady) {
    camPos.copy(targetPos);
    camLook.copy(targetLook);
    cameraReady = true;
  } else {
    const posLerp = 1 - Math.exp(-dt * (cameraMode === 1 ? 18 : 5.4));
    const lookLerp = 1 - Math.exp(-dt * (cameraMode === 1 ? 20 : 8.5));
    camPos.lerp(targetPos, posLerp);
    camLook.lerp(targetLook, lookLerp);
  }

  camera.position.copy(camPos);
  // High-speed hand-held shake.
  const shake = speedNorm * speedNorm * 0.055 + (player.wallContact ? 0.12 : 0);
  if (shake > 0.001) {
    camera.position.x += Math.sin(time * 17.3) * shake;
    camera.position.y += Math.sin(time * 21.7 + 1.3) * shake * 0.6;
    camera.position.z += Math.cos(time * 13.1 + 0.5) * shake;
  }
  camera.lookAt(camLook);
  camera.rotateZ(-player.roll * 0.28);
  const fovDiff = targetFov - camera.fov;
  if (Math.abs(fovDiff) > 0.02) {
    camera.fov += fovDiff * Math.min(1, dt * 4.5);
    camera.updateProjectionMatrix();
  }
}

function updateAudioHud(now) {
  const dbg = sound.getDebug();
  const audioEl = document.getElementById('audio-state');
  const eq = document.querySelector('.eq');
  if (dbg.started) {
    audioEl.textContent = dbg.muted ? 'SOUND: MUTED [M]' : 'ENGINE: LIVE';
    audioEl.classList.toggle('live', !dbg.muted);
    eq.classList.toggle('live', !dbg.muted);
    document.querySelector('.audio-line').classList.toggle('live', !dbg.muted);
  } else {
    audioEl.textContent = 'SOUND: TAP / PRESS A KEY';
    audioEl.classList.remove('live');
    eq.classList.remove('live');
    document.querySelector('.audio-line').classList.remove('live');
  }
}

function updateHud(now, position) {
  const lapTimeMs =
    race.phase === 'racing' ? now - race.lapStartAt : race.lastLapMs || 0;
  const raceTimeMs =
    race.startedAt && race.phase !== 'countdown'
      ? now - race.startedAt
      : 0;
  const gear = player.speedKmh < 1 ? 1 : Math.min(6, Math.floor(player.speedKmh / 48) + 1);
  hud.update({
    speed: player.speedKmh,
    laps: race.laps,
    totalLaps: TOTAL_LAPS,
    lapTimeMs: race.phase === 'finished' ? race.lastLapMs : lapTimeMs,
    lastLapMs: race.lastLapMs,
    bestLapMs: race.bestLapMs,
    raceTimeMs,
    position,
    playerYaw: player.yaw,
    playerPos: player.pos,
    opponents: opponents.map((o) => ({ pos: o.pos, yaw: o.yaw })),
    nitro,
    gear,
  });
  document.getElementById('gear-value').textContent = `GEAR ${gear}`;
  const tint = document.querySelector('.speed-tint');
  tint.style.opacity = String(Math.min(0.85, (player.speedKmh / 320) ** 2 * 0.7 + (lastInput.boost ? 0.3 : 0)));
}

function stepSimulation(dt) {
  simTime += dt;
  const now = simNowMs();
  time += dt;

  if (race.phase === 'countdown') {
    updateCountdown(dt);
  }

  const input = raceInput();
  const physics =
    race.phase === 'racing'
      ? player.update(dt, input)
      : player.update(0, input);

  for (const opp of opponents) {
    opp.update(dt, race.phase === 'racing');
  }

  resolveCollisions();

  // Re-locate after collision pushes.
  const loc = track.locate(player.pos, player.lastIdx);
  player.lastIdx = loc.index;
  const dist = loc.dist;
  handleLapEvents(now, dist);

  emitSmoke(player, dt);
  particles.update(dt);

  // Nitro drain / regeneration and HUD.
  if (input.boost) {
    nitro = Math.max(0, nitro - dt * 0.28);
  } else {
    nitro = Math.min(1, nitro + dt * 0.045);
  }

  const position = computePosition(dist);
  updateHud(now, position);
  updateAudioHud(now);
  sound.update(dt, {
    speed: player.speedKmh,
    throttle: input.throttle ? 1 : 0,
    slip: physics.slip,
    braking: input.brake ? 1 : 0,
    boosting: input.boost ? 1 : 0,
  });

  updateCamera(dt);

  // Wall scrape feedback, once per contact.
  if (player.wallContact && !wallWasTouching && player.speedKmh > 30) {
    sound.crash(0.45);
    const side = Math.sign(loc.lateral) || 1;
    const contact = player.pos.clone().addScaledVector(loc.side, side * 1.0);
    contact.y = 0.25;
    for (let i = 0; i < 8; i++) {
      particles.spraySparks(contact, new THREE.Color('#ffb03d'));
    }
  }
  wallWasTouching = player.wallContact;

}

function animate() {
  const frameDt = Math.min(clock.getDelta(), 0.25);
  accumulator += frameDt;
  let steps = 0;
  while (accumulator >= FIXED_STEP && steps < MAX_STEPS) {
    stepSimulation(FIXED_STEP);
    accumulator -= FIXED_STEP;
    steps++;
  }
  renderer.render(scene, camera);
  if (!ready) {
    ready = true;
    window.__gameReady = true;
  }
  requestAnimationFrame(animate);
}

// ---------------------------------------------------------------------------
// Boot / resize / debug hooks
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

resetRace();
requestAnimationFrame(animate);

window.__game = {
  ready: () => ready,
  state: () => ({
    phase: race.phase,
    speed: player.speedKmh,
    laps: race.laps,
    position: computePosition(
      track.locate(player.pos, player.lastIdx).dist
    ),
    lapMs: race.lastLapMs,
    bestMs: race.bestLapMs,
    simMs: simNowMs(),
    started: race.phase === 'racing' || race.phase === 'finished',
    nitro,
    audio: sound.getDebug(),
    camera: CAMERA_NAMES[cameraMode],
  }),
  debug: () => {
    const L = track.length;
    const loc = track.locate(player.pos, -1);
    const lookDist = (loc.dist + 34) % track.length;
    const f = track.frameAt(lookDist);
    return {
      phase: race.phase,
      speedKmh: player.speedKmh,
      dist: loc.dist,
      lateral: loc.lateral,
      carYaw: player.yaw,
      lookYaw: Math.atan2(f.tangent.x, f.tangent.z),
      trackLength: L,
      laps: race.laps,
      position: computePosition(loc.dist),
      audio: sound.getDebug(),
      camera: CAMERA_NAMES[cameraMode],
      nitro,
      opponents: opponents.map((o) => {
        const dx = o.pos.x - player.pos.x;
        const dz = o.pos.z - player.pos.z;
        const sy = Math.sin(player.yaw);
        const cy = Math.cos(player.yaw);
        return {
          d: o.d, laps: o.laps, lane: o.lane,
          along: dx * sy + dz * cy,
          lat: dx * cy - dz * sy,
        };
      }),
    };
  },
  setCamera(mode) {
    cameraMode = Math.max(0, Math.min(CAMERA_NAMES.length - 1, mode | 0));
    hud.setCam(CAMERA_NAMES[cameraMode]);
  },
  reset: resetRace,
  setDemo: (enabled) => {
    demoMode = !!enabled;
  },
  forceRace: () => {
    race.countdownLeft = 0;
    race.phase = 'racing';
    race.startedAt = simNowMs();
    race.lapStartAt = race.startedAt;
    hud.clearMessage();
  },
};
