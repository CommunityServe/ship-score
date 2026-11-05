import * as THREE from 'three';
import { Game } from './game.js';

export function boot() {
  const canvas = document.getElementById('renderer');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const hud = {
    speedNum: document.getElementById('speedNum'),
    lapNum: document.getElementById('lapNum'),
    lapTime: document.getElementById('lapTime'),
    opps: document.getElementById('opps'),
    edge: document.getElementById('edge'),
    loading: document.getElementById('loading'),
  };

  const game = new Game(renderer, canvas, hud);
  window.__neonRush = game;

  let last = performance.now();

  function animate(now) {
    const dt = (now - last) / 1000;
    last = now;
    game.update(dt);
    window.__gameReady = true;
    window.__gameSpeed = game.speedKmh;
    window.__lap = game.lapCount;
    window.__lapSeconds = game.currentLapSeconds;
    requestAnimationFrame(animate);
  }

  // Initial frame renders immediately, then the boot overlay fades out.
  game.update(0.016);
  hud.loading.classList.add('hidden');
  window.__gameReady = true;
  window.__gameSpeed = game.speedKmh;
  window.__lap = game.lapCount;
  window.__lapSeconds = game.currentLapSeconds;
  requestAnimationFrame(animate);

  window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    game.camera.aspect = width / height;
    game.camera.updateProjectionMatrix();
    game.update(0.016);
  });
}
