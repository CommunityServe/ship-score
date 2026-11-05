// Tiny GPU point-particle system for tire smoke and impact sparks.
import * as THREE from 'three';
import { createSmokeTexture } from './textures.js';

const MAX = 320;

export class ParticleFX {
  constructor(scene) {
    this.tex = createSmokeTexture();
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(MAX * 3);
    this.colors = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.base = new Float32Array(MAX * 3);
    this.buoyancy = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.cursor = 0;

    for (let i = 0; i < MAX; i++) {
      this.positions[i * 3 + 1] = -100;
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));

    const mat = new THREE.PointsMaterial({
      size: 0.5,
      map: this.tex,
      vertexColors: true,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geometry, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(pos, velocity, color, life = 1.2, buoyancy = 0.9, drag = 2.2) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX;
    this.positions[i * 3] = pos.x;
    this.positions[i * 3 + 1] = pos.y;
    this.positions[i * 3 + 2] = pos.z;
    this.vel[i * 3] = velocity.x;
    this.vel[i * 3 + 1] = velocity.y;
    this.vel[i * 3 + 2] = velocity.z;
    this.base[i * 3] = color.r;
    this.base[i * 3 + 1] = color.g;
    this.base[i * 3 + 2] = color.b;
    this.colors[i * 3] = color.r;
    this.colors[i * 3 + 1] = color.g;
    this.colors[i * 3 + 2] = color.b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.buoyancy[i] = buoyancy;
    this.drag[i] = drag;
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.positions[i * 3 + 1] = -100;
        continue;
      }
      const damp = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= damp;
      this.vel[i * 3 + 2] *= damp;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * damp + this.buoyancy[i] * dt;
      this.positions[i * 3] += this.vel[i * 3] * dt;
      this.positions[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const fade = Math.max(0, this.life[i] / this.maxLife[i]);
      this.colors[i * 3] = this.base[i * 3] * fade;
      this.colors[i * 3 + 1] = this.base[i * 3 + 1] * fade;
      this.colors[i * 3 + 2] = this.base[i * 3 + 2] * fade;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  spraySmoke(pos, direction, color) {
    const vel = direction.clone().multiplyScalar(1.2 + Math.random() * 2.4);
    vel.x += (Math.random() - 0.5) * 2;
    vel.y = 0.4 + Math.random() * 1.6;
    vel.z += (Math.random() - 0.5) * 2;
    this.spawn(pos, vel, color, 0.6 + Math.random() * 0.6, 0.7, 2.4);
  }

  spraySparks(pos, color) {
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      1.5 + Math.random() * 5,
      (Math.random() - 0.5) * 10
    );
    this.spawn(pos, vel, color, 0.35 + Math.random() * 0.35, -7.5, 0.8);
  }
}
