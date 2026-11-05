// Procedural circuit: spline layout, road ribbon, kerbs, barriers, scenery.
import * as THREE from 'three';
import {
  createAsphalt,
  createTerrain,
  createCurbTexture,
  createCheckerTexture,
  createBannerTexture,
  createBillboardTexture,
  createFacadeTexture,
  createStandTexture,
  createGlowTexture,
} from './textures.js';

const UP = new THREE.Vector3(0, 1, 0);
const ROAD_HALF = 9;
const CURB_OUTER = ROAD_HALF + 0.85;
const WALL_LAT = ROAD_HALF + 0.95;
const LAMP_LAT = ROAD_HALF + 4.6;

function frameAt(curve, t) {
  const u = ((t % 1) + 1) % 1;
  const p = curve.getPointAt(u);
  const tangent = curve.getTangentAt(u).normalize();
  const side = new THREE.Vector3().crossVectors(UP, tangent).normalize();
  return { p, tangent, side, u };
}

function makeRibbon(samples, lat0, lat1, y, uvScale = 12) {
  const n = samples.length;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= n; i++) {
    const s = samples[i % n];
    const a = s.p.clone().addScaledVector(s.side, lat0);
    const b = s.p.clone().addScaledVector(s.side, lat1);
    positions.push(a.x, y, a.z, b.x, y, b.z);
    const v = s.dist / uvScale;
    uvs.push(0, v, 1, v);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = ((i + 1) % n) * 2;
    const d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function makeQuad(center, tangent, side, halfWidth, halfDepth, y) {
  const a = center.clone().addScaledVector(tangent, halfDepth).addScaledVector(side, -halfWidth);
  const b = center.clone().addScaledVector(tangent, halfDepth).addScaledVector(side, halfWidth);
  const c = center.clone().addScaledVector(tangent, -halfDepth).addScaledVector(side, -halfWidth);
  const d = center.clone().addScaledVector(tangent, -halfDepth).addScaledVector(side, halfWidth);
  const verts = [a.x, y, a.z, b.x, y, b.z, c.x, y, c.z, d.x, y, d.z];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0, 1, 0, 0, 1, 1, 1,
  ], 2));
  g.setIndex([0, 1, 2, 1, 3, 2]);
  g.computeVertexNormals();
  return g;
}

export class Track {
  constructor(scene) {
    this.scene = scene;
    this.curve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(150, 0, 0),
        new THREE.Vector3(210, 0, 50),
        new THREE.Vector3(240, 0, 120),
        new THREE.Vector3(230, 0, 180),
        new THREE.Vector3(180, 0, 215),
        new THREE.Vector3(110, 0, 220),
        new THREE.Vector3(50, 0, 190),
        new THREE.Vector3(0, 0, 150),
        new THREE.Vector3(-30, 0, 90),
        new THREE.Vector3(-40, 0, 40),
        new THREE.Vector3(-18, 0, 8),
      ],
      true,
      'centripetal'
    );
    this.length = this.curve.getLength();
    this.halfWidth = ROAD_HALF;

    const N = 1400;
    this.samples = [];
    for (let i = 0; i < N; i++) {
      const p = this.curve.getPointAt(i / N);
      const tan = this.curve.getTangentAt(i / N).normalize();
      const side = new THREE.Vector3().crossVectors(UP, tan).normalize();
      this.samples.push({ p, tan, side, dist: (i / N) * this.length });
    }

    this.paintWorld();
  }

  frameAt(dist) {
    return frameAt(this.curve, dist / this.length);
  }

  /** Find nearest point on the center line, with an optional last-index hint. */
  locate(pos, hint = -1) {
    const n = this.samples.length;
    let bestI = -1;
    let bestD2 = Infinity;
    let useGlobal = hint < 0;
    if (!useGlobal) {
      for (let k = -30; k <= 30; k++) {
        if (k === 0) continue;
        const i = hint + k;
        const wrapped = ((i % n) + n) % n;
        const d2 = pos.distanceToSquared(this.samples[wrapped].p);
        if (d2 < bestD2) {
          bestD2 = d2;
          bestI = wrapped;
        }
      }
      if (bestD2 > 48 * 48) useGlobal = true;
    }
    if (useGlobal) {
      for (let i = 0; i < n; i++) {
        const d2 = pos.distanceToSquared(this.samples[i].p);
        if (d2 < bestD2) {
          bestD2 = d2;
          bestI = i;
        }
      }
    }

    // Refine using neighbouring segments.
    let result = null;
    for (let off = -1; off <= 1; off++) {
      const i = ((bestI + off) % n + n) % n;
      const j = (i + 1) % n;
      const a = this.samples[i];
      const b = this.samples[j];
      const ab = b.p.clone().sub(a.p);
      const len2 = ab.lengthSq();
      if (len2 === 0) continue;
      const t = THREE.MathUtils.clamp(pos.clone().sub(a.p).dot(ab) / len2, 0, 1);
      const base = a.p.clone().addScaledVector(ab, t);
      const d2 = pos.distanceToSquared(base);
      if (!result || d2 < result.d2) {
        const tangent = ab.clone().normalize();
        const side = new THREE.Vector3().crossVectors(UP, tangent).normalize();
        const dist = a.dist + t * (b.dist - a.dist + (b.dist === 0 ? this.length : 0));
        result = { index: j, base, tangent, side, dist, d2 };
      }
    }
    const lat = pos.clone().sub(result.base).dot(result.side);
    return { ...result, lateral: lat };
  }

  isClearOfTrack(x, z, minDist) {
    for (let i = 0; i < this.samples.length; i += 8) {
      const s = this.samples[i];
      if (Math.hypot(x - s.p.x, z - s.p.z) < minDist) return false;
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // World building
  // -------------------------------------------------------------------------
  paintWorld() {
    const scene = this.scene;
    const asphalt = createAsphalt();
    const curb = createCurbTexture();
    const terrain = createTerrain();

    // Ground -----------------------------------------------------------------
    const groundMat = new THREE.MeshStandardMaterial({
      map: terrain.map,
      roughness: 0.96,
      metalness: 0.0,
      color: 0xbfa6aa,
      envMapIntensity: 0.25,
    });
    groundMat.map.repeat.set(70, 70);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.12;
    ground.receiveShadow = true;
    scene.add(ground);

    // Ribbons ---------------------------------------------------------------
    const roadMat = new THREE.MeshStandardMaterial({
      map: asphalt.map,
      bumpMap: asphalt.bumpMap,
      bumpScale: 0.045,
      roughness: 0.86,
      metalness: 0.12,
      color: 0xffffff,
      envMapIntensity: 0.5,
    });
    const road = new THREE.Mesh(
      makeRibbon(this.samples, -ROAD_HALF, ROAD_HALF, 0.02, 16),
      roadMat
    );
    road.receiveShadow = true;
    scene.add(road);

    const curbMat = new THREE.MeshStandardMaterial({
      map: curb.map,
      roughness: 0.7,
      metalness: 0.05,
      color: 0xffffff,
      envMapIntensity: 0.4,
    });
    for (const sign of [1, -1]) {
      const lat0 = sign > 0 ? ROAD_HALF : -CURB_OUTER;
      const lat1 = sign > 0 ? CURB_OUTER : -ROAD_HALF;
      const strip = new THREE.Mesh(makeRibbon(this.samples, lat0, lat1, 0.032, 4), curbMat);
      strip.receiveShadow = true;
      scene.add(strip);
    }

    // Start / finish line ----------------------------------------------------
    const startFrame = this.frameAt(0);
    const checker = createCheckerTexture(16, 4);
    const lineGeo = makeQuad(
      startFrame.p,
      startFrame.tangent,
      startFrame.side,
      ROAD_HALF,
      1.15,
      0.05
    );
    const lineMat = new THREE.MeshStandardMaterial({
      map: checker.map,
      roughness: 0.55,
      metalness: 0.2,
      emissive: 0x252550,
      emissiveIntensity: 0.2,
    });
    const line = new THREE.Mesh(lineGeo, lineMat);
    scene.add(line);

    this.buildStartGate(startFrame);
    this.buildBarriers();
    this.buildStands();
    this.buildGantry(212, 'NEON RIDGE GP', 'SECTOR 2 // NIGHT RUN', '#36f2ff', '#ff3d7f');
    this.buildGantry(438, 'RIDGE CITY', 'HAIRPIN 09', '#ffb13d', '#ff3d2f');
    this.buildGantry(665, 'MACH 9', 'RIDGE FUEL PRESENTS', '#a56bff', '#36f2ff');
    this.buildCornerStand(480, 1);
    this.buildCornerStand(705, -1);
    this.buildCity();
    this.buildLandscape();
    this.buildLamps();
    this.buildSigns();
    return { asphalt, curb, terrain };
  }

  buildStartGate(frame) {
    const g = new THREE.Group();
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
    g.position.copy(frame.p);
    g.rotation.y = yaw;

    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0x111a26,
      metalness: 0.8,
      roughness: 0.3,
      emissive: 0x0a4e5a,
      emissiveIntensity: 0.5,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x1de8ff,
      emissive: 0x1de8ff,
      emissiveIntensity: 2.4,
      toneMapped: false,
    });
    const beamMat = new THREE.MeshStandardMaterial({
      color: 0x0b1220,
      metalness: 0.7,
      roughness: 0.35,
      emissive: 0x1a1530,
      emissiveIntensity: 0.5,
    });
    for (const x of [-ROAD_HALF - 1.6, ROAD_HALF + 1.6]) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7.4, 0.8), pylonMat);
      pylon.position.set(x, 3.7, 0);
      g.add(pylon);
      for (let k = 0; k < 3; k++) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.95), accentMat);
        strip.position.set(x, 1.1 + k * 2.0, 0);
        g.add(strip);
      }
    }
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(ROAD_HALF * 2 + 4.4, 0.9, 0.9),
      beamMat
    );
    beam.position.set(0, 7.4, 0);
    g.add(beam);
    const beamAccent = new THREE.Mesh(
      new THREE.BoxGeometry(ROAD_HALF * 2 + 4.4, 0.12, 1.06),
      accentMat
    );
    beamAccent.position.set(0, 7.86, 0);
    g.add(beamAccent);

    const banner = createBannerTexture('NEON RIDGE', 'RIDGE CITY GP', '#38f4ff', '#ff3d7f');
    const bannerMat = new THREE.MeshBasicMaterial({
      map: banner.map,
      toneMapped: false,
      side: THREE.FrontSide,
    });
    const bannerGeo = new THREE.PlaneGeometry(ROAD_HALF * 2 + 2.4, 4.6);
    const front = new THREE.Mesh(bannerGeo, bannerMat);
    front.position.set(0, 5.0, 0.55);
    g.add(front);
    const back = new THREE.Mesh(bannerGeo, bannerMat);
    back.position.set(0, 5.0, -0.55);
    back.rotation.y = Math.PI;
    g.add(back);
    this.scene.add(g);
  }

  buildBarriers() {
    const step = 5;
    const count = Math.floor(this.length / step) * 2;
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.9, 6);
    const railGeo = new THREE.BoxGeometry(0.09, 0.24, step + 0.25);
    const metal = new THREE.MeshStandardMaterial({
      color: 0x162631,
      metalness: 0.82,
      roughness: 0.32,
      emissive: 0x0b3d4d,
      emissiveIntensity: 0.3,
    });
    const neon = new THREE.MeshStandardMaterial({
      color: 0xff2f86,
      emissive: 0xff2f86,
      emissiveIntensity: 1.6,
      toneMapped: false,
      metalness: 0.4,
      roughness: 0.4,
    });

    const posts = new THREE.InstancedMesh(postGeo, metal, count);
    const rails = new THREE.InstancedMesh(railGeo, metal, count);
    const neonRails = new THREE.InstancedMesh(railGeo, neon, count);
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let d = 0; d < this.length; d += step) {
      const f = this.frameAt(d);
      const yaw = Math.atan2(f.tangent.x, f.tangent.z);
      for (const sign of [1, -1]) {
        const pos = f.p.clone().addScaledVector(f.side, WALL_LAT * sign);
        dummy.position.set(pos.x, 0.45, pos.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        posts.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(pos.x, 0.95, pos.z);
        dummy.rotation.set(0, yaw, 0);
        dummy.updateMatrix();
        rails.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(pos.x, 1.12, pos.z);
        dummy.updateMatrix();
        neonRails.setMatrixAt(idx, dummy.matrix);
        idx++;
      }
    }
    posts.instanceMatrix.needsUpdate = true;
    rails.instanceMatrix.needsUpdate = true;
    neonRails.instanceMatrix.needsUpdate = true;
    this.scene.add(posts, rails, neonRails);
  }

  buildStands() {
    const standTex = createStandTexture(13);
    const standMat = new THREE.MeshStandardMaterial({
      map: standTex.map,
      roughness: 0.75,
      metalness: 0.1,
      emissive: 0x000000,
      emissiveMap: standTex.map,
      emissiveIntensity: 0.45,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x17151f,
      roughness: 0.5,
      metalness: 0.6,
    });
    const accent = new THREE.MeshBasicMaterial({ color: 0x2ee8ff, toneMapped: false });

    for (const z of [-48, 48]) {
      const stand = new THREE.Mesh(new THREE.BoxGeometry(112, 12, 18), standMat);
      stand.position.set(72, 5.9, z);
      this.scene.add(stand);

      const roof = new THREE.Mesh(new THREE.BoxGeometry(116, 0.7, 21), roofMat);
      roof.position.set(72, 12.2, z);
      this.scene.add(roof);

      const rim = new THREE.Mesh(new THREE.BoxGeometry(114, 0.1, 0.15), accent);
      rim.position.set(72, 12.62, z + (z > 0 ? -10.4 : 10.4));
      this.scene.add(rim);

      const base = new THREE.Mesh(new THREE.BoxGeometry(116, 2.4, 20), roofMat);
      base.position.set(72, 1.1, z);
      this.scene.add(base);
    }

    // Pit / team building behind the start.
    const pit = new THREE.Mesh(new THREE.BoxGeometry(28, 8, 14), roofMat);
    pit.position.set(-38, 4, 38);
    this.scene.add(pit);
    const pitStripe = new THREE.Mesh(new THREE.BoxGeometry(28.2, 0.15, 14.2), accent);
    pitStripe.position.set(-38, 8.1, 38);
    this.scene.add(pitStripe);
  }

  buildGantry(dist, title, subtitle, colorA, colorB) {
    const f = this.frameAt(dist);
    const yaw = Math.atan2(f.tangent.x, f.tangent.z);
    const group = new THREE.Group();
    group.position.copy(f.p);
    group.rotation.y = yaw;

    const stanchionMat = new THREE.MeshStandardMaterial({
      color: 0x101522,
      metalness: 0.85,
      roughness: 0.3,
      emissive: 0x071c24,
      emissiveIntensity: 0.6,
    });
    const accentMat = new THREE.MeshBasicMaterial({ color: colorA, toneMapped: false });
    const accentMat2 = new THREE.MeshBasicMaterial({ color: colorB, toneMapped: false });

    for (const x of [-ROAD_HALF - 2.0, ROAD_HALF + 2.0]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7.6, 0.6), stanchionMat);
      post.position.set(x, 3.8, 0);
      group.add(post);
      for (const yy of [1.0, 3.3, 6.3]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.16, 0.66), accentMat);
        band.position.set(x, yy, 0);
        group.add(band);
      }
    }

    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(ROAD_HALF * 2 + 4.6, 0.6, 0.7),
      stanchionMat
    );
    beam.position.set(0, 7.4, 0);
    group.add(beam);
    const underglow = new THREE.Mesh(
      new THREE.BoxGeometry(ROAD_HALF * 2 + 4.0, 0.08, 0.9),
      accentMat2
    );
    underglow.position.set(0, 7.03, 0);
    group.add(underglow);

    const banner = createBannerTexture(title, subtitle, colorA, colorB);
    const mat = new THREE.MeshBasicMaterial({
      map: banner.map,
      toneMapped: false,
      side: THREE.FrontSide,
    });
    const geo = new THREE.PlaneGeometry(ROAD_HALF * 2 + 0.8, 3.6);
    const front = new THREE.Mesh(geo, mat);
    front.position.set(0, 5.5, 0.42);
    group.add(front);
    const back = new THREE.Mesh(geo, mat);
    back.position.set(0, 5.5, -0.42);
    back.rotation.y = Math.PI;
    group.add(back);

    this.scene.add(group);
  }

  buildCornerStand(dist, sideSign) {
    const f = this.frameAt(dist);
    const yaw = Math.atan2(f.tangent.x, f.tangent.z);
    const standTex = createStandTexture(31 + dist);
    const standMat = new THREE.MeshStandardMaterial({
      map: standTex.map,
      roughness: 0.75,
      metalness: 0.1,
      emissiveMap: standTex.map,
      emissive: 0xffffff,
      emissiveIntensity: 0.3,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x101018,
      metalness: 0.7,
      roughness: 0.4,
    });
    const accent = new THREE.MeshBasicMaterial({ color: 0x2ee8ff, toneMapped: false });
    const center = f.p.clone().addScaledVector(f.side, sideSign * (ROAD_HALF + 29));
    const stand = new THREE.Mesh(new THREE.BoxGeometry(72, 10, 17), standMat);
    stand.position.set(center.x, 4.9, center.z);
    stand.rotation.y = yaw - Math.PI / 2;
    this.scene.add(stand);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(76, 0.7, 20), roofMat);
    roof.position.set(center.x, 10.2, center.z);
    roof.rotation.y = yaw - Math.PI / 2;
    this.scene.add(roof);

    const rim = new THREE.Mesh(new THREE.BoxGeometry(74, 0.1, 0.12), accent);
    rim.position.copy(center).setY(10.6);
    rim.position.addScaledVector(f.side, -sideSign * 10.3);
    rim.rotation.y = yaw - Math.PI / 2;
    this.scene.add(rim);
  }

  buildCity() {
    const facade = createFacadeTexture(31, 0.45);
    const facadeMat = new THREE.MeshStandardMaterial({
      map: facade.map,
      emissiveMap: facade.emissiveMap,
      emissive: 0xffffff,
      emissiveIntensity: 0.85,
      roughness: 0.65,
      metalness: 0.35,
      envMapIntensity: 0.5,
    });
    const rand = (() => {
      let a = 1234567;
      return () => {
        a = (a * 1664525 + 1013904223) >>> 0;
        return a / 4294967296;
      };
    })();
    const count = 34;
    const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), facadeMat, count);
    const dummy = new THREE.Object3D();
    const positions = [];
    for (let i = 0; i < count; i++) {
      const zone = i % 3;
      let x;
      let z;
      if (zone === 0) {
        x = 300 + rand() * 190;
        z = -170 + rand() * 420;
      } else if (zone === 1) {
        x = 30 + rand() * 260;
        z = 300 + rand() * 140;
      } else {
        x = -260 - rand() * 130;
        z = 40 + rand() * 260;
      }
      const w = 12 + rand() * 26;
      const h = 30 + rand() * 115;
      dummy.position.set(x, h / 2, z);
      dummy.rotation.set(0, rand() * Math.PI, 0);
      dummy.scale.set(w, h, w * (0.7 + rand() * 0.6));
      dummy.updateMatrix();
      towers.setMatrixAt(i, dummy.matrix);
      positions.push([x, h, z]);
    }
    towers.instanceMatrix.needsUpdate = true;
    this.scene.add(towers);

    // Some neon crown lights atop select towers.
    const crowns = [];
    for (let i = 0; i < positions.length; i += 4) {
      crowns.push(positions[i]);
    }
    const crownGeo = new THREE.BoxGeometry(1, 1, 1);
    const crownMat = new THREE.MeshBasicMaterial({ color: 0xff3d7a, toneMapped: false });
    const crownMesh = new THREE.InstancedMesh(crownGeo, crownMat, crowns.length);
    crowns.forEach((c, i) => {
      dummy.position.set(c[0], c[1] + 1, c[2]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(6, 0.5, 6);
      dummy.updateMatrix();
      crownMesh.setMatrixAt(i, dummy.matrix);
    });
    crownMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(crownMesh);
  }

  buildLandscape() {
    const rand = (() => {
      let a = 987654321;
      return () => {
        a = (a * 1664525 + 1013904223) >>> 0;
        return a / 4294967296;
      };
    })();

    const mesas = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + rand() * 0.3;
      const radius = 280 + rand() * 340;
      mesas.push({
        x: Math.cos(a) * radius,
        z: Math.sin(a) * radius,
        r: 55 + rand() * 110,
        h: 35 + rand() * 80,
      });
    }
    const mesaMat = new THREE.MeshStandardMaterial({
      color: 0x2b1a31,
      roughness: 1,
      metalness: 0,
      flatShading: true,
      fog: true,
    });
    const mesaGeo = new THREE.CylinderGeometry(1, 1.5, 1, 7, 1);
    for (const m of mesas) {
      const mesh = new THREE.Mesh(mesaGeo, mesaMat);
      mesh.position.set(m.x, m.h / 2 - 1, m.z);
      mesh.scale.set(m.r, m.h, m.r * (0.8 + rand() * 0.5));
      mesh.rotation.y = rand() * Math.PI;
      this.scene.add(mesh);
    }

    // Cactus / desert shrubs, split over two instanced meshes.
    const shrubCount = 130;
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.35, 1, 5);
    const leafGeo = new THREE.ConeGeometry(0.7, 1, 5);
    const shrubMat = new THREE.MeshStandardMaterial({
      color: 0x2c301f,
      roughness: 0.9,
      flatShading: true,
    });
    const trunks = new THREE.InstancedMesh(trunkGeo, shrubMat, shrubCount);
    const leaves = new THREE.InstancedMesh(leafGeo, shrubMat, shrubCount * 3);
    const dummy = new THREE.Object3D();
    let li = 0;
    let placed = 0;
    let trunkTries = 0;
    while (placed < shrubCount && trunkTries < shrubCount * 30) {
      trunkTries++;
      const angle = rand() * Math.PI * 2;
      const radius = 60 + rand() * 270;
      const x = Math.cos(angle) * radius + 70;
      const z = Math.sin(angle) * radius + 110;
      if (!this.isClearOfTrack(x, z, 20)) continue;
      const h = 1.5 + rand() * 4.5;
      dummy.position.set(x, h / 2, z);
      dummy.rotation.set(rand() * 0.2, rand() * Math.PI, 0);
      dummy.scale.set(0.45 + rand() * 0.35, h, 0.45 + rand() * 0.35);
      dummy.updateMatrix();
      trunks.setMatrixAt(placed, dummy.matrix);
      for (let k = 0; k < 3; k++) {
        dummy.position.set(
          x + (rand() - 0.5) * 2.2,
          h + 0.9 + k * 0.4,
          z + (rand() - 0.5) * 2.2
        );
        dummy.rotation.set(0.5, rand() * Math.PI * 2, 0);
        dummy.scale.setScalar(0.5 + rand());
        dummy.updateMatrix();
        leaves.setMatrixAt(li++, dummy.matrix);
      }
      placed++;
    }
    trunks.count = placed;
    leaves.count = li;
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    this.scene.add(trunks, leaves);

    // Loose rocks.
    const rockCount = 120;
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      flatShading: true,
    });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    let placedRocks = 0;
    let tries = 0;
    while (placedRocks < rockCount && tries < rockCount * 30) {
      tries++;
      const angle = rand() * Math.PI * 2;
      const radius = 90 + rand() * 280;
      const x = Math.cos(angle) * radius + 70;
      const z = Math.sin(angle) * radius + 110;
      const s = 0.5 + rand() * 2.2;
      if (!this.isClearOfTrack(x, z, 14 + s * 2)) continue;
      dummy.position.set(x, s * 0.35 - 0.1, z);
      dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
      dummy.scale.set(s, s * (0.5 + rand() * 0.5), s);
      dummy.updateMatrix();
      rocks.setMatrixAt(placedRocks, dummy.matrix);
      rocks.setColorAt(
        placedRocks,
        new THREE.Color().setHSL(0.02 + rand() * 0.08, 0.2, 0.2 + rand() * 0.2)
      );
      placedRocks++;
    }
    rocks.count = placedRocks;
    rocks.instanceMatrix.needsUpdate = true;
    this.scene.add(rocks);

    // Distant mountains silhouettes
    const mountainGeo = new THREE.ConeGeometry(1, 1, 5);
    const mountainMat = new THREE.MeshBasicMaterial({ color: 0x23162f, fog: true });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const mesh = new THREE.Mesh(mountainGeo, mountainMat);
      const r = 660 + rand() * 160;
      const h = 80 + rand() * 140;
      mesh.position.set(Math.cos(a) * r, h / 2 - 5, Math.sin(a) * r);
      mesh.scale.set(170 + rand() * 90, h, 170 + rand() * 90);
      mesh.rotation.y = rand() * Math.PI;
      this.scene.add(mesh);
    }
  }

  buildLamps() {
    const glowTex = createGlowTexture();
    const step = 26;
    const spots = [];
    for (let i = 0; i < this.length; i += step) {
      const f = this.frameAt(i);
      const sign = ((i / step) | 0) % 2 === 0 ? 1 : -1;
      const pos = f.p.clone().addScaledVector(f.side, LAMP_LAT * sign);
      spots.push(pos);
    }
    const count = spots.length;
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x1a2230,
      metalness: 0.88,
      roughness: 0.35,
    });
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.2, 10, 6);
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, count);
    const dummy = new THREE.Object3D();
    spots.forEach((p, i) => {
      dummy.position.set(p.x, 4.9, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
    });
    poles.instanceMatrix.needsUpdate = true;
    this.scene.add(poles);

    const bulbGeo = new THREE.IcosahedronGeometry(0.42, 0);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, count);
    spots.forEach((p, i) => {
      dummy.position.set(p.x, 9.85, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      bulbs.setMatrixAt(i, dummy.matrix);
      bulbs.setColorAt(i, new THREE.Color(i % 2 === 0 ? '#ffd47c' : '#63f6ff'));
    });
    bulbs.instanceMatrix.needsUpdate = true;
    this.scene.add(bulbs);

    // Additive glow sprites as one points cloud.
    const positions = [];
    const colors = [];
    spots.forEach((p, i) => {
      positions.push(p.x, 9.9, p.z);
      const c = new THREE.Color(i % 2 === 0 ? '#ffd47c' : '#63f6ff');
      colors.push(c.r, c.g, c.b);
    });
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    pg.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const pm = new THREE.PointsMaterial({
      size: 6,
      map: glowTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(pg, pm);
    this.scene.add(this.points);
  }

  buildSigns() {
    const specs = [
      { d: 340, side: 1, offset: 20, text: 'NITRO' },
      { d: 610, side: -1, offset: 22, text: 'MACH 9' },
      { d: 95, side: -1, offset: 18, text: 'RIDGE FUEL' },
    ];
    const signs = specs.map((s) => ({
      ...s,
      tex: createBillboardTexture(s.text, '#ff7438', '#ffd66e'),
    }));
    for (const spec of signs) {
      const f = this.frameAt(spec.d);
      const pos = f.p.clone().addScaledVector(f.side, spec.side * spec.offset);
      const yaw = Math.atan2(f.tangent.x, f.tangent.z);
      const faceDir = f.side.clone().multiplyScalar(-spec.side);
      const billboardMat = new THREE.MeshBasicMaterial({
        map: spec.tex.map,
        toneMapped: false,
        side: THREE.DoubleSide,
      });
      const board = new THREE.Mesh(new THREE.PlaneGeometry(20, 5), billboardMat);
      board.position.set(pos.x, 5.2, pos.z);
      board.rotation.y = Math.atan2(faceDir.x, faceDir.z);
      this.scene.add(board);

      const postMat = new THREE.MeshStandardMaterial({
        color: 0x1b1822,
        metalness: 0.7,
        roughness: 0.4,
      });
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6, 0.35), postMat);
        post.position.copy(pos).setY(3);
        post.position.addScaledVector(f.tangent, s * 8);
        this.scene.add(post);
      }
    }
  }
}
