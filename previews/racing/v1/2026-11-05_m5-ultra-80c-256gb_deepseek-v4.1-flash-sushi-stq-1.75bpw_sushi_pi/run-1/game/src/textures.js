// Procedurally generated textures. Every pixel here is created at runtime from
// canvas 2D drawing + noise functions -- no image files are loaded from disk.
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Small deterministic noise toolkit
// ---------------------------------------------------------------------------
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

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function makeNoiseLayer(seed, period) {
  const rand = mulberry32(seed);
  const grid = new Float32Array(period * period);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const wrap = (v) => ((v % period) + period) % period;
  return (x, y) => {
    const fx = x * period;
    const fy = y * period;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const xa = wrap(x0);
    const ya = wrap(y0);
    const xb = wrap(x0 + 1);
    const yb = wrap(y0 + 1);
    const v00 = grid[ya * period + xa];
    const v10 = grid[ya * period + xb];
    const v01 = grid[yb * period + xa];
    const v11 = grid[yb * period + xb];
    return (
      v00 * (1 - tx) * (1 - ty) +
      v10 * tx * (1 - ty) +
      v01 * (1 - tx) * ty +
      v11 * tx * ty
    );
  };
}

function makeFbm(seed, basePeriod, octaves, gain = 0.5) {
  const layers = [];
  let norm = 0;
  let amp = 1;
  for (let o = 0; o < octaves; o++) {
    layers.push({ fn: makeNoiseLayer(seed + o * 131, basePeriod << o), amp });
    norm += amp;
    amp *= gain;
  }
  return (x, y) => {
    let v = 0;
    for (let i = 0; i < layers.length; i++) v += layers[i].fn(x, y) * layers[i].amp;
    return v / norm;
  };
}

function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(canvas, { srgb = true, repeat = true } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function colorFromHex(hex) {
  const c = new THREE.Color(hex);
  return { r: Math.round(c.r * 255), g: Math.round(c.g * 255), b: Math.round(c.b * 255) };
}

// ---------------------------------------------------------------------------
// Asphalt / road surface
// ---------------------------------------------------------------------------
export function createAsphalt() {
  const size = 1024;
  const canvas = canvas2d(size, size);
  const ctx = canvas.getContext('2d');
  const fbm = makeFbm(9137, 8, 4, 0.52);

  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    const ny = y / size;
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const n = fbm(nx, ny);
      const grain = fbm(nx * 4 + 0.37, ny * 4 + 0.81);
      const v = 21 + n * 25 + grain * 10;
      const i = (y * size + x) * 4;
      d[i] = Math.min(255, v * 0.9);
      d[i + 1] = Math.min(255, v * 0.95 + 2);
      d[i + 2] = Math.min(255, v * 1.12 + 4);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Slightly polished racing line down the middle.
  const shine = ctx.createLinearGradient(0, 0, size, 0);
  shine.addColorStop(0, 'rgba(180,200,255,0)');
  shine.addColorStop(0.24, 'rgba(190,205,255,0.06)');
  shine.addColorStop(0.5, 'rgba(210,220,255,0.11)');
  shine.addColorStop(0.76, 'rgba(190,205,255,0.06)');
  shine.addColorStop(1, 'rgba(180,200,255,0)');
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, size, size);

  // Tire wear bands.
  ctx.fillStyle = 'rgba(5,6,10,0.16)';
  ctx.fillRect(size * 0.17, 0, size * 0.09, size);
  ctx.fillRect(size * 0.74, 0, size * 0.09, size);

  // Random cracks / patches.
  const rand = mulberry32(3321);
  ctx.strokeStyle = 'rgba(4,5,8,0.35)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 60; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 18 + rand() * 90;
    const ang = rand() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }
  // A few light bits of debris.
  for (let i = 0; i < 900; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const a = 0.03 + rand() * 0.09;
    ctx.fillStyle = `rgba(220,235,255,${a})`;
    ctx.fillRect(x, y, 1 + rand() * 2, 1 + rand() * 2);
  }

  // Line markings. In UV space x runs across the road, y runs along it.
  ctx.save();
  ctx.shadowColor = 'rgba(180,220,255,0.5)';
  ctx.shadowBlur = 5;
  // Solid edge lines.
  ctx.fillStyle = 'rgba(235,246,255,0.86)';
  ctx.fillRect(size * 0.032, 0, size * 0.008, size);
  ctx.fillRect(size * 0.96, 0, size * 0.008, size);
  // Dashed center line.
  ctx.strokeStyle = 'rgba(245,250,255,0.8)';
  ctx.lineWidth = size * 0.008;
  ctx.setLineDash([size * 0.12, size * 0.10]);
  ctx.beginPath();
  ctx.moveTo(size * 0.5, 0);
  ctx.lineTo(size * 0.5, size);
  ctx.stroke();
  // Two dim dashed lane separators for a wider track feel.
  ctx.strokeStyle = 'rgba(220,235,255,0.18)';
  ctx.lineWidth = size * 0.004;
  ctx.setLineDash([size * 0.05, size * 0.09]);
  for (const u of [0.245, 0.755]) {
    ctx.beginPath();
    ctx.moveTo(size * u, 0);
    ctx.lineTo(size * u, size);
    ctx.stroke();
  }
  ctx.restore();

  // Grayscale bump map built from a denser noise field.
  const bumpSize = 512;
  const bumpCanvas = canvas2d(bumpSize, bumpSize);
  const bctx = bumpCanvas.getContext('2d');
  const bimg = bctx.createImageData(bumpSize, bumpSize);
  const bFbm = makeFbm(8123, 16, 3, 0.55);
  for (let y = 0; y < bumpSize; y++) {
    for (let x = 0; x < bumpSize; x++) {
      const n = bFbm(x / bumpSize, y / bumpSize);
      const g = Math.floor(90 + n * 150);
      const i = (y * bumpSize + x) * 4;
      bimg.data[i] = g;
      bimg.data[i + 1] = g;
      bimg.data[i + 2] = g;
      bimg.data[i + 3] = 255;
    }
  }
  bctx.putImageData(bimg, 0, 0);

  return {
    map: toTexture(canvas),
    bumpMap: toTexture(bumpCanvas, { srgb: false }),
    canvas,
  };
}

// ---------------------------------------------------------------------------
// Desert terrain
// ---------------------------------------------------------------------------
export function createTerrain() {
  const size = 512;
  const canvas = canvas2d(size, size);
  const ctx = canvas.getContext('2d');
  const fbm = makeFbm(5501, 6, 4, 0.5);
  const fbm2 = makeFbm(7157, 11, 3, 0.6);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const dark = colorFromHex('#241629');
  const mid = colorFromHex('#4b2c2e');
  const sand = colorFromHex('#8a5a44');
  const gold = colorFromHex('#b97a4b');

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x / size, y / size);
      const m = fbm2(x / size + 0.31, y / size + 0.77);
      let r, g, b;
      if (n < 0.35) {
        const t = n / 0.35;
        r = dark.r + (mid.r - dark.r) * t;
        g = dark.g + (mid.g - dark.g) * t;
        b = dark.b + (mid.b - dark.b) * t;
      } else {
        const t = (n - 0.35) / 0.65;
        r = mid.r + (sand.r - mid.r) * t;
        g = mid.g + (sand.g - mid.g) * t;
        b = mid.b + (sand.b - mid.b) * t;
      }
      const glint = m * 0.18;
      r = Math.min(255, r + gold.r * glint);
      g = Math.min(255, g + gold.g * glint * 0.7);
      b = Math.min(255, b + gold.b * glint * 0.6);
      const gr = (fbm2(x * 3.1, y * 3.1) - 0.5) * 14;
      const i = (y * size + x) * 4;
      d[i] = Math.max(0, Math.min(255, r + gr));
      d[i + 1] = Math.max(0, Math.min(255, g + gr));
      d[i + 2] = Math.max(0, Math.min(255, b + gr));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Pebbles and fine gravel, wrapped around edges by drawing one extra copy.
  const rand = mulberry32(9911);
  const drawRock = (x, y, r, shade) => {
    ctx.fillStyle = `rgba(${shade},${shade},${shade + 8},${0.12 + rand() * 0.16})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.4 + rand() * 0.6), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  };
  for (let i = 0; i < 800; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.5 + rand() * 3;
    const shade = 30 + Math.floor(rand() * 120);
    drawRock(x, y, r, shade);
    if (x < 8) drawRock(x + size, y, r, shade);
    if (x > size - 8) drawRock(x - size, y, r, shade);
    if (y < 8) drawRock(x, y + size, r, shade);
    if (y > size - 8) drawRock(x, y - size, r, shade);
  }

  return { map: toTexture(canvas) };
}

// ---------------------------------------------------------------------------
// Curbs (red / white striped kerbs)
// ---------------------------------------------------------------------------
export function createCurbTexture() {
  const w = 32;
  const h = 256;
  const canvas = canvas2d(w, h);
  const ctx = canvas.getContext('2d');
  const bands = 8;
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#e8ecf2' : '#e3263f';
    ctx.fillRect(0, (i / bands) * h, w, h / bands + 1);
  }
  // slight grime
  const rand = mulberry32(771);
  ctx.fillStyle = 'rgba(20,20,30,0.30)';
  for (let i = 0; i < 40; i++) {
    ctx.fillRect(rand() * w, rand() * h, rand() * 2, rand() * 30);
  }
  return { map: toTexture(canvas) };
}

// ---------------------------------------------------------------------------
// Checkered finish line and banners
// ---------------------------------------------------------------------------
export function createCheckerTexture(cols = 16, rows = 4) {
  const cell = 32;
  const canvas = canvas2d(cols * cell, rows * cell);
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#f4f7fb' : '#101219';
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  return { map: toTexture(canvas, { srgb: true, repeat: true }) };
}

export function createBannerTexture(title, subtitle, colorA = '#36f2ff', colorB = '#ff3d7f') {
  const w = 1024;
  const h = 256;
  const canvas = canvas2d(w, h);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0b0b18';
  ctx.fillRect(0, 0, w, h);

  // Checker pattern edges.
  const cell = 32;
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      const insideEdge = x < 128 || x > w - 160;
      if (insideEdge) {
        ctx.fillStyle = ((x / cell + y / cell) | 0) % 2 === 0 ? '#e8edf5' : '#151724';
        ctx.fillRect(x, y, cell, cell);
      }
    }
  }

  // Neon frame.
  ctx.strokeStyle = colorA;
  ctx.lineWidth = 8;
  ctx.strokeRect(144, 24, w - 288, h - 48);
  ctx.save();
  ctx.shadowColor = colorB;
  ctx.shadowBlur = 24;
  ctx.strokeStyle = colorB;
  ctx.lineWidth = 3;
  ctx.strokeRect(156, 34, w - 312, h - 68);
  ctx.restore();

  const grad = ctx.createLinearGradient(220, 0, w - 220, 0);
  grad.addColorStop(0, colorA);
  grad.addColorStop(1, colorB);
  ctx.fillStyle = grad;
  ctx.font = '800 92px "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '6px';
  ctx.save();
  ctx.shadowColor = colorB;
  ctx.shadowBlur = 26;
  ctx.fillText(title, w / 2, 110);
  ctx.restore();

  ctx.fillStyle = 'rgba(235,245,255,0.8)';
  ctx.font = '600 28px "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
  ctx.letterSpacing = '10px';
  ctx.fillText(subtitle, w / 2, 190);

  return { map: toTexture(canvas, { srgb: true, repeat: false }) };
}

export function createBillboardTexture(text, colorA = '#ff6a3d', colorB = '#ffd166') {
  const w = 1024;
  const h = 256;
  const canvas = canvas2d(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#080915';
  ctx.fillRect(0, 0, w, h);
  // faint diagonal stripes
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = colorA;
  for (let i = -h; i < w; i += 48) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 24, 0);
    ctx.lineTo(i + 24 + h, h);
    ctx.lineTo(i + h, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = colorA;
  ctx.lineWidth = 12;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  const g = ctx.createLinearGradient(0, 40, w, 220);
  g.addColorStop(0, colorB);
  g.addColorStop(1, colorA);
  ctx.fillStyle = g;
  ctx.font = '900 142px "Arial Black", "Arial Narrow", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = colorA;
  ctx.shadowBlur = 30;
  ctx.fillText(text, w / 2, h / 2 + 4);
  return { map: toTexture(canvas, { srgb: true, repeat: false }) };
}

// ---------------------------------------------------------------------------
// Building facades + grandstands
// ---------------------------------------------------------------------------
export function createFacadeTexture(seed = 42, litRatio = 0.4) {
  const w = 256;
  const h = 512;
  const map = canvas2d(w, h);
  const ctx = map.getContext('2d');
  const glow = canvas2d(w, h);
  const gctx = glow.getContext('2d');
  gctx.fillStyle = '#000000';
  gctx.fillRect(0, 0, w, h);

  const rand = mulberry32(seed);
  ctx.fillStyle = '#161526';
  ctx.fillRect(0, 0, w, h);
  const cols = 6;
  const rows = 14;
  const pad = 8;
  const cw = (w - pad * (cols + 1)) / cols;
  const ch = (h - pad * (rows + 1)) / rows;
  const lit = ['#54f0ff', '#ffc15e', '#ff5f87', '#c897ff', '#8affc4'];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = pad + c * (cw + pad);
      const y = pad + r * (ch + pad);
      ctx.fillStyle = '#23213a';
      ctx.fillRect(x, y, cw, ch);
      if (rand() < litRatio) {
        const col = lit[(rand() * lit.length) | 0];
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.38;
        ctx.fillRect(x + 2, y + 2, cw - 4, ch - 4);
        ctx.globalAlpha = 1;
        gctx.fillStyle = col;
        gctx.globalAlpha = 0.75;
        gctx.fillRect(x + 2, y + 2, cw - 4, ch - 4);
        gctx.globalAlpha = 1;
      }
    }
  }
  // Structural ribs.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let c = 0; c <= cols; c++) {
    ctx.fillRect(pad * 0.5 + c * (cw + pad), 0, 2, h);
  }
  return {
    map: toTexture(map),
    emissiveMap: toTexture(glow),
  };
}

export function createStandTexture(seed = 7) {
  const w = 512;
  const h = 256;
  const canvas = canvas2d(w, h);
  const ctx = canvas.getContext('2d');
  const rand = mulberry32(seed);

  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#161326');
  base.addColorStop(1, '#0c0b18');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // Dark concrete structure at the bottom.
  ctx.fillStyle = '#0b0d16';
  ctx.fillRect(0, h - 34, w, 34);
  ctx.fillStyle = 'rgba(54,242,255,0.25)';
  ctx.fillRect(0, h - 34, w, 2);

  const rows = 9;
  const rowH = (h - 36) / rows;
  for (let r = 0; r < rows; r++) {
    const y = 10 + r * rowH;
    // tiered seating slabs
    const g = ctx.createLinearGradient(0, y, 0, y + rowH - 5);
    g.addColorStop(0, r % 2 ? '#1b1c2d' : '#202237');
    g.addColorStop(1, '#0f1020');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, w, rowH - 5);
    // handrail line
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, y, w, 1);

    // Sparse crowd flecks (small, not bokeh circles).
    for (let x = 3; x < w; x += 4) {
      if (rand() < 0.32) {
        const palette = ['#ffd166', '#fc5d7c', '#45e6ff', '#a67dff', '#f4f7fb'];
        ctx.fillStyle = palette[(rand() * palette.length) | 0];
        ctx.globalAlpha = 0.25 + rand() * 0.45;
        const s = rand() < 0.3 ? 2 : 1;
        ctx.fillRect(x, y + 5 + rand() * (rowH - 12), s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Vertical structural ribs.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let x = 0; x < w; x += 42) ctx.fillRect(x, 0, 2, h - 34);

  return { map: toTexture(canvas) };
}

// ---------------------------------------------------------------------------
// Miscellaneous sprites
// ---------------------------------------------------------------------------
export function createGlowTexture() {
  const size = 128;
  const canvas = canvas2d(size, size);
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.8)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(canvas, { repeat: false });
}

export function createSmokeTexture() {
  const size = 64;
  const canvas = canvas2d(size, size);
  const ctx = canvas.getContext('2d');
  const rand = mulberry32(212);
  for (let i = 0; i < 12; i++) {
    const g = ctx.createRadialGradient(
      size / 2 + (rand() - 0.5) * 20,
      size / 2 + (rand() - 0.5) * 20,
      0,
      size / 2,
      size / 2,
      size / 2
    );
    g.addColorStop(0, 'rgba(230,230,240,0.22)');
    g.addColorStop(1, 'rgba(230,230,240,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return toTexture(canvas, { repeat: false });
}

export function createPaintTexture(baseHex, stripeHex, seed = 3) {
  const size = 256;
  const canvas = canvas2d(size, size);
  const ctx = canvas.getContext('2d');
  const base = new THREE.Color(baseHex);
  const stripe = new THREE.Color(stripeHex);
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, size, size);

  // Soft metal sheen bands.
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, 'rgba(255,255,255,0.20)');
  g.addColorStop(0.35, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.30)');
  g.addColorStop(1, 'rgba(255,255,255,0.06)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // Diagonal racing stripes.
  ctx.fillStyle = `#${stripe.getHexString()}`;
  ctx.globalAlpha = 0.75;
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-0.25);
  ctx.fillRect(-size * 0.6, -14, size * 1.2, 12);
  ctx.fillRect(-size * 0.6, 4, size * 1.2, 4);
  ctx.restore();
  ctx.globalAlpha = 1;

  // Fine procedural grunge.
  const rand = mulberry32(seed * 997);
  for (let i = 0; i < 400; i++) {
    const a = rand() * 0.06;
    ctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 3, 1 + rand() * 3);
  }
  return toTexture(canvas, { srgb: true, repeat: false });
}

export function createRimTexture() {
  const size = 128;
  const canvas = canvas2d(size, size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  ctx.fillStyle = '#0d0f14';
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#eef4ff';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.35, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#8e98aa';
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * size * 0.12, cy + Math.sin(a) * size * 0.12);
    ctx.lineTo(cx + Math.cos(a) * size * 0.34, cy + Math.sin(a) * size * 0.34);
    ctx.stroke();
  }
  ctx.fillStyle = '#d6e8ff';
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.1, 0, Math.PI * 2);
  ctx.fill();
  return toTexture(canvas, { srgb: true, repeat: false });
}

export function createCubeEnvironment() {
  const faces = [];
  const top = new THREE.Color('#201a44');
  const mid = new THREE.Color('#6c2d52');
  const horizon = new THREE.Color('#ff8d58');
  const bottom = new THREE.Color('#1c1222');
  const rand = mulberry32(4000);
  for (let i = 0; i < 6; i++) {
    const c = canvas2d(128, 128);
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    if (i === 2) {
      // +Y: sky overhead
      g.addColorStop(0, `#${top.getHexString()}`);
      g.addColorStop(0.7, `#${mid.getHexString()}`);
      g.addColorStop(1, `#${horizon.getHexString()}`);
    } else if (i === 3) {
      // -Y: dark ground
      g.addColorStop(0, `#${horizon.getHexString()}`);
      g.addColorStop(1, `#${bottom.getHexString()}`);
    } else {
      g.addColorStop(0, `#${top.getHexString()}`);
      g.addColorStop(0.58, `#${mid.getHexString()}`);
      g.addColorStop(0.72, `#${horizon.getHexString()}`);
      g.addColorStop(1, `#${bottom.getHexString()}`);
      // warm sun glow on one side
      if (i === 4) {
        const sg = ctx.createRadialGradient(38, 84, 2, 38, 84, 34);
        sg.addColorStop(0, 'rgba(255,230,180,0.9)');
        sg.addColorStop(1, 'rgba(255,120,80,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(0, 0, 128, 128);
      }
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    if (i === 2 || i === 3) {
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      for (let k = 0; k < 8; k++) ctx.fillRect(rand() * 128, rand() * 128, 16, 1);
    }
    faces.push(c);
  }
  const cube = new THREE.CubeTexture(faces);
  cube.colorSpace = THREE.SRGBColorSpace;
  cube.needsUpdate = true;
  return cube;
}

export function makeSkyDome() {
  const geo = new THREE.SphereGeometry(900, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color('#14102e') },
      midColor: { value: new THREE.Color('#5c2957') },
      horizonColor: { value: new THREE.Color('#ff9a62') },
      sunColor: { value: new THREE.Color('#ffe1a8') },
      sunDir: { value: new THREE.Vector3(0.28, 0.09, 0.95).normalize() },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      uniform vec3 sunColor;
      uniform vec3 sunDir;
      varying vec3 vWorldPosition;

      void main() {
        vec3 dir = normalize(vWorldPosition);
        float h = clamp(dir.y, -0.15, 1.0);
        float t = clamp(h * 1.5, 0.0, 1.0);
        vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.45, t));
        col = mix(col, topColor, smoothstep(0.42, 1.0, t));
        float sun = pow(max(dot(dir, sunDir), 0.0), 90.0);
        col += sunColor * sun * 1.8;
        float halo = pow(max(dot(dir, sunDir), 0.0), 8.0);
        col += sunColor * halo * 0.22;
        // subtle dusk cloud bands
        float band = sin(dir.y * 22.0 + dir.x * 5.0) * 0.5 + 0.5;
        col += vec3(0.11, 0.03, 0.09) * band * smoothstep(0.02, 0.3, dir.y) * (1.0 - smoothstep(0.3, 0.7, dir.y));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mat2 = mat;
  const mesh = new THREE.Mesh(geo, mat2);
  mesh.frustumCulled = false;
  return mesh;
}
