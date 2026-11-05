import * as THREE from 'three';

const fmtTime = (ms) => {
  if (ms == null) return '--:--.--';
  const total = Math.max(0, ms) / 1000;
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  const cs = Math.floor((total * 100) % 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
};

export class Hud {
  constructor(track, opponentColors) {
    this.track = track;
    this.opponentColors = opponentColors;
    this.el = {
      lapNum: document.getElementById('lap-num'),
      lapTotal: document.getElementById('lap-total'),
      lapTime: document.getElementById('lap-time'),
      best: document.getElementById('best-time'),
      last: document.getElementById('last-time'),
      pos: document.getElementById('pos'),
      posTotal: document.getElementById('pos-total'),
      raceTime: document.getElementById('race-time'),
      message: document.getElementById('message'),
      speed: document.getElementById('speed-value'),
      gear: document.getElementById('gear-value'),
      nitro: document.getElementById('nitro-fill'),
      nitroPct: document.getElementById('nitro-pct'),
      audio: document.getElementById('audio-state'),
      cam: document.getElementById('cam-state'),
      results: document.getElementById('results'),
      resultTime: document.getElementById('result-time'),
      resultBest: document.getElementById('result-best'),
      resultPlace: document.getElementById('result-place'),
    };
    this.speedo = document.getElementById('speedo');
    this.sctx = this.speedo.getContext('2d');
    this.speedW = 280;
    this.speedH = 280;
    this.speedo.width = this.speedW * 2;
    this.speedo.height = this.speedH * 2;
    this.sctx.scale(2, 2);

    this.map = document.getElementById('minimap');
    this.mctx = this.map.getContext('2d');
    this.mapW = 190;
    this.mapH = 130;
    this.map.width = this.mapW * 2;
    this.map.height = this.mapH * 2;
    this.mctx.scale(2, 2);
    this.buildMapStatic();

    this.messageTimer = 0;
    this.flashTimer = 0;
    this.finishVisible = false;
  }

  setMessage(text, duration = 0, className = '') {
    const el = this.el.message;
    el.textContent = text;
    el.className = `message show ${className}`;
    this.messageTimer = duration;
    void el.offsetWidth;
  }

  clearMessage() {
    this.el.message.className = 'message';
  }

  showResults(finalTime, best, place) {
    this.el.results.classList.remove('hidden');
    this.el.resultTime.textContent = fmtTime(finalTime);
    this.el.resultBest.textContent = fmtTime(best);
    this.el.resultPlace.textContent = place;
    this.finishVisible = true;
  }

  hideResults() {
    this.el.results.classList.add('hidden');
    this.finishVisible = false;
  }

  setAudio(text, on) {
    this.el.audio.textContent = text;
    this.el.audio.classList.toggle('live', on);
  }

  setCam(mode) {
    this.el.cam.textContent = mode;
  }

  buildMapStatic() {
    const c = document.createElement('canvas');
    c.width = this.mapW * 2;
    c.height = this.mapH * 2;
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const s of this.track.samples) {
      minX = Math.min(minX, s.p.x);
      maxX = Math.max(maxX, s.p.x);
      minZ = Math.min(minZ, s.p.z);
      maxZ = Math.max(maxZ, s.p.z);
    }
    const pad = 12;
    const scale = Math.min(
      (this.mapW - pad * 2) / (maxX - minX),
      (this.mapH - pad * 2) / (maxZ - minZ)
    );
    const ox = (this.mapW - (maxX - minX) * scale) / 2;
    const oz = (this.mapH - (maxZ - minZ) * scale) / 2;
    this.mapTransform = (x, z) => [
      ox + (x - minX) * scale,
      oz + (z - minZ) * scale,
    ];

    ctx.clearRect(0, 0, this.mapW, this.mapH);
    ctx.fillStyle = 'rgba(7,9,18,0.72)';
    ctx.fillRect(0, 0, this.mapW, this.mapH);
    ctx.strokeStyle = 'rgba(54,242,255,0.9)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(54,242,255,0.8)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    this.track.samples.forEach((s, i) => {
      const [px, py] = this.mapTransform(s.p.x, s.p.z);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Start line tick.
    const f = this.track.frameAt(0);
    const [ax, ay] = this.mapTransform(f.p.x, f.p.z);
    const [bx, by] = this.mapTransform(
      f.p.x + f.side.x * 12,
      f.p.z + f.side.z * 12
    );
    ctx.strokeStyle = '#ff3d7f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    this.mapStatic = c;
  }

  update(state, dt = 1 / 60) {
    const {
      speed,
      laps,
      totalLaps,
      lapTimeMs,
      lastLapMs,
      bestLapMs,
      raceTimeMs,
      position,
      playerYaw,
      playerPos,
      opponents,
      nitro,
      gear,
    } = state;

    this.el.lapNum.textContent = String(Math.min(laps + 1, totalLaps)).padStart(2, '0');
    this.el.lapTotal.textContent = `/ ${totalLaps}`;
    this.el.lapTime.textContent = fmtTime(lapTimeMs);
    this.el.best.textContent = fmtTime(bestLapMs);
    this.el.last.textContent = fmtTime(lastLapMs);
    this.el.pos.textContent = String(position).padStart(2, '0');
    this.el.posTotal.textContent = `/ ${opponents.length + 1}`;
    this.el.raceTime.textContent = fmtTime(raceTimeMs);
    this.el.speed.textContent = String(Math.round(speed));
    this.el.gear.textContent = gear > 0 ? `GEAR ${gear}` : 'GEAR N';

    this.el.nitro.style.width = `${Math.round(nitro * 100)}%`;
    this.el.nitroPct.textContent = `${Math.round(nitro * 100)}%`;

    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.clearMessage();
    }

    this.drawGauge(speed, gear, nitro);
    this.drawMap(playerPos, playerYaw, opponents);
  }

  drawGauge(speed, gear, nitro) {
    const ctx = this.sctx;
    const W = this.speedW;
    const H = this.speedH;
    const cx = W / 2;
    const cy = H / 2 + 6;
    ctx.clearRect(0, 0, W, H);

    const start = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;
    const maxSpeed = 320;
    const radius = 98;

    // Dial backing.
    ctx.save();
    const bg = ctx.createRadialGradient(cx, cy, 20, cx, cy, 130);
    bg.addColorStop(0, 'rgba(10,14,28,0.9)');
    bg.addColorStop(0.75, 'rgba(6,8,18,0.95)');
    bg.addColorStop(1, 'rgba(4,5,12,0.92)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(cx, cy, 130, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(54,242,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 130, 0, Math.PI * 2);
    ctx.stroke();

    // Outer ring.
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 18, start, start + sweep);
    ctx.stroke();

    // Speed ticks.
    for (let v = 0; v <= maxSpeed; v += 20) {
      const t = v / maxSpeed;
      const a = start + sweep * t;
      const isMajor = v % 40 === 0;
      const r0 = radius + 2;
      const r1 = radius + (isMajor ? 12 : 7);
      ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = isMajor ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
      if (v % 80 === 0) {
        ctx.fillStyle = 'rgba(220,240,255,0.75)';
        ctx.font = '600 11px "SF Mono", Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(v), cx + Math.cos(a) * (radius + 30), cy + Math.sin(a) * (radius + 30));
      }
    }

    // NITRO arc just outside.
    ctx.strokeStyle = 'rgba(150,220,255,0.12)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 14, start, start + sweep);
    ctx.stroke();
    if (nitro > 0) {
      ctx.strokeStyle = nitro > 0.3 ? '#2ee8ff' : '#ff3d7f';
      ctx.shadowColor = '#2ee8ff';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 14, start, start + sweep * nitro);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Speed arc.
    const p = Math.min(speed / maxSpeed, 1);
    const grad = ctx.createLinearGradient(cx - 100, cy + 100, cx + 100, cy - 100);
    grad.addColorStop(0, '#36f2ff');
    grad.addColorStop(0.6, '#ffb13d');
    grad.addColorStop(1, '#ff2f86');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#36f2ff';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 18, start, start + sweep * p);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Needle.
    const a = start + sweep * p;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.fillStyle = '#ff2f86';
    ctx.shadowColor = '#ff2f86';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(99, -2.2);
    ctx.lineTo(99, 2.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#e8faff';
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#36f2ff';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();

    // Digital speed.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f4fbff';
    ctx.font = '700 52px "SF Mono", "Menlo", Consolas, monospace';
    ctx.shadowColor = 'rgba(54,242,255,0.85)';
    ctx.shadowBlur = 16;
    ctx.fillText(String(Math.round(speed)), cx, cy + 44);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(150,220,255,0.75)';
    ctx.font = '600 12px "SF Mono", Consolas, monospace';
    ctx.fillText('KM/H', cx, cy + 80);

    // Top caption
    ctx.fillStyle = 'rgba(54,242,255,0.7)';
    ctx.font = '600 10px "SF Mono", Consolas, monospace';
    ctx.letterSpacing = '3px';
    ctx.fillText('SPEED', cx, cy - 64);
  }

  drawMap(playerPos, playerYaw, opponents) {
    const ctx = this.mctx;
    const W = this.mapW;
    const H = this.mapH;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this.mapStatic, 0, 0, W, H);

    const drawDot = (pos, yaw, isPlayer) => {
      const [x, y] = this.mapTransform(pos.x, pos.z);
      if (isPlayer) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-yaw);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#36f2ff';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.lineTo(5, 6);
        ctx.lineTo(0, 3);
        ctx.lineTo(-5, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = '#ff6a3d';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    for (const opp of opponents) drawDot(opp.pos, opp.yaw, false);
    drawDot(playerPos, playerYaw, true);
  }
}
