import * as THREE from 'three';
import { brushedMetalTexture, glowTexture } from './textures.js';

const paintTex = brushedMetalTexture();
const glowTex = glowTexture();

function makeWheel(isFront) {
  const pivot = new THREE.Group();

  const tireGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.34, 18);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x0b0c10, roughness: 0.92, metalness: 0.02 });
  const tire = new THREE.Mesh(tireGeo, tireMat);

  const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.36, 10);
  rimGeo.rotateZ(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x8c96a8, roughness: 0.25, metalness: 0.95,
    emissive: 0x101826, emissiveIntensity: 0.6,
  });
  const rim = new THREE.Mesh(rimGeo, rimMat);

  const spin = new THREE.Group();
  spin.add(tire, rim);
  pivot.add(spin);
  return { pivot, spin, isFront };
}

export function createCar({ color = 0xff6a1a, accent = 0x42f5ff, detailed = false }) {
  const root = new THREE.Group();
  const wheels = [];

  const paint = new THREE.MeshPhysicalMaterial({
    map: paintTex,
    color,
    metalness: detailed ? 0.45 : 0.2,
    roughness: detailed ? 0.42 : 0.72,
    clearcoat: detailed ? 0.6 : 0.15,
    clearcoatRoughness: 0.2,
    emissive: color,
    emissiveIntensity: detailed ? 0.13 : 0.08,
  });
  const darkTrim = new THREE.MeshStandardMaterial({ color: 0x0c0e16, roughness: 0.6, metalness: 0.5 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0e1a2a, metalness: 0.2, roughness: 0.12,
    clearcoat: 1, transparent: true, opacity: 0.85,
  });

  // lower body
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.35), paint);
  body.position.y = 0.55;
  root.add(body);

  // nose / rear wedges for a slightly sculpted silhouette
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.3, 1.1), paint);
  nose.position.set(0, 0.86, 1.55);
  nose.rotation.x = -0.12;
  root.add(nose);

  const rearDeck = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.28, 0.95), paint);
  rearDeck.position.set(0, 0.86, -1.55);
  root.add(rearDeck);

  // glass cabin band
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.38, 1.9), glass);
  cabin.position.set(0, 1.0, -0.18);
  root.add(cabin);

  // roof
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 1.85), paint);
  roof.position.set(0, 1.23, -0.18);
  root.add(roof);

  // front splitter and rear diffuser
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.1, 0.32), darkTrim);
  splitter.position.set(0, 0.28, 2.2);
  root.add(splitter);
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.12, 0.3), darkTrim);
  diffuser.position.set(0, 0.27, -2.2);
  root.add(diffuser);

  // spoiler
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.08, 0.5), paint);
  spoiler.position.set(0, 1.24, -1.75);
  root.add(spoiler);
  for (const sx of [-0.7, 0.7]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.34, 0.16), darkTrim);
    strut.position.set(sx, 1.05, -1.75);
    root.add(strut);
  }

  // side skirts
  for (const sx of [-0.99, 0.99]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 2.9), darkTrim);
    skirt.position.set(sx, 0.36, 0);
    root.add(skirt);
  }

  // wheels
  for (const [sx, sz, front] of [[-0.92, 1.35, true], [0.92, 1.35, true], [-0.92, -1.35, false], [0.92, -1.35, false]]) {
    const w = makeWheel(front);
    w.pivot.position.set(sx, 0.39, sz);
    root.add(w.pivot);
    wheels.push(w);
  }

  // headlights
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff1c8, toneMapped: false });
  for (const sx of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.1), headMat);
    lamp.position.set(sx, 0.74, 2.15);
    root.add(lamp);
  }

  // brake lights
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0xd0140a, toneMapped: false });
  for (const sx of [-0.62, 0.62]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.09), brakeMat);
    lamp.position.set(sx, 0.72, -2.18);
    root.add(lamp);
  }
  const brakeStrip = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.08), brakeMat);
  brakeStrip.position.set(0, 0.89, -2.16);
  root.add(brakeStrip);

  // rear light halo so opponents are readable in the distance
  for (const sx of [-0.62, 0.62]) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xff2b1c, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    sprite.position.set(sx, 0.72, -2.28);
    sprite.scale.set(1.25, 1.25, 1);
    root.add(sprite);
  }

  // underglow
  const underGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: accent, transparent: true, opacity: 0.72,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  underGlow.position.set(0, 0.18, 0);
  underGlow.scale.set(5.2, 2.2, 1);
  root.add(underGlow);

  // contact shadow
  const shadowGeo = new THREE.PlaneGeometry(5, 5);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({
    map: glowTex, color: 0x000000, transparent: true, opacity: 0.5,
    depthWrite: false, blending: THREE.NormalBlending,
  }));
  shadow.position.y = 0.06;
  root.add(shadow);

  if (detailed) {
    // fake volumetric headlight pools painted additively onto the road.
    // These light the road without blowing out nearby opponent cars.
    const beamGeo = new THREE.PlaneGeometry(9, 34);
    beamGeo.rotateX(-Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({
      map: glowTex, color: 0xffe6c0, transparent: true, opacity: 0.28,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    for (const sx of [-0.55, 0.55]) {
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(sx, 0.075, 17);
      root.add(beam);
    }
  }

  return { root, wheels, brakeMat, underGlow, shadow };
}

export function setBrakeLights(car, on, strength = 1) {
  const color = on ? 0xff2d22 : 0x4a0a08;
  car.brakeMat.color.setHex(color);
  car.brakeMat.color.multiplyScalar(on ? 0.9 + strength * 0.6 : 1);
}
