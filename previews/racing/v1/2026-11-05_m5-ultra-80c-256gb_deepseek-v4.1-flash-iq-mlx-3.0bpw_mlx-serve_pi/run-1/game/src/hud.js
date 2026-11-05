const $ = (id) => document.getElementById(id);

function formatTime(ms) {
  if (ms == null || !isFinite(ms) || ms < 0) return '--:--.---';
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const milli = Math.floor(total % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
}

export class Hud {
  constructor(track) {
    this.track = track;
    this.speedEl = $('speed');
    this.gearEl = $('gear');
    this.rpmEl = $('rpmFill');
    this.lapTimeEl = $('lapTime');
    this.bestTimeEl = $('bestTime');
    this.lapNumberEl = $('lapNumber');
    this.positionEl = $('position');
    this.raceTimeEl = $('raceTime');
    this.warningEl = $('offroad');
    this.audioHintEl = $('audioHint');
    this.minimap = $('minimap');
    this.mctx = this.minimap.getContext('2d');

    // minimap transform
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of track.samples) {
      minX = Math.min(minX, s.p.x); maxX = Math.max(maxX, s.p.x);
      minZ = Math.min(minZ, s.p.z); maxZ = Math.max(maxZ, s.p.z);
    }
    const pad = 18;
    const W = this.minimap.width, H = this.minimap.height;
    const spanX = maxX - minX, spanZ = maxZ - minZ;
    const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanZ);
    this.map = {
      x: (x) => pad + (x - minX) * scale + ((W - pad * 2) - spanX * scale) / 2,
      y: (z) => pad + (z - minZ) * scale + ((H - pad * 2) - spanZ * scale) / 2,
    };
    this.minimapPath = track.samples.filter((_, i) => i % 6 === 0);
    this.lastMapDraw = 0;
    this.hintHidden = false;
  }

  setAudioStarted() {
    if (this.hintHidden) return;
    this.hintHidden = true;
    this.audioHintEl.classList.add('hide');
    setTimeout(() => { this.audioHintEl.style.display = 'none'; }, 600);
  }

  update(state) {
    this.speedEl.textContent = Math.round(state.speedKmh);
    this.gearEl.textContent = state.gear;
    this.rpmEl.style.width = `${Math.max(4, Math.min(100, (state.rpm / 8000) * 100))}%`;
    this.lapTimeEl.textContent = formatTime(state.lapMs);
    this.bestTimeEl.textContent = formatTime(state.bestMs);
    this.lapNumberEl.textContent = `LAP ${state.lap}`;
    this.positionEl.textContent = `P${state.position} / ${state.cars}`;
    this.raceTimeEl.textContent = `RACE ${formatTime(state.raceMs).replace(/^0:/, '').slice(0, 7)}`;
    this.warningEl.classList.toggle('show', !!state.offroad);

    const now = performance.now();
    if (now - this.lastMapDraw > 90) {
      this.lastMapDraw = now;
      this.drawMinimap(state.playerPos, state.opponents);
    }
  }

  drawMinimap(playerPos, opponents) {
    const ctx = this.mctx;
    const W = this.minimap.width, H = this.minimap.height;
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = 'rgba(66,245,255,0.75)';
    ctx.shadowColor = 'rgba(66,245,255,0.9)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    this.minimapPath.forEach((s, i) => {
      const x = this.map.x(s.p.x), y = this.map.y(s.p.z);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();

    // start line tick
    const st = this.track.samples[0];
    ctx.strokeStyle = 'rgba(255,180,60,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(this.map.x(st.p.x), this.map.y(st.p.z));
    const nx = this.map.x(st.p.x + st.r.x * 18);
    const ny = this.map.y(st.p.z + st.r.z * 18);
    ctx.lineTo(nx, ny);
    ctx.stroke();
    ctx.restore();

    const dot = (x, z, color, radius, glow) => {
      ctx.save();
      ctx.fillStyle = color;
      ctx.shadowColor = glow;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(this.map.x(x), this.map.y(z), radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    for (const o of opponents || []) dot(o.x, o.z, o.color, 3.2, o.color);
    dot(playerPos.x, playerPos.z, '#ff8a1c', 4.6, '#ff8a1c');
  }
}
