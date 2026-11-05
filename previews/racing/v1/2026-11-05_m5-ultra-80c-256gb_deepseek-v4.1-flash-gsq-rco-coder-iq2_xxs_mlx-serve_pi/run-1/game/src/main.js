import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040813);
scene.fog = new THREE.FogExp2(0x07102a, 0.012);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);
renderer.domElement.id = 'game-canvas';

const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(55, 7, -12);

// ---------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------
function makeCanvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = s * 16807 % 2147483647) / 2147483647;
}

const rand = seededRandom(1337);

function asphaltTexture() {
  const w = 1024, h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#111318';
  ctx.fillRect(0, 0, w, h);

  // Fine aggregate noise.
  for (let i = 0; i < 2600; i++) {
    const x = rand() * w, y = rand() * h;
    const r = rand() * 1.8;
    ctx.fillStyle = rand() > 0.48 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Broad wheel-worn bands.
  ctx.globalAlpha = 0.11;
  ctx.fillStyle = '#6f7480';
  for (let lane = 0; lane < 3; lane++) {
    const y = 100 + lane * 156;
    ctx.fillRect(0, y - 16, w, 30);
  }
  ctx.globalAlpha = 1;

  // Subtle cracks.
  ctx.strokeStyle = 'rgba(0,0,0,0.33)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 24; i++) {
    const x = rand() * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + 15, 90, x - 18, 180, x + 10, 300);
    ctx.bezierCurveTo(x - 4, 380, x + 16, 440, x - 8, 512);
    ctx.stroke();
  }

  const laneYs = [128, 256, 384];
  for (const y of laneYs) {
    ctx.strokeStyle = 'rgba(225,229,236,0.82)';
    ctx.lineWidth = 6;
    ctx.setLineDash([54, 42]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Bright edge rails painted into the road texture.
  ctx.strokeStyle = 'rgba(80,229,255,0.6)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 20);
  ctx.lineTo(w, 20);
  ctx.moveTo(0, h - 20);
  ctx.lineTo(w, h - 20);
  ctx.stroke();

  // Sparse tyre scuff marks.
  ctx.strokeStyle = 'rgba(190,205,225,0.07)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 18; i++) {
    const y = 70 + rand() * 375;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(w * 0.25, y + 10, w * 0.7, y - 8, w, y + 3);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(11, 1);
  tex.anisotropy = 8;
  return tex;
}

function groundTexture() {
  const w = 512, h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#090910';
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 900; i++) {
    const x = rand() * w, y = rand() * h;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(82,74,120,0.16)' : 'rgba(2,2,8,0.35)';
    ctx.fillRect(x, y, 1 + rand() * 3, 1 + rand() * 3);
  }

  // Faint city grid.
  ctx.strokeStyle = 'rgba(62,83,120,0.13)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= w; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.anisotropy = 4;
  return tex;
}

function windowTexture(seed, hue) {
  const local = seededRandom(seed);
  const w = 256, h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#05070c';
  ctx.fillRect(0, 0, w, h);

  const colors = [
    `hsl(${hue}, 85%, 63%)`,
    `hsl(${(hue + 160) % 360}, 70%, 68%)`,
    `hsl(${(hue + 310) % 360}, 82%, 62%)`,
    '#ffd48c',
  ];

  for (let row = 0; row < 18; row++) {
    for (let col = 0; col < 8; col++) {
      const x = 16 + col * 29;
      const y = 18 + row * 25;
      const lit = local() > 0.42;
      if (lit) {
        ctx.fillStyle = colors[Math.floor(local() * colors.length)];
        ctx.globalAlpha = 0.78 + local() * 0.2;
        ctx.fillRect(x, y, 15, 9);
        ctx.globalAlpha = 0.3;
        ctx.fillRect(x - 2, y - 2, 19, 13);
      }
    }
  }

  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(30,45,64,0.65)';
  ctx.lineWidth = 2;
  for (let col = 0; col <= 8; col++) {
    ctx.beginPath();
    ctx.moveTo(8 + col * 29, 0);
    ctx.lineTo(8 + col * 29, h);
    ctx.stroke();
  }
  for (let row = 0; row <= 18; row++) {
    ctx.beginPath();
    ctx.moveTo(0, 12 + row * 25);
    ctx.lineTo(w, 12 + row * 25);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function signTexture(text, colorA, colorB) {
  const w = 512, h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#080a12';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = colorA;
  ctx.lineWidth = 5;
  ctx.shadowColor = colorA;
  ctx.shadowBlur = 15;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.font = '900 52px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = colorB;
  ctx.shadowColor = colorA;
  ctx.shadowBlur = 18;
  ctx.fillText(text, w / 2, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------------
// Sky, ground and atmosphere
// ---------------------------------------------------------------------
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    topColor: { value: new THREE.Color(0x030817) },
    horizonColor: { value: new THREE.Color(0x111b46) },
    cityGlow: { value: new THREE.Color(0x3b1e55) },
  },
  vertexShader: `
    varying vec3 vPosition;
    void main() {
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 topColor;
    uniform vec3 horizonColor;
    uniform vec3 cityGlow;
    varying vec3 vPosition;
    void main() {
      float h = normalize(vPosition).y;
      float horizon = smoothstep(-0.08, 0.26, h);
      vec3 col = mix(horizonColor, topColor, horizon);
      float halo = pow(max(0.0, 1.0 - abs(h)), 8.0);
      col += cityGlow * halo * 0.35;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(250, 32, 16), skyMat);
scene.add(sky);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(500, 500, 1, 1),
  new THREE.MeshStandardMaterial({
    map: groundTexture(),
    color: 0x262933,
    roughness: 0.95,
    metalness: 0.05,
  })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.2;
scene.add(ground);

const starGeo = new THREE.BufferGeometry();
const starPositions = [];
for (let i = 0; i < 1500; i++) {
  const theta = rand() * Math.PI * 2;
  const phi = Math.acos(0.08 + rand() * 0.9);
  const r = 220;
  starPositions.push(
    Math.sin(phi) * Math.cos(theta) * r * 0.85,
    Math.cos(phi) * r,
    Math.sin(phi) * Math.sin(theta) * r * 0.85
  );
}
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
const stars = new THREE.Points(
  starGeo,
  new THREE.PointsMaterial({ color: 0xbceaff, size: 1.0, transparent: true, opacity: 0.8, depthWrite: false })
);
scene.add(stars);

// ---------------------------------------------------------------------
// Track curve and road ribbon
// ---------------------------------------------------------------------
const trackPoints = [];
for (let i = 0; i < 28; i++) {
  const a = (i / 28) * Math.PI * 2;
  const radius = 48 + Math.sin(a * 1.7) * 8 + Math.cos(a * 2.4) * 4;
  trackPoints.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
}
const track = new THREE.CatmullRomCurve3(trackPoints, true, 'centripetal', 0.5);
const trackLength = track.getLength();
const ROAD_WIDTH = 15.5;

function roadGeometry() {
  const N = 360;
  const positions = [];
  const uv = [];
  const indices = [];

  for (let i = 0; i < N; i++) {
    const t = i / N;
    const p = track.getPointAt(t);
    const tangent = track.getTangentAt(t).normalize();
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    const left = p.clone().addScaledVector(right, -ROAD_WIDTH / 2);
    const rightEdge = p.clone().addScaledVector(right, ROAD_WIDTH / 2);

    positions.push(left.x, 0.0, left.z, rightEdge.x, 0.0, rightEdge.z);
    uv.push(t, 0.0, t, 1.0);

    if (i < N - 1) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = a + 2;
      const d = b + 2;
      indices.push(a, c, b, c, d, b);
    }
  }

  // Close the loop.
  const p0 = track.getPointAt(0);
  const tan0 = track.getTangentAt(0).normalize();
  const right0 = new THREE.Vector3(tan0.z, 0, -tan0.x).normalize();
  const l0 = p0.clone().addScaledVector(right0, -ROAD_WIDTH / 2);
  const r0 = p0.clone().addScaledVector(right0, ROAD_WIDTH / 2);
  const base = N * 2;
  positions.push(l0.x, 0, l0.z, r0.x, 0, r0.z);
  uv.push(1, 0, 1, 1);
  indices.push((N - 1) * 2, base, (N - 1) * 2 + 1);
  indices.push(base, base + 1, (N - 1) * 2 + 1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

const road = new THREE.Mesh(
  roadGeometry(),
  new THREE.MeshStandardMaterial({
    map: asphaltTexture(),
    color: 0x1a1b20,
    roughness: 0.72,
    metalness: 0.08,
    bumpMap: asphaltTexture(),
    bumpScale: 0.12,
  })
);
road.receiveShadow = true;
scene.add(road);

// Neon side rails.
const railPositionsLeft = [];
const railPositionsRight = [];
for (let i = 0; i < 360; i++) {
  const t = i / 360;
  const p = track.getPointAt(t);
  const tangent = track.getTangentAt(t).normalize();
  const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
  const l = p.clone().addScaledVector(right, -ROAD_WIDTH / 2 - 0.2);
  const r = p.clone().addScaledVector(right, ROAD_WIDTH / 2 + 0.2);
  railPositionsLeft.push(l);
  railPositionsRight.push(r);
}
const railCurveL = new THREE.CatmullRomCurve3(railPositionsLeft, true, 'centripetal');
const railCurveR = new THREE.CatmullRomCurve3(railPositionsRight, true, 'centripetal');

const railMatLeft = new THREE.MeshStandardMaterial({
  color: 0x081018,
  emissive: 0x20dcff,
  emissiveIntensity: 1.7,
  roughness: 0.3,
  metalness: 0.5,
});
const railMatRight = new THREE.MeshStandardMaterial({
  color: 0x0c0814,
  emissive: 0xff46c8,
  emissiveIntensity: 1.4,
  roughness: 0.3,
  metalness: 0.5,
});
const railL = new THREE.Mesh(new THREE.TubeGeometry(railCurveL, 260, 0.09, 8, true), railMatLeft);
const railR = new THREE.Mesh(new THREE.TubeGeometry(railCurveR, 260, 0.09, 8, true), railMatRight);
railL.position.y = 0.12;
railR.position.y = 0.12;
scene.add(railL, railR);

// Start / finish line.
const startCanvas = document.createElement('canvas');
startCanvas.width = 512;
startCanvas.height = 128;
const sctx = startCanvas.getContext('2d');
for (let i = 0; i < 16; i++) {
  sctx.fillStyle = i % 2 ? '#f1f1f0' : '#080a0c';
  sctx.fillRect(i * 32, 0, 32, 128);
}
const startTex = new THREE.CanvasTexture(startCanvas);
startTex.colorSpace = THREE.SRGBColorSpace;
const startGeo = new THREE.PlaneGeometry(ROAD_WIDTH, 1.3);
const startLine = new THREE.Mesh(
  startGeo,
  new THREE.MeshStandardMaterial({ map: startTex, roughness: 0.7, metalness: 0.1 })
);
const startLineGroup = new THREE.Group();
startLineGroup.position.copy(track.getPointAt(0));
startLineGroup.position.y = 0.055;
startLineGroup.rotation.y = Math.atan2(track.getTangentAt(0).x, track.getTangentAt(0).z);
startLine.rotation.x = -Math.PI / 2;
startLineGroup.add(startLine);
scene.add(startLineGroup);

// Neon gantry at the start.
const gantryMat = new THREE.MeshStandardMaterial({
  color: 0x090c13,
  emissive: 0x5befff,
  emissiveIntensity: 1.8,
  metalness: 0.8,
  roughness: 0.25,
});
const p0 = track.getPointAt(0);
const tan0 = track.getTangentAt(0).normalize();
const right0 = new THREE.Vector3(tan0.z, 0, -tan0.x).normalize();
const postGeo = new THREE.BoxGeometry(0.22, 5.0, 0.22);
for (const side of [-1, 1]) {
  const post = new THREE.Mesh(postGeo, gantryMat);
  post.position.copy(p0).addScaledVector(right0, side * (ROAD_WIDTH / 2 + 0.75));
  post.position.y = 2.5;
  scene.add(post);
}
const topBar = new THREE.Mesh(new THREE.BoxGeometry(ROAD_WIDTH + 1.5, 0.22, 0.22), gantryMat);
topBar.position.copy(p0);
topBar.position.y = 5.0;
topBar.rotation.y = Math.atan2(tan0.x, tan0.z);
scene.add(topBar);

// ---------------------------------------------------------------------
// City buildings and billboards
// ---------------------------------------------------------------------
const buildingGroup = new THREE.Group();
scene.add(buildingGroup);

const windowMaterials = [];
for (let i = 0; i < 6; i++) {
  const tex = windowTexture(200 + i * 17, 190 + i * 30);
  windowMaterials.push(new THREE.MeshStandardMaterial({
    color: 0x14141b,
    roughness: 0.65,
    metalness: 0.25,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 1.3,
  }));
}

const accentColors = [0x20d9ff, 0xff4fc8, 0xffbd4a, 0x7f6bff];

function addBuilding(t, sideDist, sideSign, seed) {
  const local = seededRandom(seed);
  const p = track.getPointAt(t);
  const tangent = track.getTangentAt(t).normalize();
  const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
  const width = 6 + local() * 10;
  const depth = 6 + local() * 9;
  const height = 15 + local() * 42;

  const material = windowMaterials[Math.floor(local() * windowMaterials.length)].clone();
  material.emissiveIntensity = 0.85 + local() * 0.7;

  const b = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  b.position.copy(p).addScaledVector(right, sideSign * sideDist);
  b.position.y = height / 2;
  b.rotation.y = Math.atan2(tangent.x, tangent.z) + (local() - 0.5) * 0.3;
  buildingGroup.add(b);

  const trimColor = accentColors[Math.floor(local() * accentColors.length)];
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x05080d,
    emissive: trimColor,
    emissiveIntensity: 2.2,
    roughness: 0.3,
    metalness: 0.6,
  });
  const trim = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, 0.14, depth + 0.08), trimMat);
  trim.position.copy(b.position);
  trim.position.y = height + 0.08;
  trim.rotation.copy(b.rotation);
  buildingGroup.add(trim);
}

for (let i = 0; i < 24; i++) {
  const t = i / 24 + 0.015;
  addBuilding(t, 24 + rand() * 34, 1, 500 + i * 11);
  if (i % 2 === 0) addBuilding(t + 0.045, 24 + rand() * 25, 1, 800 + i * 17);
}

for (let i = 0; i < 16; i++) {
  const t = i / 16 + 0.02;
  addBuilding(t, 27 + rand() * 34, -1, 1000 + i * 13);
}

function addBillboard(t, sideSign, colorA, colorB, label) {
  const p = track.getPointAt(t);
  const tangent = track.getTangentAt(t).normalize();
  const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
  const tex = signTexture(label, colorA, colorB);
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.0, 2.0), mat);
  sign.position.copy(p).addScaledVector(right, sideSign * 17.0);
  sign.position.y = 5.5 + rand() * 2.2;
  sign.rotation.y = Math.atan2(tangent.x, tangent.z) + (sideSign === 1 ? Math.PI / 2 : -Math.PI / 2) + 0.2;
  scene.add(sign);

  const support = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 5.0, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x11141b, metalness: 0.8, roughness: 0.3 })
  );
  support.position.copy(sign.position);
  support.position.y = 3.2;
  scene.add(support);
}

addBillboard(0.16, 1, '#23e6ff', '#b5fdff', 'NEON RUNNER');
addBillboard(0.28, -1, '#ff4fc8', '#ffd5f3', 'APEX');
addBillboard(0.64, 1, '#ffbd4a', '#fff0c0', 'MIDNIGHT');
addBillboard(0.78, -1, '#7f6bff', '#ded7ff', 'VELOCITY');

// Extra roadside lights.
const pointLightColors = [0x27dfff, 0xff4fc8, 0xffbd4a];
for (let i = 0; i < 12; i++) {
  const t = i / 12 + 0.03;
  const p = track.getPointAt(t);
  const tangent = track.getTangentAt(t).normalize();
  const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
  const color = pointLightColors[i % pointLightColors.length];
  const light = new THREE.PointLight(color, 11, 34, 2);
  light.position.copy(p).addScaledVector(right, 9.5);
  light.position.y = 4.5;
  scene.add(light);
}

// ---------------------------------------------------------------------
// Cars
// ---------------------------------------------------------------------
function makeCar(paintColor, accentColor, name) {
  const car = new THREE.Group();
  car.name = name;

  const paint = new THREE.MeshStandardMaterial({
    color: paintColor,
    metalness: 0.65,
    roughness: 0.28,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x050608,
    metalness: 0.6,
    roughness: 0.35,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x1e3c52,
    metalness: 0.55,
    roughness: 0.08,
    transparent: true,
    opacity: 0.7,
  });
  const neon = new THREE.MeshStandardMaterial({
    color: 0x05090b,
    emissive: accentColor,
    emissiveIntensity: 2.8,
    metalness: 0.5,
    roughness: 0.2,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfff4d2,
    emissive: 0xffe9b0,
    emissiveIntensity: 3.5,
    toneMapped: false,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x330000,
    emissive: 0xff1c25,
    emissiveIntensity: 3.0,
    toneMapped: false,
  });

  // Main chassis and hood.
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.46, 4.65), paint);
  chassis.position.y = 0.61;
  chassis.castShadow = true;
  car.add(chassis);

  const lowerSkirt = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.25, 4.15), dark);
  lowerSkirt.position.y = 0.43;
  car.add(lowerSkirt);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.32, 1.15), paint);
  nose.position.set(0, 0.77, 2.05);
  car.add(nose);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.18, 1.55), paint);
  hood.position.set(0, 0.91, 1.33);
  car.add(hood);

  // Cab with a slightly angled front.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.57, 1.42), glass);
  cabin.position.set(0, 1.15, -0.1);
  car.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.12, 1.52), paint);
  roof.position.set(0, 1.45, -0.12);
  car.add(roof);

  const rear = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.42, 1.12), paint);
  rear.position.set(0, 0.72, -1.78);
  car.add(rear);

  // Spoiler.
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.09, 0.42), neon);
  spoiler.position.set(0, 1.02, -2.18);
  spoiler.rotation.x = -0.12;
  car.add(spoiler);

  // Side neon stripes.
  for (const side of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.07, 3.1), neon);
    stripe.position.set(side * 1.13, 0.74, -0.15);
    car.add(stripe);
  }

  // Tail lights.
  for (const side of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.11, 0.06), tailMat);
    tail.position.set(side * 0.58, 0.78, -2.29);
    car.add(tail);
  }

  // Head lights.
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.13, 0.08), headlightMat);
    lamp.position.set(side * 0.62, 0.73, 2.38);
    car.add(lamp);
    const point = new THREE.PointLight(0xffe2a6, 7.5, 15, 2);
    point.position.set(side * 0.62, 0.76, 2.55);
    car.add(point);
  }

  // Two front beams.
  for (const side of [-1, 1]) {
    const beam = new THREE.SpotLight(0xffd59b, 16, 34, 0.42, 1.0, 1.4);
    beam.position.set(side * 0.62, 0.82, 2.52);
    const target = new THREE.Object3D();
    target.position.set(side * 1.15, 0.15, 15);
    car.add(target);
    beam.target = target;
    car.add(beam);
  }

  // Wheels.
  const wheelPositions = [
    [-1.12, 0.38, 1.42],
    [1.12, 0.38, 1.42],
    [-1.12, 0.38, -1.43],
    [1.12, 0.38, -1.43],
  ];
  const wheels = [];
  const frontWheels = [];
  for (const [x, y, z] of wheelPositions) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);

    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.34, 18), dark);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    pivot.add(tire);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.035, 8, 20), neon);
    rim.rotation.y = Math.PI / 2;
    pivot.add(rim);

    wheels.push(pivot);
    if (z > 0) frontWheels.push(pivot);
    car.add(pivot);
  }

  // Underglow.
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.7, 4.8),
    new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.035;
  car.add(glow);

  // Fake contact shadow.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.55, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1.0, 1.9, 1.0);
  shadow.position.y = 0.04;
  car.add(shadow);

  car.userData.wheels = wheels;
  car.userData.frontWheels = frontWheels;
  return car;
}

const player = makeCar(0xf04422, 0xff6b2c, 'player');
const opp1 = makeCar(0x2397d8, 0x52dfff, 'opponent-1');
const opp2 = makeCar(0xc438d8, 0xff7ae0, 'opponent-2');
scene.add(player, opp1, opp2);

// Opponent state.
const oppState = [
  { t: 0.055, speed: 92, lane: 2.9, car: opp1 },
  { t: 0.115, speed: 84, lane: -2.9, car: opp2 },
];

// Player state.
let playerT = 0.0;
let playerLateral = 0.0;
let speedKph = 92;
const MAX_SPEED = 285;
let lapNumber = 1;
let lapTime = 0;
let lastPlayerT = playerT;
let steerVisual = 0;
let wheelSpin = 0;

function placeCar(car, t, lane, yawExtra, rollExtra) {
  const p = track.getPointAt(t);
  const tangent = track.getTangentAt(t).normalize();
  const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
  const pos = p.clone().addScaledVector(right, lane);
  pos.y += 0.02;
  car.position.copy(pos);
  car.rotation.y = Math.atan2(tangent.x, tangent.z) + yawExtra;
  car.rotation.z = rollExtra;
  return { p, tangent, right };
}

// ---------------------------------------------------------------------
// Audio: all generated with Web Audio oscillators and noise buffers
// ---------------------------------------------------------------------
let audioCtx = null;
let engineA = null;
let engineB = null;
let rumble = null;
let noiseSrc = null;
let noiseFilter = null;
let noiseGain = null;
let tireOsc = null;
let tireGain = null;

function createNoiseBuffer(ctx) {
  const seconds = 2.0;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function startAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {
    audioCtx = null;
    return;
  }

  const master = audioCtx.createGain();
  master.gain.value = 0.5;
  master.connect(audioCtx.destination);

  engineA = audioCtx.createOscillator();
  engineA.type = 'sawtooth';
  engineA.frequency.value = 55;
  const gainA = audioCtx.createGain();
  gainA.gain.value = 0.08;
  engineA.connect(gainA);
  gainA.connect(master);

  engineB = audioCtx.createOscillator();
  engineB.type = 'square';
  engineB.frequency.value = 90;
  const gainB = audioCtx.createGain();
  gainB.gain.value = 0.04;
  engineB.connect(gainB);
  gainB.connect(master);

  rumble = audioCtx.createOscillator();
  rumble.type = 'sine';
  rumble.frequency.value = 28;
  const gainR = audioCtx.createGain();
  gainR.gain.value = 0.05;
  rumble.connect(gainR);
  gainR.connect(master);

  const noiseBuffer = createNoiseBuffer(audioCtx);
  noiseSrc = audioCtx.createBufferSource();
  noiseSrc.buffer = noiseBuffer;
  noiseSrc.loop = true;
  noiseFilter = audioCtx.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.value = 200;
  noiseGain = audioCtx.createGain();
  noiseGain.gain.value = 0.05;
  noiseSrc.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);

  tireOsc = audioCtx.createOscillator();
  tireOsc.type = 'triangle';
  tireOsc.frequency.value = 320;
  const tireFilter = audioCtx.createBiquadFilter();
  tireFilter.type = 'bandpass';
  tireFilter.frequency.value = 360;
  tireFilter.Q.value = 2.5;
  tireGain = audioCtx.createGain();
  tireGain.gain.value = 0.0;
  tireOsc.connect(tireFilter);
  tireFilter.connect(tireGain);
  tireGain.connect(master);

  engineA.start();
  engineB.start();
  rumble.start();
  noiseSrc.start();
  tireOsc.start();
}

function updateAudio(speed, steer) {
  if (!audioCtx || !engineA || !engineB || !rumble || !noiseFilter || !noiseGain || !tireOsc || !tireGain) return;
  const norm = THREE.MathUtils.clamp(speed / MAX_SPEED, 0, 1);
  const now = audioCtx.currentTime;
  engineA.frequency.setValueAtTime(52 + norm * 170, now);
  engineB.frequency.setValueAtTime(90 + norm * 260, now);
  rumble.frequency.setValueAtTime(24 + norm * 50, now);
  noiseFilter.frequency.setValueAtTime(130 + norm * 620, now);
  noiseGain.gain.setValueAtTime(0.045 + norm * 0.17, now);
  tireGain.gain.setValueAtTime(Math.abs(steer) * (0.02 + norm * 0.12), now);
  tireOsc.frequency.setValueAtTime(250 + norm * 240, now);
}

// ---------------------------------------------------------------------
// Keyboard controls
// ---------------------------------------------------------------------
const hudSpeed = document.getElementById('speed-value');
const hudLap = document.getElementById('lap-value');
const hudLapCount = document.getElementById('lap-count');
const hudStatus = document.getElementById('status-value');

function handleKey(event) {
  const key = event.key.toLowerCase();
  const arrow = event.key;
  const isAccelerate = key === 'w' || arrow === 'ArrowUp';
  const isBrake = key === 's' || key === ' ' || arrow === 'ArrowDown' || key === 'b';
  const isLeft = key === 'a' || arrow === 'ArrowLeft';
  const isRight = key === 'd' || arrow === 'ArrowRight';

  if (isAccelerate) {
    speedKph = Math.min(MAX_SPEED, speedKph + 9);
    startAudio();
    steerVisual *= 0.45;
  } else if (isBrake) {
    speedKph = Math.max(0, speedKph - 18);
    startAudio();
    steerVisual *= 0.45;
  } else if (isLeft) {
    playerLateral = Math.max(-ROAD_WIDTH / 2 + 1.0, playerLateral - 0.85);
    steerVisual = -0.45;
    startAudio();
  } else if (isRight) {
    playerLateral = Math.min(ROAD_WIDTH / 2 - 1.0, playerLateral + 0.85);
    steerVisual = 0.45;
    startAudio();
  }

  // Keep control keys from scrolling the page.
  if (isAccelerate || isBrake || isLeft || isRight) {
    event.preventDefault();
  }
}
window.addEventListener('keydown', handleKey);

// ---------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------
function updateHUD() {
  hudSpeed.textContent = Math.round(speedKph).toString().padStart(3, '0');
  hudLapCount.textContent = lapNumber.toString();
  const lapMinutes = Math.floor(lapTime / 60);
  const lapSeconds = lapTime - lapMinutes * 60;
  hudLap.textContent = `${lapMinutes.toString().padStart(2, '0')}:${lapSeconds.toFixed(1).padStart(4, '0')}`;
  hudStatus.textContent = speedKph > 220 ? 'SURGE' : speedKph > 120 ? 'RUN' : 'IDLE';
}

// ---------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------
const clock = new THREE.Clock();
let elapsed = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  const metersPerSec = speedKph / 3.6;
  const newT = (playerT + (metersPerSec * dt) / trackLength) % 1;

  if (newT < playerT - 0.5 && playerT > 0.5) {
    // Crossing the finish line.
    lapNumber++;
    lapTime = 0;
  } else {
    lapTime += dt;
  }

  playerT = newT;
  lastPlayerT = playerT;

  // Smooth out wheel steer and use a small lateral sway as feedback.
  steerVisual *= 0.92;
  const lane = playerLateral + Math.sin(elapsed * 1.5) * 0.04;

  const playerPlace = placeCar(
    player,
    playerT,
    lane,
    steerVisual * 0.18,
    -steerVisual * 0.08
  );

  // Player wheel spin and front wheel steering.
  wheelSpin += metersPerSec * dt * 0.8;
  const wheels = player.userData.wheels;
  const frontWheels = player.userData.frontWheels;
  for (const pivot of wheels) pivot.rotation.x = wheelSpin;
  for (const pivot of frontWheels) pivot.rotation.y = steerVisual * 0.65;

  // Opponents follow the track at their own speeds.
  for (const o of oppState) {
    o.t = (o.t + (o.speed / 3.6 * dt) / trackLength) % 1;
    o.speed += Math.sin(elapsed * 0.9 + o.t * 4) * 0.9;
    placeCar(o.car, o.t, o.lane, 0, 0);
    const ow = o.car.userData.wheels;
    const spin = o.speed / 3.6 * dt * 1.1;
    for (const pivot of ow) {
      pivot.rotation.x = spin;
    }
  }

  // Chase camera.
  const camLocal = playerPlace.p.clone();
  camLocal.addScaledVector(playerPlace.tangent, -12.0);
  camLocal.addScaledVector(playerPlace.right, 1.7);
  camLocal.y = 5.6 + Math.sin(elapsed * 1.8) * 0.08 + (speedKph / MAX_SPEED) * 0.5;

  camera.position.lerp(camLocal, 0.16);
  const look = playerPlace.p.clone().addScaledVector(playerPlace.tangent, 18.0);
  camera.lookAt(look);

  updateAudio(speedKph, steerVisual);
  updateHUD();
  debugState.speedKph = speedKph;
  debugState.lapNumber = lapNumber;
  debugState.lapTime = lapTime;

  composer.render();
  window.__racerReady = true;
}

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.42,
  0.65,
  0.55
);
composer.addPass(bloom);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloom.setSize(window.innerWidth, window.innerHeight);
});

const debugState = { speedKph, lapNumber, lapTime };
window.__racer = debugState;

frame();

