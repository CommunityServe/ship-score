import * as THREE from 'three';
import {
  asphaltTexture, curbTexture, facadeTexture, glowTexture, billboardTexture,
  bannerTexture, checkerTexture, groundTexture,
} from './textures.js';

const ROAD_WIDTH = 18;
const HALF_WIDTH = ROAD_WIDTH / 2;
const RAIL_DIST = HALF_WIDTH + 2.4;
const TILE_LEN = 10;

function ribbonGeometry(samples, buildOffsets, tileLen, y) {
  const N = samples.length;
  const positions = [];
  const uvs = [];
  const indices = [];
  let travelled = 0;

  for (let i = 0; i <= N; i++) {
    const s = samples[i % N];
    if (i > 0) {
      const prev = samples[(i - 1) % N];
      travelled += prev.p.distanceTo(s.p);
    }
    const a = buildOffsets[0];
    const b = buildOffsets[1];
    const pa = s.p.clone().addScaledVector(s.r, a);
    const pb = s.p.clone().addScaledVector(s.r, b);
    pa.y = y; pb.y = y;
    positions.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
    uvs.push(0, travelled / tileLen, 1, travelled / tileLen);

    if (i < N) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function wallGeometry(samples, offset, height, yBase = 0, width = 0) {
  const N = samples.length;
  const positions = [];
  const uvs = [];
  const indices = [];
  let travelled = 0;
  const offA = offset - width / 2;
  const offB = offset + width / 2;

  for (let i = 0; i <= N; i++) {
    const s = samples[i % N];
    if (i > 0) travelled += samples[(i - 1) % N].p.distanceTo(s.p);
    for (const off of [offA, offB]) {
      const p = s.p.clone().addScaledVector(s.r, off);
      positions.push(p.x, yBase, p.z);
      positions.push(p.x, yBase + height, p.z);
      uvs.push(travelled / 6, 0, travelled / 6, 1);
    }
    if (i < N) {
      const base = i * 4;
      indices.push(base, base + 2, base + 1);
      indices.push(base + 1, base + 2, base + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function seededRand(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Track {
  constructor(scene) {
    this.scene = scene;
    this.width = ROAD_WIDTH;
    this.halfWidth = HALF_WIDTH;
    this.railDist = RAIL_DIST;
    this.length = 0;

    // Procedural closed city circuit: a wavy ring with long sweepers.
    const CONTROL = 14;
    const pts = [];
    for (let i = 0; i < CONTROL; i++) {
      const a = (i / CONTROL) * Math.PI * 2;
      const r = 250 + 58 * Math.sin(3 * a + 0.4) + 34 * Math.cos(2 * a - 0.7);
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    this.length = this.curve.getLength();

    const N = Math.max(1200, Math.round(this.length / 0.8));
    this.N = N;
    this.singleSampleEvery = this.length / N;
    const samples = [];
    for (let i = 0; i < N; i++) {
      const u = i / N;
      const p = this.curve.getPointAt(u);
      const t = this.curve.getTangentAt(u).normalize();
      const r = new THREE.Vector3(-t.z, 0, t.x); // right-hand side of travel
      samples.push({ p, t, r, s: u * this.length, curvature: 0 });
    }
    // curvature estimate (radians per metre)
    for (let i = 0; i < N; i++) {
      const a = samples[i].t;
      const b = samples[(i + 1) % N].t;
      const dot = Math.max(-1, Math.min(1, a.dot(b)));
      const angle = Math.acos(dot);
      samples[i].curvature = angle / this.singleSampleEvery;
    }
    this.samples = samples;

    const start = samples[0];
    this.startPoint = start.p.clone();
    this.startHeading = Math.atan2(start.t.x, start.t.z);

    this.buildRoad(scene);
    this.buildScenery(scene);
    this.buildStartGate(scene);
    this.buildBillboards(scene);
    this.buildBuildings(scene);
  }

  buildRoad(scene) {
    const asphalt = asphaltTexture();
    const roadGeo = ribbonGeometry(this.samples, [-HALF_WIDTH, HALF_WIDTH], TILE_LEN, 0.03);
    const roadMesh = new THREE.Mesh(roadGeo, new THREE.MeshStandardMaterial({
      map: asphalt,
      color: 0xf2f2f2,
      roughness: 0.82,
      metalness: 0.06,
    }));
    roadMesh.receiveShadow = false;
    scene.add(roadMesh);

    const curbTex = curbTexture();
    const curbMat = new THREE.MeshStandardMaterial({
      map: curbTex, roughness: 0.6, metalness: 0.05,
    });
    const leftCurb = ribbonGeometry(this.samples, [-HALF_WIDTH - 0.9, -HALF_WIDTH], 2.2, 0.09);
    const rightCurb = ribbonGeometry(this.samples, [HALF_WIDTH, HALF_WIDTH + 0.9], 2.2, 0.09);
    scene.add(new THREE.Mesh(leftCurb, curbMat));
    scene.add(new THREE.Mesh(rightCurb, curbMat));

    // low concrete walls with emissive neon strips on the inside
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x141824, roughness: 0.9, metalness: 0.1, side: THREE.DoubleSide,
    });
    scene.add(new THREE.Mesh(wallGeometry(this.samples, -RAIL_DIST, 1.15, 0, 0.55), wallMat));
    scene.add(new THREE.Mesh(wallGeometry(this.samples, RAIL_DIST, 1.15, 0, 0.55), wallMat));

    const stripMatLeft = new THREE.MeshBasicMaterial({
      color: 0x189fb0, toneMapped: false, side: THREE.DoubleSide,
    });
    const stripMatRight = new THREE.MeshBasicMaterial({
      color: 0xb01a86, toneMapped: false, side: THREE.DoubleSide,
    });
    scene.add(new THREE.Mesh(wallGeometry(this.samples, -RAIL_DIST + 0.02, 0.16, 0.72, 0.06), stripMatLeft));
    scene.add(new THREE.Mesh(wallGeometry(this.samples, RAIL_DIST - 0.02, 0.16, 0.72, 0.06), stripMatRight));

    // start / finish line strip
    const lineGeo = new THREE.PlaneGeometry(ROAD_WIDTH, 3.2);
    lineGeo.rotateX(-Math.PI / 2);
    const check = new THREE.Mesh(lineGeo, new THREE.MeshStandardMaterial({
      map: checkerTexture(), roughness: 0.7, metalness: 0.02,
    }));
    check.position.copy(this.startPoint).add(new THREE.Vector3(0, 0.07, 0));
    check.rotation.y = this.startHeading;
    scene.add(check);

    // ground plane far beneath everything
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000),
      new THREE.MeshStandardMaterial({ map: groundTexture(), color: 0x3a4a55, roughness: 1, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    scene.add(ground);

    // subtle shoulder asphalt between curb and wall
    const shoulderGeo = ribbonGeometry(this.samples, [-RAIL_DIST, -HALF_WIDTH - 0.9], 8, 0.02);
    const shoulderGeo2 = ribbonGeometry(this.samples, [HALF_WIDTH + 0.9, RAIL_DIST], 8, 0.02);
    const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x151820, roughness: 0.95 });
    scene.add(new THREE.Mesh(shoulderGeo, shoulderMat));
    scene.add(new THREE.Mesh(shoulderGeo2, shoulderMat));
  }

  buildScenery(scene) {
    const glow = glowTexture();
    const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.6, metalness: 0.7 });
    const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe7b0, toneMapped: false });
    const poolMat = new THREE.MeshBasicMaterial({
      map: glow, color: 0xffb347, transparent: true, opacity: 0.28,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });

    const poleGeo = new THREE.CylinderGeometry(0.13, 0.17, 8.2, 8);
    const headGeo = new THREE.BoxGeometry(1.1, 0.28, 1.8);
    const poolGeo = new THREE.PlaneGeometry(13, 13);
    poolGeo.rotateX(-Math.PI / 2);

    const lampSpacing = 34;
    const count = Math.floor(this.length / lampSpacing);
    this.lampPositions = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor((i / count) * this.N) % this.N;
      const s = this.samples[idx];
      const side = i % 2 === 0 ? 1 : -1;
      const off = side * (RAIL_DIST + 1.1);
      const base = s.p.clone().addScaledVector(s.r, off);
      base.y = 0;

      const pole = new THREE.Mesh(poleGeo, lampPoleMat);
      pole.position.copy(base).add(new THREE.Vector3(0, 4.1, 0));
      scene.add(pole);

      const head = new THREE.Mesh(headGeo, lampHeadMat);
      head.position.copy(base).add(new THREE.Vector3(0, 8.3, 0));
      head.rotation.y = Math.atan2(s.t.x, s.t.z);
      scene.add(head);

      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glow, color: 0xffd28a, transparent: true, opacity: 0.62,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }));
      sprite.position.copy(base).add(new THREE.Vector3(0, 8.35, 0));
      sprite.scale.set(5.4, 5.4, 1);
      scene.add(sprite);

      const pool = new THREE.Mesh(poolGeo, poolMat);
      pool.position.copy(base).add(new THREE.Vector3(-side * s.r.x * 4, 0.07, -side * s.r.z * 4));
      scene.add(pool);
      this.lampPositions.push(base);
    }

    // neon pylons / skittles along the barriers for depth
    const pylonMat = new THREE.MeshBasicMaterial({ color: 0x42f5ff, toneMapped: false });
    const pylonGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.55, 6);
    for (let i = 0; i < count; i += 2) {
      const idx = Math.floor((i / count) * this.N) % this.N;
      const s = this.samples[idx];
      const side = i % 4 === 0 ? -1 : 1;
      const p = s.p.clone().addScaledVector(s.r, side * (RAIL_DIST + 0.45));
      const m = new THREE.Mesh(pylonGeo, pylonMat);
      m.position.copy(p).add(new THREE.Vector3(0, 0.35, 0));
      scene.add(m);
    }
  }

  buildStartGate(scene) {
    const s = this.samples[0];
    const heading = this.startHeading;
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x141a26, roughness: 0.7, metalness: 0.3 });
    const pillarGeo = new THREE.BoxGeometry(0.9, 9.5, 0.9);
    for (const side of [-1, 1]) {
      const p = this.startPoint.clone().addScaledVector(s.r, side * (RAIL_DIST + 1.0));
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.copy(p).add(new THREE.Vector3(0, 4.75, 0));
      pillar.rotation.y = heading;
      scene.add(pillar);
    }
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_WIDTH + 6, 2.6),
      new THREE.MeshBasicMaterial({ map: bannerTexture(), toneMapped: false, side: THREE.DoubleSide }),
    );
    banner.position.copy(this.startPoint).add(new THREE.Vector3(0, 8.7, 0));
    banner.rotation.y = heading + Math.PI; // face cars approaching the finish line
    scene.add(banner);

    // start lights on top of the gate
    const lightGeo = new THREE.SphereGeometry(0.22, 10, 10);
    const red = new THREE.MeshBasicMaterial({ color: 0xff3525, toneMapped: false });
    for (let i = -2; i <= 2; i++) {
      const light = new THREE.Mesh(lightGeo, red);
      light.position.copy(this.startPoint)
        .addScaledVector(s.r, i * 0.9)
        .add(new THREE.Vector3(0, 10.25, 0));
      scene.add(light);
    }
  }

  buildBillboards(scene) {
    const rand = seededRand(881);
    const accents = ['#42f5ff', '#ff2bd6', '#ffb347', '#7cff6b'];
    const labels = ['NIGHTSHIFT', 'NEON RUN', 'SECTOR 9', 'TURBO', 'MIDNIGHT', 'V8 CITY'];
    const anchor = [0.08, 0.21, 0.34, 0.47, 0.60, 0.73, 0.86];
    anchor.forEach((u, i) => {
      const idx = Math.floor(u * this.N) % this.N;
      const s = this.samples[idx];
      const side = i % 2 === 0 ? 1 : -1;
      const pos = s.p.clone().addScaledVector(s.r, side * (RAIL_DIST + 8 + rand() * 5));
      pos.y = 5.5 + rand() * 3;

      const tex = billboardTexture(labels[i % labels.length], accents[i % accents.length]);
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(13, 4.3),
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide }),
      );
      const towardCenter = s.r.clone().multiplyScalar(-side);
      board.position.copy(pos);
      board.rotation.y = Math.atan2(towardCenter.x, towardCenter.z);
      scene.add(board);

      const poleMat = new THREE.MeshStandardMaterial({ color: 0x202632, roughness: 0.8 });
      for (const dx of [-4.5, 4.5]) {
        const pole = new THREE.Mesh(new THREE.BoxGeometry(0.25, pos.y + 0.4, 0.25), poleMat);
        pole.position.copy(pos).add(new THREE.Vector3(dx * towardCenter.x, -(pos.y + 0.4) / 2 + 0.2, dx * towardCenter.z));
        scene.add(pole);
      }
    });
  }

  buildBuildings(scene) {
    const facadeTextures = [facadeTexture(11), facadeTexture(29), facadeTexture(73)];
    const wallMats = facadeTextures.map((tex) => new THREE.MeshStandardMaterial({
      color: 0x070910,
      map: tex,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 1.05,
      roughness: 0.9,
      metalness: 0.15,
    }));
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x0a0d16, roughness: 0.95 });
    const neonMats = [
      new THREE.MeshBasicMaterial({ color: 0x42f5ff, toneMapped: false }),
      new THREE.MeshBasicMaterial({ color: 0xff2bd6, toneMapped: false }),
      new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false }),
    ];
    const rand = seededRand(5566);
    const tile = 24;

    const wallGeoCache = new Map();
    function wallGeo(w, h) {
      const key = `${w.toFixed(1)}x${h.toFixed(1)}`;
      if (wallGeoCache.has(key)) return wallGeoCache.get(key);
      const geo = new THREE.PlaneGeometry(w, h);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, uv.getX(i) * (w / tile), uv.getY(i) * (h / tile));
      }
      wallGeoCache.set(key, geo);
      return geo;
    }

    const minDistToTrack = (x, z) => {
      let best = Infinity;
      for (let i = 0; i < this.N; i += 3) {
        const p = this.samples[i].p;
        const dx = p.x - x, dz = p.z - z;
        const d = dx * dx + dz * dz;
        if (d < best) best = d;
      }
      return Math.sqrt(best);
    };

    const buildings = [];
    const specs = [];
    // inner skyline
    for (let i = 0; i < 12; i++) {
      const a = rand() * Math.PI * 2;
      const r = 30 + rand() * 85;
      specs.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    // outer skyline ring
    for (let i = 0; i < 34; i++) {
      const a = rand() * Math.PI * 2;
      const r = 390 + rand() * 330;
      specs.push([Math.cos(a) * r, Math.sin(a) * r]);
    }

    for (const [x, z] of specs) {
      if (minDistToTrack(x, z) < RAIL_DIST + 15) continue;
      const w = 10 + rand() * 26;
      const d = 10 + rand() * 26;
      const h = 26 + rand() * 135;
      buildings.push({ x, z, w, d, h, rot: rand() * Math.PI, mat: wallMats[Math.floor(rand() * wallMats.length)] });
    }

    this.buildingMeshes = [];
    for (const b of buildings) {
      const group = new THREE.Group();
      group.position.set(b.x, 0, b.z);
      group.rotation.y = b.rot;

      const front = new THREE.Mesh(wallGeo(b.w, b.h), b.mat);
      front.position.set(0, b.h / 2, b.d / 2);
      group.add(front);
      const back = new THREE.Mesh(wallGeo(b.w, b.h), b.mat);
      back.position.set(0, b.h / 2, -b.d / 2);
      back.rotation.y = Math.PI;
      group.add(back);
      const right = new THREE.Mesh(wallGeo(b.d, b.h), b.mat);
      right.position.set(b.w / 2, b.h / 2, 0);
      right.rotation.y = Math.PI / 2;
      group.add(right);
      const left = new THREE.Mesh(wallGeo(b.d, b.h), b.mat);
      left.position.set(-b.w / 2, b.h / 2, 0);
      left.rotation.y = -Math.PI / 2;
      group.add(left);

      const roof = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.d), roofMat);
      roof.rotation.x = -Math.PI / 2;
      roof.position.y = b.h;
      group.add(roof);

      // neon corner accent
      if (rand() < 0.35) {
        const mat = neonMats[Math.floor(rand() * neonMats.length)];
        for (const [sx, sz] of [[1, 1], [-1, -1]]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.25, b.h, 0.25), mat);
          bar.position.set(sx * b.w / 2, b.h / 2, sz * b.d / 2);
          group.add(bar);
        }
      }
      scene.add(group);
      this.buildingMeshes.push(group);
    }
  }
}
