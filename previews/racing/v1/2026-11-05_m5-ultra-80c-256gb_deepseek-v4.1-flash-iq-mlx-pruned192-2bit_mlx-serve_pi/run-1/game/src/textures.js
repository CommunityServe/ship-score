import * as THREE from 'three';

/**
 * Every texture in this game is generated in-browser from canvas noise.
 * No image files are loaded or shipped with the project.
 */

function numericColor(value) {
  return Number(value);
}

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

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function toTexture(canvas, repeat = false) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  return tex;
}

function noiseSpeckle(ctx, w, h, rng, amount, colors, sizeRange = [1, 3]) {
  for (let i = 0; i < amount; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const size = sizeRange[0] + rng() * (sizeRange[1] - sizeRange[0]);
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    ctx.fillRect(x, y, size, size);
  }
}

export function asphaltTexture() {
  const w = 1024;
  const h = 1024;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const rng = mulberry32(1337);

  const base = ctx.createLinearGradient(0, 0, w, 0);
  base.addColorStop(0, '#26292f');
  base.addColorStop(0.18, '#22262c');
  base.addColorStop(0.55, '#2b2d33');
  base.addColorStop(0.8, '#1f2228');
  base.addColorStop(1, '#292b31');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // Dense aggregate grain.
  noiseSpeckle(ctx, w, h, rng, 36000, ['#16181d', '#353942', '#494e57', '#252833', '#3f434c'], [1, 2]);
  noiseSpeckle(ctx, w, h, rng, 4000, ['#585f6a', '#32353c', '#111317'], [2, 4]);

  // Tire polish streaks and faint cracks.
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 16; i++) {
    const y = rng() * h;
    ctx.fillStyle = rng() > 0.5 ? '#545b66' : '#111316';
    ctx.fillRect(0, y, w, 1 + rng() * 4);
  }
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = '#0f1115';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    const x = rng() * w;
    const y = rng() * h;
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      ctx.lineTo(x + (rng() - 0.5) * 42, y + (rng() - 0.5) * 18);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Road lane markings. The road ribbon maps U across its full width and V
  // along the length, so these become continuous painted lane stripes.
  ctx.fillStyle = '#e6e9f2';
  ctx.fillRect(8, 0, 5, h);
  ctx.fillRect(w - 13, 0, 5, h);
  ctx.fillStyle = '#d6d9e2';
  for (let y = 0; y < h; y += 128) {
    ctx.fillRect(Math.floor(w * 0.5) - 3, y, 6, 76);
  }

  // Decorative racing lane pips at 1/4 and 3/4 width, broken and weathered.
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#8d98aa';
  const lanes = [w * 0.28, w * 0.72];
  for (const lx of lanes) {
    for (let y = 0; y < h; y += 96) {
      ctx.fillRect(Math.floor(lx) - 2, y + 16, 4, 46);
    }
  }
  ctx.globalAlpha = 1.0;

  return toTexture(canvas, true);
}

export function grassTexture() {
  const w = 512;
  const h = 512;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const rng = mulberry32(7331);

  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#1a3327');
  g.addColorStop(0.45, '#24402f');
  g.addColorStop(0.78, '#14352c');
  g.addColorStop(1, '#20382e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  noiseSpeckle(ctx, w, h, rng, 14000, ['#0d241b', '#2f4f38', '#345d48', '#162c22', '#4e6b50'], [1, 3]);
  for (let i = 0; i < 2200; i++) {
    const x = rng() * w;
    const y = rng() * h;
    ctx.strokeStyle = rng() > 0.5 ? '#345f41' : '#122b1a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 5, y - 2 - rng() * 4);
    ctx.stroke();
  }

  return toTexture(canvas, true);
}

export function concreteTexture() {
  const w = 512;
  const h = 512;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const rng = mulberry32(991);

  ctx.fillStyle = '#3b3e45';
  ctx.fillRect(0, 0, w, h);
  noiseSpeckle(ctx, w, h, rng, 15000, ['#272a31', '#4f535b', '#585c64', '#31343b', '#202329'], [1, 2]);
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = '#20232b';
  ctx.lineWidth = 2;
  for (let i = 0; i < 22; i++) {
    ctx.beginPath();
    const x = rng() * w;
    const y = rng() * h;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * w * 0.16, y + (rng() - 0.5) * h * 0.12);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas, true);
}

export function brushedMetalTexture() {
  const w = 512;
  const h = 512;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const rng = mulberry32(4242);
  ctx.fillStyle = '#7b8490';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 600; i++) {
    const y = rng() * h;
    ctx.strokeStyle = rng() > 0.5 ? '#4c5560' : '#aeb9c4';
    ctx.globalAlpha = 0.25 + rng() * 0.4;
    ctx.lineWidth = 0.4 + rng();
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y + (rng() - 0.5) * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  noiseSpeckle(ctx, w, h, rng, 1200, ['#2d3239', '#d2dce8'], [1, 2]);
  return toTexture(canvas, true);
}

export function carTexture(baseHex, accentHex) {
  // Long racing chassis gradient with brushed gloss and racing stripes.
  const w = 512;
  const h = 256;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const rng = mulberry32(8080 + baseHex.length);
  const base = `#${baseHex.toString(16).padStart(6, '0')}`;
  const accent = `#${accentHex.toString(16).padStart(6, '0')}`;

  const baseRgb = {
    r: (numericColor(baseHex) >> 16) & 255,
    g: (numericColor(baseHex) >> 8) & 255,
    b: numericColor(baseHex) & 255,
  };
  const accentRgb = {
    r: (numericColor(accentHex) >> 16) & 255,
    g: (numericColor(accentHex) >> 8) & 255,
    b: numericColor(accentHex) & 255,
  };
  const rgb = (c) => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
  const mix = (c, white, amount) => ({
    r: c.r + (255 - c.r) * amount,
    g: c.g + (255 - c.g) * amount,
    b: c.b + (255 - c.b) * amount,
  });
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgb(mix(baseRgb, true, 0.28)));
  g.addColorStop(0.16, rgb(baseRgb));
  g.addColorStop(0.58, rgb(baseRgb));
  g.addColorStop(0.79, rgb({ r: baseRgb.r * 0.85, g: baseRgb.g * 0.85, b: baseRgb.b * 0.85 }));
  g.addColorStop(1, rgb({ r: baseRgb.r * 0.4, g: baseRgb.g * 0.4, b: baseRgb.b * 0.4 }));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.26;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, h * 0.22, w, 9);
  ctx.fillRect(0, h * 0.64, w, 13);
  ctx.globalAlpha = 1;
  ctx.fillStyle = accent;
  ctx.fillRect(0, h * 0.7, w, 9);
  ctx.fillRect(0, h * 0.76, w, 4);
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = rgb(mix(accentRgb, true, 0.58));
  ctx.fillRect(0, h * 0.18, w, 3);

  // Brushed racing highlights.
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = '#ffffff';
  for (let i = 0; i < 90; i++) {
    ctx.lineWidth = 1;
    ctx.beginPath();
    const y = rng() * h;
    ctx.moveTo(0, y);
    ctx.lineTo(w, y + (rng() - 0.5) * 1.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  return toTexture(canvas, true);
}

export function skyTexture() {
  const w = 512;
  const h = 1024;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const rng = mulberry32(2412);

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#05060e');
  g.addColorStop(0.18, '#13102d');
  g.addColorStop(0.31, '#2e1c4b');
  g.addColorStop(0.4, '#68396f');
  g.addColorStop(0.47, '#d66295');
  g.addColorStop(0.52, '#f18858');
  g.addColorStop(0.6, '#6b3b60');
  g.addColorStop(0.74, '#21152e');
  g.addColorStop(0.9, '#0d0a1c');
  g.addColorStop(1, '#05050d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Soft sunset glow behind the racing horizon.
  const sunsetGlow = ctx.createRadialGradient(w * 0.62, h * 0.43, 0, w * 0.62, h * 0.43, w * 0.9);
  sunsetGlow.addColorStop(0, 'rgba(255,225,184,0.88)');
  sunsetGlow.addColorStop(0.1, 'rgba(255,150,108,0.55)');
  sunsetGlow.addColorStop(0.28, 'rgba(203,94,143,0.22)');
  sunsetGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = sunsetGlow;
  ctx.fillRect(0, 0, w, h * 0.7);
  ctx.globalAlpha = 1;

  // Stars in the upper sky.
  ctx.globalAlpha = 0.6;
  for (let i = 0; i < 900; i++) {
    const x = rng() * w;
    const y = rng() * h * 0.28;
    const a = rng();
    ctx.fillStyle = a > 0.5 ? '#f1f6ff' : '#b5c4ed';
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.globalAlpha = 1;

  // Glowing sunset haze. Rendered as additive streaks so the horizon glows.
  const glow = ctx.createRadialGradient(w * 0.48, h * 0.53, 0, w * 0.48, h * 0.53, w * 0.62);
  glow.addColorStop(0, 'rgba(255,224,188,0.9)');
  glow.addColorStop(0.12, 'rgba(255,148,102,0.6)');
  glow.addColorStop(0.35, 'rgba(186,80,120,0.28)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = glow;
  ctx.fillRect(0, h * 0.22, w, h * 0.6);
  ctx.globalAlpha = 1;

  // Low cloud bands.
  ctx.globalAlpha = 0.33;
  for (let i = 0; i < 18; i++) {
    const y = h * 0.36 + rng() * h * 0.18;
    ctx.fillStyle = rng() > 0.4 ? '#f3a5ae' : '#c266a6';
    ctx.fillRect(rng() * w, y, 60 + rng() * 220, 4 + rng() * 8);
  }
  ctx.globalAlpha = 1;

  return toTexture(canvas);
}

export function glowTexture(colorHex) {
  const size = 256;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const rng = mulberry32(66);
  const color = `#${colorHex.toString(16).padStart(6, '0')}`;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.13, color);
  g.addColorStop(0.4, color);
  g.addColorStop(0.7, 'rgba(0,0,0,0.2)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 0.7;
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = color;
    ctx.fillRect(size / 2 + (rng() - 0.5) * size * 0.7, size / 2 + (rng() - 0.5) * size * 0.7, 1, 1);
  }
  ctx.globalAlpha = 1;
  const tex = toTexture(canvas);
  tex.composite = true;
  return tex;
}

export function billboardTexture(title, subtitle, accentHex) {
  const w = 512;
  const h = 256;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const accent = `#${accentHex.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = '#070b16';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  ctx.strokeStyle = '#242b45';
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 28, w - 56, h - 56);
  ctx.fillStyle = accent;
  ctx.font = 'bold 40px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, w / 2, h / 2 - 26);
  ctx.fillStyle = '#cad6ec';
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.fillText(subtitle, w / 2, h / 2 + 34);
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = accent;
  ctx.fillRect(18, 22, 42, 4);
  ctx.fillRect(w - 60, h - 26, 42, 4);
  ctx.globalAlpha = 1;
  return toTexture(canvas);
}

export function brushedGroundTexture() {
  // Procedural shoulder strips beyond the asphalt.
  const w = 512;
  const h = 512;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const rng = mulberry32(555);
  ctx.fillStyle = '#292c32';
  ctx.fillRect(0, 0, w, h);
  noiseSpeckle(ctx, w, h, rng, 9500, ['#1c1f24', '#3c4048', '#4e535b'], [1, 2]);
  return toTexture(canvas, true);
}

export function contactShadowTexture() {
  const w = 256;
  const h = 256;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return toTexture(canvas);
}
