import * as THREE from 'three';
import {
  asphaltTexture,
  grassTexture,
  concreteTexture,
  brushedGroundTexture,
  billboardTexture,
  skyTexture,
  glowTexture,
} from './textures.js';

const ROAD_WIDTH = 16;
const ROAD_Y = 0.18;
const WALL_HEIGHT = 1.65;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createCurvePoints() {
  const points = [];
  const segments = 36;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const r =
      173 +
      25 * Math.sin(a * 3 + 0.4) +
      15 * Math.sin(a * 5 + 1.3) +
      9 * Math.sin(a * 9 + 2.1);
    points.push(new THREE.Vector3(r * Math.cos(a), 0, r * Math.sin(a)));
  }
  return points;
}

function buildRibbon(samples, width, y, material, vScale) {
  const count = samples.length;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i < count; i++) {
    const s = samples[i];
    const half = width / 2;
    const a = s.p.clone().add(s.normal.clone().multiplyScalar(half));
    const b = s.p.clone().add(s.normal.clone().multiplyScalar(-half));
    positions.push(a.x, y, a.z);
    positions.push(b.x, y, b.z);
    const v = s.arc / vScale;
    uvs.push(0, v);
    uvs.push(1, v);
    if (i < count - 1) {
      const base = i * 2;
      indices.push(base, base + 2, base + 3, base, base + 3, base + 1);
    }
  }

  // Close the ribbon across the loop seam.
  const seamStart = (count - 1) * 2;
  indices.push(seamStart, 0, 1, seamStart, 1, seamStart + 1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return new THREE.Mesh(geo, material);
}

function buildWall(samples, side, material, glowMaterial) {
  const count = samples.length;
  const positions = [];
  const uvs = [];
  const indices = [];
  const half = ROAD_WIDTH / 2 + 0.4;

  for (let i = 0; i < count; i++) {
    const s = samples[i];
    const offset = s.normal.clone().multiplyScalar(side * half);
    const p = s.p.clone().add(offset);
    positions.push(p.x, ROAD_Y, p.z);
    positions.push(p.x, WALL_HEIGHT, p.z);
    const u = s.arc / 5.0;
    uvs.push(u, 0);
    uvs.push(u, 1);
    if (i < count - 1) {
      const base = i * 2;
      indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
    }
  }
  const base = (count - 1) * 2;
  indices.push(base, base + 1, 1, base, 1, 0);

  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  wallGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  wallGeo.setIndex(indices);
  wallGeo.computeVertexNormals();

  const wall = new THREE.Mesh(wallGeo, material);
  wall.material.side = THREE.DoubleSide;

  // Neon top rail: a narrow glowing ribbon derived from the same points.
  const railPositions = [];
  const railIndices = [];
  const railPts = [];
  for (let i = 0; i < count; i++) {
    const s = samples[i];
    const offset = s.normal.clone().multiplyScalar(side * half);
    const p = s.p.clone().add(offset);
    railPts.push(p);
  }
  for (let i = 0; i < count; i++) {
    const p = railPts[i];
    const tangent = samples[i].tangent;
    const thickness = 0.09;
    const a = p.clone().add(samples[i].normal.clone().multiplyScalar(thickness));
    const b = p.clone().add(samples[i].normal.clone().multiplyScalar(-thickness));
    railPositions.push(a.x, WALL_HEIGHT + 0.03, a.z);
    railPositions.push(b.x, WALL_HEIGHT + 0.03, b.z);
    if (i < count - 1) {
      const base = i * 2;
      railIndices.push(base, base + 2, base + 3, base, base + 3, base + 1);
    }
  }
  const baseRail = (count - 1) * 2;
  railIndices.push(baseRail, 0, 1, baseRail, 1, baseRail + 1);

  const railGeo = new THREE.BufferGeometry();
  railGeo.setAttribute('position', new THREE.Float32BufferAttribute(railPositions, 3));
  railGeo.setIndex(railIndices);
  railGeo.computeVertexNormals();
  const rail = new THREE.Mesh(railGeo, glowMaterial);
  return { wall, rail };
}

function buildLamps(samples) {
  const rng = mulberry32(2828);
  const spacing = 38;
  const lampPositions = [];
  const bulbPositions = [];
  let nextArc = spacing;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].arc >= nextArc && samples[i].arc < samples[i - 1].arc + spacing) {
      nextArc = samples[i].arc + spacing;
      const side = i % 2 === 0 ? 1 : -1;
      const offset = samples[i].normal.clone().multiplyScalar(side * (ROAD_WIDTH / 2 + 3.0));
      const p = samples[i].p.clone().add(offset);
      lampPositions.push(p);
      bulbPositions.push(p.clone().add(new THREE.Vector3(0, 3.2, 0)));
    }
  }

  const postGeo = new THREE.CylinderGeometry(0.12, 0.16, 3.0, 8);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x1b1e26, metalness: 0.7, roughness: 0.4 });
  const posts = new THREE.InstancedMesh(postGeo, postMat, lampPositions.length);
  const bulbGeo = new THREE.SphereGeometry(0.38, 12, 8);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0x38e8ff });
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, bulbPositions.length);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < lampPositions.length; i++) {
    dummy.position.copy(lampPositions[i]);
    dummy.updateMatrix();
    posts.setMatrixAt(i, dummy.matrix);
    dummy.position.copy(bulbPositions[i]);
    dummy.updateMatrix();
    bulbs.setMatrixAt(i, dummy.matrix);
  }
  posts.instanceMatrix.needsUpdate = true;
  bulbs.instanceMatrix.needsUpdate = true;

  // A couple of warm accent bulbs create alternating color rhythm.
  const amberMat = new THREE.MeshBasicMaterial({ color: 0xffc23d });
  for (let i = 0; i < bulbs.count; i += 3) {
    bulbs.setColorAt(i, new THREE.Color(0xffc23d));
  }
  bulbs.instanceColor.needsUpdate = true;

  // Sprite halos for the bulb glow. These barely cost anything.
  const haloTex = glowTexture(0x38e8ff);
  const haloMat = new THREE.SpriteMaterial({
    map: haloTex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.55,
  });
  const halos = [];
  for (const p of bulbPositions) {
    const sprite = new THREE.Sprite(haloMat.clone());
    sprite.position.copy(p);
    sprite.scale.set(2.0, 2.0, 2.0);
    sprite.material.color = new THREE.Color(0x38e8ff);
    halos.push(sprite);
  }

  return { posts, bulbs, halos };
}

function buildTrees(samples) {
  const rng = mulberry32(9311);
  const trunks = [];
  const crowns = [];
  for (let i = 0; i < samples.length; i++) {
    if (i % 5 !== 0) continue;
    const side = i % 2 === 0 ? 1 : -1;
    const outward = ROAD_WIDTH / 2 + 8 + rng() * 30;
    const offset = samples[i].normal.clone().multiplyScalar(side * outward);
    const p = samples[i].p.clone().add(offset);
    trunks.push(p);
    crowns.push(p.clone().add(new THREE.Vector3(0, 3.2 + rng() * 1.5, 0)));
  }

  const trunkGeo = new THREE.CylinderGeometry(0.32, 0.48, 2.8, 8);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x17130f, roughness: 0.9, metalness: 0.1 });
  const crownGeo = new THREE.ConeGeometry(1.9, 4.2, 6);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x1d4a33, roughness: 0.9, metalness: 0.1, flatShading: true });
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, trunks.length);
  const crownMesh = new THREE.InstancedMesh(crownGeo, crownMat, crowns.length);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < trunks.length; i++) {
    dummy.position.copy(trunks[i]);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.copy(crowns[i]);
    dummy.updateMatrix();
    crownMesh.setMatrixAt(i, dummy.matrix);
  }
  trunkMesh.instanceMatrix.needsUpdate = true;
  crownMesh.instanceMatrix.needsUpdate = true;

  return { trunkMesh, crownMesh };
}

function buildMountains(scene) {
  const rng = mulberry32(117);
  const mat = new THREE.MeshBasicMaterial({ color: 0x644f93 });
  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * Math.PI * 2 + (rng() - 0.5) * 0.2;
    const radius = 640 + rng() * 170;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const height = 28 + rng() * 54;
    const base = 24 + rng() * 18;
    const geo = new THREE.ConeGeometry(base, height, 8);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, height / 2 - 5, z);
    mesh.rotation.y = rng() * Math.PI;
    scene.add(mesh);
  }
}

function buildBillboards(samples) {
  const rng = mulberry32(409);
  const specs = [
    ['NEON RUSH', 'CITY CIRCUIT 01', 0x38e8ff],
    ['LAP THE DRIVE', 'MAX VELOCITY', 0xff4f5e],
    ['CHROME MOTOR', 'PROCEDURAL CHASSIS', 0xffc23d],
    ['THE LAST TURN', 'READY TO RACE', 0x9cffd9],
    ['BEYOND THE RUSH', 'NEON PERMISSION', 0x38e8ff],
  ];
  const textures = specs.map((s) => billboardTexture(s[0], s[1], s[2]));
  const boardMatBase = new THREE.MeshBasicMaterial({ map: textures[0], side: THREE.DoubleSide });
  const boards = [];
  const indexStep = 40;

  for (let i = 0; i < specs.length; i++) {
    const sample = samples[indexStep * (i + 1) + Math.floor(rng() * 16)];
    if (!sample) continue;
    const side = i % 2 === 0 ? 1 : -1;
    const offset = sample.normal.clone().multiplyScalar(side * (ROAD_WIDTH / 2 + 16));
    const pos = sample.p.clone().add(offset);
    const boardMat = new THREE.MeshBasicMaterial({
      map: textures[i],
      side: THREE.DoubleSide,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(11, 5.5), boardMat);
    plane.position.set(pos.x, 7.5, pos.z);
    plane.lookAt(sample.p.x, 7.5, sample.p.z);
    boards.push(plane);
  }
  return boards;
}

function buildStartGate(samples) {
  const s = samples[10];
  const half = ROAD_WIDTH / 2;
  const postL = s.p.clone().add(s.normal.clone().multiplyScalar(half + 0.8));
  const postR = s.p.clone().add(s.normal.clone().multiplyScalar(-half - 0.8));
  const postMat = new THREE.MeshStandardMaterial({ color: 0x121923, metalness: 0.7, roughness: 0.3 });
  const postGeo = new THREE.BoxGeometry(0.7, 9.0, 0.7);
  const l = new THREE.Mesh(postGeo, postMat);
  l.position.set(postL.x, 4.5, postL.z);
  const r = new THREE.Mesh(postGeo, postMat);
  r.position.set(postR.x, 4.5, postR.z);

  const across = Math.atan2(s.normal.x, s.normal.z);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, half * 2 + 1.6), postMat);
  bar.position.set(s.p.x, 9.2, s.p.z);
  bar.rotation.y = across;
  const neon = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.18, half * 2 + 1.6),
    new THREE.MeshBasicMaterial({ color: 0x38e8ff })
  );
  neon.position.set(s.p.x, 9.6, s.p.z);
  neon.rotation.y = across;
  const signTex = billboardTexture('START GATE', 'ENTER THE RUSH', 0x38e8ff);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 2.5),
    new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide })
  );
  const facing = Math.atan2(s.tangent.x, s.tangent.z) + Math.PI;
  sign.position.set(s.p.x, 8.1, s.p.z);
  sign.rotation.y = facing;
  return [l, r, bar, neon, sign];
}

export function createTrack(scene) {
  const curve = new THREE.CatmullRomCurve3(createCurvePoints(), true, 'catmullrom', 0.5);
  const N = 520;
  const samples = [];
  let arc = 0;
  let previous = null;
  for (let i = 0; i < N; i++) {
    const u = i / N;
    const p = curve.getPointAt(u);
    const tangent = curve.getTangentAt(u).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    if (previous) {
      arc += p.distanceTo(previous);
    }
    previous = p.clone();
    samples.push({ p, tangent, normal, arc, u });
  }
  // Include the closing arc across the loop seam in the racing metric.
  const trackLength = arc + samples[N - 1].p.distanceTo(samples[0].p);

  // Grass base terrain.
  const grassTex = grassTexture();
  grassTex.repeat.set(28, 28);
  const grassMat = new THREE.MeshStandardMaterial({
    map: grassTex,
    roughness: 1.0,
    metalness: 0.0,
  });
  const terrain = new THREE.Mesh(new THREE.PlaneGeometry(1300, 1300), grassMat);
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = -0.1;
  scene.add(terrain);

  // Shoulder strips near the road.
  const shoulderTex = brushedGroundTexture();
  shoulderTex.repeat.set(2, 2);
  const shoulderMat = new THREE.MeshStandardMaterial({
    map: shoulderTex,
    roughness: 0.9,
    metalness: 0.0,
  });

  // Road ribbon.
  const asphalt = asphaltTexture();
  const roadMat = new THREE.MeshStandardMaterial({
    map: asphalt,
    roughness: 0.74,
    metalness: 0.18,
    color: 0xffffff,
  });
  const road = buildRibbon(samples, ROAD_WIDTH, ROAD_Y, roadMat, 16.0);
  road.material.side = THREE.DoubleSide;
  scene.add(road);

  // A luminous lane boundary ribbon makes the road pop at dusk.
  const edgeGlowMat = new THREE.MeshBasicMaterial({
    color: 0x9cffd9,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });

  const wallMat = new THREE.MeshStandardMaterial({
    map: concreteTexture(),
    roughness: 0.8,
    metalness: 0.1,
  });
  wallMat.side = THREE.DoubleSide;

  const wallLeft = buildWall(samples, 1, wallMat, new THREE.MeshBasicMaterial({ color: 0x38e8ff }));
  const wallRight = buildWall(samples, -1, wallMat, new THREE.MeshBasicMaterial({ color: 0xff4f5e }));
  scene.add(wallLeft.wall, wallLeft.rail, wallRight.wall, wallRight.rail);

  const lampParts = buildLamps(samples);
  scene.add(lampParts.posts, lampParts.bulbs);
  for (const halo of lampParts.halos) scene.add(halo);

  const treeParts = buildTrees(samples);
  scene.add(treeParts.trunkMesh, treeParts.crownMesh);
  buildMountains(scene);

  const boards = buildBillboards(samples);
  for (const b of boards) scene.add(b);

  // Some light pillars behind billboards, purely emissive, no extra lighting cost.
  for (const b of boards) {
    const pillarGeo = new THREE.CylinderGeometry(0.20, 0.3, 4.0, 6);
    const pillarMat = new THREE.MeshBasicMaterial({ color: 0x38e8ff });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.copy(b.position);
    pillar.position.y = 3.0;
    scene.add(pillar);
  }

  const gate = buildStartGate(samples);
  for (const mesh of gate) scene.add(mesh);

  // The generated dusk sky is used directly as the scene backdrop. This
  // keeps a clean full-screen gradient without a tessellated dome silhouette.
  scene.background = skyTexture();

  // Sun halo sprite placed at the horizon.
  const sunTex = glowTexture(0xffc23d);
  const sunMat = new THREE.SpriteMaterial({
    map: sunTex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.8,
  });
  const sun = new THREE.Sprite(sunMat);
  sun.position.set(280, 120, -460);
  sun.scale.set(110, 110, 110);
  scene.add(sun);

  scene.fog = new THREE.FogExp2(0x33244c, 0.000004);

  const ambient = new THREE.HemisphereLight(0xa9c0f0, 0xff7f95, 0.62);
  scene.add(ambient);
  const sunLight = new THREE.DirectionalLight(0xffe2c4, 1.7);
  sunLight.position.set(-280, 180, -160);
  scene.add(sunLight);
  const fillLight = new THREE.DirectionalLight(0x8db3d9, 0.32);
  fillLight.position.set(180, 80, 220);
  scene.add(fillLight);

  function nearest(position) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < N; i++) {
      const p = samples[i].p;
      const dx = position.x - p.x;
      const dz = position.z - p.z;
      const d = dx * dx + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return samples[best];
  }

  function transformAt(u) {
    const p = curve.getPointAt(u);
    const tangent = curve.getTangentAt(u).normalize();
    return {
      position: p,
      tangent,
      heading: Math.atan2(tangent.x, tangent.z),
    };
  }

  function progress(index) {
    return index / N;
  }

  return {
    curve,
    samples,
    N,
    trackLength,
    roadWidth: ROAD_WIDTH,
    roadY: ROAD_Y,
    nearest,
    transformAt,
    progress,
    road,
  };
}
