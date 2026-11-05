import * as THREE from 'three';
import {
  carTexture,
  brushedMetalTexture,
  glowTexture,
  contactShadowTexture,
} from './textures.js';

function numeric(colorHex) {
  return Number(colorHex);
}

/*
 * Low-poly racing car assembled from a custom tapered hull, cockpit,
 * glowing ventral light, accent stripes and metal wheels.
 */
export function createCar({ color = 0x242e47, accent = 0x38e8ff, player = false }) {
  const group = new THREE.Group();
  group.name = player ? 'player-car' : 'opponent-car';

  const accentHex = numeric(accent);
  const bodyTexture = carTexture(numeric(color), accentHex);

  const bodyMat = new THREE.MeshStandardMaterial({
    map: bodyTexture,
    roughness: 0.36,
    metalness: 0.28,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.75,
    roughness: 0.28,
    metalness: 0.4,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x101217,
    roughness: 0.42,
    metalness: 0.62,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x081324,
    roughness: 0.12,
    metalness: 0.8,
    transparent: true,
    opacity: 0.77,
    clearcoat: 1.0,
  });
  const metalTexture = brushedMetalTexture();
  const wheelMat = new THREE.MeshStandardMaterial({
    map: metalTexture,
    color: 0x171a1e,
    roughness: 0.5,
    metalness: 0.8,
  });

  // Tapered torso hull. Each section has two top/bottom pairs of vertices.
  const sections = [
    { z: 2.35, hw: 0.72, yb: 0.30, yt: 0.88 },
    { z: 1.20, hw: 1.02, yb: 0.22, yt: 1.05 },
    { z: 0.0, hw: 1.20, yb: 0.20, yt: 1.10 },
    { z: -1.30, hw: 1.14, yb: 0.20, yt: 1.04 },
    { z: -2.15, hw: 0.92, yb: 0.25, yt: 0.94 },
  ];

  const verts = [];
  const uvs = [];
  for (const s of sections) {
    // left-bottom, right-bottom, left-top, right-top
    verts.push(-s.hw, s.yb, s.z);
    verts.push(s.hw, s.yb, s.z);
    verts.push(-s.hw, s.yt, s.z);
    verts.push(s.hw, s.yt, s.z);
    const zv = (s.z + 2.35) / 4.5;
    uvs.push(zv, 0.0);
    uvs.push(zv, 0.0);
    uvs.push(zv, 1.0);
    uvs.push(zv, 1.0);
  }

  const indices = [];
  for (let i = 0; i < sections.length - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    // left side
    indices.push(a, a + 2, b + 2, a, b + 2, b);
    // right side
    indices.push(a + 1, b + 1, b + 3, a + 1, b + 3, a + 3);
    // bottom
    indices.push(a, b, b + 1, a, b + 1, a + 1);
    // top deck
    indices.push(a + 2, a + 3, b + 3, a + 2, b + 3, b + 2);
  }
  // front and rear caps
  indices.push(0, 1, 3, 0, 3, 2);
  const last = (sections.length - 1) * 4;
  indices.push(last, last + 1, last + 3, last, last + 3, last + 2);

  const hullGeo = new THREE.BufferGeometry();
  hullGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  hullGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  hullGeo.setIndex(indices);
  hullGeo.computeVertexNormals();

  const hull = new THREE.Mesh(hullGeo, bodyMat);
  hull.castShadow = false;
  group.add(hull);

  // Cockpit canopy and roof trim.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.62, 1.75), glassMat);
  cabin.position.set(0, 1.55, -0.12);
  cabin.rotation.x = -0.02;
  group.add(cabin);

  const roofBand = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 1.85), accentMat);
  roofBand.position.set(0, 1.89, -0.08);
  group.add(roofBand);

  const roofTrim = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.10, 1.95), trimMat);
  roofTrim.position.set(0, 1.83, -0.08);
  group.add(roofTrim);

  // Fore peak detail to make the silhouette feel aerodynamic.
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.22, 0.85), trimMat);
  nose.position.set(0, 1.18, 1.84);
  nose.rotation.x = 0.07;
  group.add(nose);

  // Racing stripes on both shoulders.
  const stripeGeo = new THREE.BoxGeometry(0.32, 0.1, 4.25);
  const stripeL = new THREE.Mesh(stripeGeo, accentMat);
  stripeL.position.set(-1.06, 0.98, -0.02);
  const stripeR = new THREE.Mesh(stripeGeo, accentMat);
  stripeR.position.set(1.06, 0.98, -0.02);
  group.add(stripeL, stripeR);

  // Side vents and rear exhaust.
  const ventGeo = new THREE.BoxGeometry(0.4, 0.16, 0.9);
  const ventL = new THREE.Mesh(ventGeo, trimMat);
  ventL.position.set(-1.0, 0.67, -1.0);
  const ventR = new THREE.Mesh(ventGeo, trimMat);
  ventR.position.set(1.0, 0.67, -1.0);
  group.add(ventL, ventR);

  const exhaust = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.22, 0.5), accentMat);
  exhaust.position.set(0, 0.58, -2.14);
  group.add(exhaust);

  // Wheels. Cylinders run along the X axis after the Z rotation.
  const wheelGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.38, 24);
  const rimGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.10, 24);
  const rimMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.85,
    roughness: 0.2,
    metalness: 0.5,
  });

  const wheels = [];
  const wheelPositions = [
    [-1.0, 0.30, 1.35],
    [-1.0, 0.30, -1.35],
    [1.0, 0.30, 1.35],
    [1.0, 0.30, -1.35],
  ];
  for (const p of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(p[0], p[1], p[2]);
    wheel.rotation.z = Math.PI / 2;
    group.add(wheel);
    wheels.push(wheel);

    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.set(p[0], p[1], p[2]);
    rim.rotation.z = Math.PI / 2;
    group.add(rim);
  }

  // Emission booms at the rear corners for a chase-camera glow.
  const boomMat = new THREE.MeshBasicMaterial({
    color: accentHex,
  });
  const boomGeo = new THREE.BoxGeometry(0.22, 0.07, 0.06);
  const boomL = new THREE.Mesh(boomGeo, boomMat);
  boomL.position.set(-0.78, 0.84, -2.16);
  const boomR = new THREE.Mesh(boomGeo, boomMat);
  boomR.position.set(0.78, 0.84, -2.16);
  group.add(boomL, boomR);

  // Ground contact shadow.
  const shadowTex = contactShadowTexture();
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.6,
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 6.2), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, 0.035, 0);
  group.add(shadow);

  // Ventral neon strip: part of the car's identity, not just a texture decal.
  const neon = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 6.2),
    new THREE.MeshBasicMaterial({
      map: glowTexture(accentHex),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: player ? 0.35 : 0.24,
    })
  );
  neon.rotation.x = -Math.PI / 2;
  neon.position.set(0, 0.055, 0);
  group.add(neon);

  // Small identity light, helpful when the chase camera is pulled back.
  if (player) {
    const light = new THREE.PointLight(accentHex, 0.8, 16, 2);
    light.position.set(0, 1.0, -1.8);
    group.add(light);
  }

  return {
    group,
    wheels,
    accentHex,
    materials: { bodyMat, accentMat, trimMat, glassMat },
  };
}
