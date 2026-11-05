import * as THREE from 'three';

// All textures in this game are painted at runtime into canvases.
// There are no image or audio asset files anywhere in the project.

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function canvasTexture(canvas, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function asphaltTexture() {
  const S = 512;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(1337);

  ctx.fillStyle = '#26272e';
  ctx.fillRect(0, 0, S, S);

  // aggregate speckles
  for (let i = 0; i < 24000; i++) {
    const x = rnd() * S, y = rnd() * S;
    const g = 25 + rnd() * 45;
    ctx.fillStyle = `rgba(${g},${g},${g + 3},${0.25 + rnd() * 0.55})`;
    const size = rnd() < 0.85 ? 1 : 2;
    ctx.fillRect(x, y, size, size);
  }

  // darker tyre wear bands
  for (const cx of [105, 256, 405]) {
    const grad = ctx.createRadialGradient(cx, S / 2, 10, cx, S / 2, 115);
    grad.addColorStop(0, 'rgba(8,8,10,0.22)');
    grad.addColorStop(1, 'rgba(8,8,10,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);
  }

  // cracks
  for (let i = 0; i < 22; i++) {
    let x = rnd() * S, y = rnd() * S;
    ctx.strokeStyle = 'rgba(10,10,12,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      x += (rnd() - 0.5) * 26;
      y += (rnd() - 0.5) * 26;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // oil stains
  for (let i = 0; i < 9; i++) {
    const x = rnd() * S, y = rnd() * S;
    const grad = ctx.createRadialGradient(x, y, 2, x, y, 18 + rnd() * 30);
    grad.addColorStop(0, 'rgba(4,4,6,0.35)');
    grad.addColorStop(1, 'rgba(4,4,6,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);
  }

  // road markings: the ribbon maps U across the road, V along the road.
  ctx.fillStyle = 'rgba(228,225,211,0.62)';
  ctx.fillRect(15, 0, 7, S);       // left edge line
  ctx.fillRect(S - 22, 0, 7, S);   // right edge line
  ctx.fillStyle = 'rgba(235,232,218,0.72)';
  ctx.fillRect(S / 2 - 3, 52, 6, 220); // centre dash
  ctx.fillStyle = 'rgba(235,232,218,0.72)';
  ctx.fillRect(S / 2 - 3, 52 + 320, 6, 120); // short dash for busier pattern

  const tex = canvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  return tex;
}

export function curbTexture() {
  const S = 128;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c2362f';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#e6e1d2';
  ctx.save();
  ctx.translate(0, 0);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(S, 0);
  ctx.lineTo(0, S);
  ctx.lineTo(0, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(S, S);
  ctx.lineTo(S, 0);
  ctx.lineTo(0, S);
  ctx.fill();
  ctx.restore();
  // grime
  const rnd = mulberry32(77);
  ctx.fillStyle = 'rgba(20,16,14,0.28)';
  for (let i = 0; i < 500; i++) ctx.fillRect(rnd() * S, rnd() * S, 1, 2);
  const tex = canvasTexture(c);
  return tex;
}

export function groundTexture() {
  const S = 512;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(4242);
  ctx.fillStyle = '#0d1316';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 16000; i++) {
    const x = rnd() * S, y = rnd() * S;
    const g = rnd();
    ctx.fillStyle = g < 0.6
      ? `rgba(${8 + rnd() * 14},${18 + rnd() * 20},${14 + rnd() * 16},0.5)`
      : `rgba(${28 + rnd() * 20},${30 + rnd() * 20},${38 + rnd() * 20},0.35)`;
    ctx.fillRect(x, y, rnd() < 0.7 ? 1 : 3, rnd() < 0.7 ? 1 : 2);
  }
  // faint concrete slabs
  ctx.strokeStyle = 'rgba(80,95,115,0.10)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    ctx.strokeRect(i * 64, i * 64, 64, 64);
  }
  const tex = canvasTexture(c, 18, 18);
  return tex;
}

export function facadeTexture(seed = 99) {
  const S = 512;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.fillStyle = '#080a12';
  ctx.fillRect(0, 0, S, S);

  const cells = 16;
  const cell = S / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const px = x * cell, py = y * cell;
      ctx.fillStyle = '#111421';
      ctx.fillRect(px + 2, py + 2, cell - 4, cell - 4);
      const lit = rnd() < 0.48;
      if (lit) {
        const warm = rnd() < 0.55;
        const r = warm ? 255 : 60 + rnd() * 50;
        const g = warm ? 170 + rnd() * 45 : 215 + rnd() * 30;
        const b = warm ? 80 + rnd() * 40 : 255;
        const alpha = 0.5 + rnd() * 0.4;
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fillRect(px + 5, py + 5, cell - 10, cell - 10);
      } else if (rnd() < 0.2) {
        ctx.fillStyle = 'rgba(30,70,120,0.28)';
        ctx.fillRect(px + 5, py + 5, cell - 10, cell - 10);
      }
    }
  }
  const tex = canvasTexture(c);
  return tex;
}

export function brushedMetalTexture() {
  const S = 128;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(2024);
  ctx.fillStyle = '#d2d2d8';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 4000; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const v = 150 + rnd() * 90;
    ctx.fillStyle = `rgba(${v},${v},${v + 4},${0.10 + rnd() * 0.18})`;
    ctx.fillRect(x, y, 1, 6 + rnd() * 10);
  }
  const tex = canvasTexture(c, 2, 2);
  return tex;
}

export function glowTexture() {
  const S = 128;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.65)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function checkerTexture() {
  const S = 256;
  const c = makeCanvas(S, S / 4);
  const ctx = c.getContext('2d');
  const cols = 16, rows = 4;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#15161c' : '#e8e6df';
      ctx.fillRect(x * (S / cols), y * (S / rows), S / cols, S / rows);
    }
  }
  const tex = canvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function billboardTexture(text, accent = '#42f5ff') {
  const W = 768, H = 256;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#05060d';
  ctx.fillRect(0, 0, W, H);

  // frame
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 24;
  ctx.strokeRect(10, 10, W - 20, H - 20);

  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 34;
  ctx.font = '900 120px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2 - 6);

  ctx.shadowBlur = 10;
  ctx.font = '700 26px "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText('SECTOR 9  //  MIDNIGHT RUN', W / 2, H - 42);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function bannerTexture() {
  const W = 1024, H = 160;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#080a16';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#42f5ff';
  ctx.shadowColor = '#42f5ff';
  ctx.shadowBlur = 28;
  ctx.font = '900 78px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NIGHT SHIFT  //  START · FINISH', W / 2, H / 2);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ff8a1c';
  ctx.fillRect(0, H - 10, W, 10);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function skyTexture() {
  const W = 2048, H = 1024;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(9001);

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#04040f');
  grad.addColorStop(0.35, '#080a22');
  grad.addColorStop(0.62, '#1a1035');
  grad.addColorStop(0.80, '#341a45');
  grad.addColorStop(0.90, '#4a2148');
  grad.addColorStop(1, '#1b1026');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // stars
  for (let i = 0; i < 900; i++) {
    const x = rnd() * W;
    const y = rnd() * H * 0.75;
    const a = rnd() * 0.8 + 0.1;
    ctx.fillStyle = `rgba(220,235,255,${a})`;
    const s = rnd() < 0.9 ? 1 : 2;
    ctx.fillRect(x, y, s, s);
  }

  // faint nebula bands
  for (let i = 0; i < 8; i++) {
    const x = rnd() * W, y = rnd() * H * 0.75;
    const grad2 = ctx.createRadialGradient(x, y, 10, x, y, 160 + rnd() * 240);
    grad2.addColorStop(0, 'rgba(90,100,220,0.06)');
    grad2.addColorStop(1, 'rgba(90,100,220,0)');
    ctx.fillStyle = grad2;
    ctx.fillRect(0, 0, W, H);
  }

  // moon with glow
  const mx = W * 0.68, my = H * 0.19;
  const moonGlow = ctx.createRadialGradient(mx, my, 0, mx, my, 110);
  moonGlow.addColorStop(0, 'rgba(210,230,255,0.5)');
  moonGlow.addColorStop(0.25, 'rgba(170,190,255,0.18)');
  moonGlow.addColorStop(1, 'rgba(150,170,255,0)');
  ctx.fillStyle = moonGlow;
  ctx.fillRect(mx - 130, my - 130, 260, 260);
  ctx.fillStyle = '#dce6ff';
  ctx.beginPath();
  ctx.arc(mx, my, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(140,160,200,0.5)';
  ctx.beginPath();
  ctx.arc(mx - 7, my + 4, 5, 0, Math.PI * 2);
  ctx.arc(mx + 9, my - 6, 4, 0, Math.PI * 2);
  ctx.fill();

  // horizon city glow
  const horizon = ctx.createLinearGradient(0, H * 0.86, 0, H);
  horizon.addColorStop(0, 'rgba(255,90,160,0)');
  horizon.addColorStop(1, 'rgba(255,70,130,0.30)');
  ctx.fillStyle = horizon;
  ctx.fillRect(0, H * 0.86, W, H * 0.14);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}
