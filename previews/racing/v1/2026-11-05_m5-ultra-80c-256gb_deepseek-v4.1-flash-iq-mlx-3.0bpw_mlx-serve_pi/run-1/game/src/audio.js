// Procedural engine audio: every sound is synthesised with Web Audio.
// No audio files exist in the project.

function makeNoiseBuffer(ctx, seconds, seed = 1) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let s = seed >>> 0;
  for (let i = 0; i < len; i++) {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    data[i] = r * 2 - 1;
  }
  return buffer;
}

export class EngineAudio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.master = null;
    this.analyser = null;
    this.levelValue = 0;
    this.lastGear = 1;
    this.shiftFlash = 0;
  }

  async start() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC({ latencyHint: 'interactive' });
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.master.connect(this.analyser);
    this.master.connect(ctx.destination);

    // --- engine harmonic bank ---
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 900;
    this.engineFilter.Q.value = 1.2;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);

    const harmonics = [
      { ratio: 1.0, type: 'sawtooth', gain: 0.5, detune: 0 },
      { ratio: 2.01, type: 'square', gain: 0.3, detune: 6 },
      { ratio: 0.5, type: 'triangle', gain: 0.5, detune: -3 },
      { ratio: 3.02, type: 'sawtooth', gain: 0.14, detune: -8 },
      { ratio: 4.13, type: 'sawtooth', gain: 0.08, detune: 12 },
    ];
    this.oscs = harmonics.map((h) => {
      const osc = ctx.createOscillator();
      osc.type = h.type;
      osc.frequency.value = 60 * h.ratio;
      osc.detune.value = h.detune;
      const g = ctx.createGain();
      g.gain.value = h.gain;
      osc.connect(g);
      g.connect(this.engineFilter);
      osc.start();
      return { osc, gain: g, ratio: h.ratio };
    });

    // --- exhaust rumble noise ---
    const rumbleBuffer = makeNoiseBuffer(ctx, 3, 17);
    this.rumbleSrc = ctx.createBufferSource();
    this.rumbleSrc.buffer = rumbleBuffer;
    this.rumbleSrc.loop = true;
    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'lowpass';
    this.rumbleFilter.frequency.value = 260;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0.0;
    this.rumbleSrc.connect(this.rumbleFilter);
    this.rumbleFilter.connect(this.rumbleGain);
    this.rumbleGain.connect(this.master);
    this.rumbleSrc.start();

    // --- tyre noise (squeal / road roar) ---
    const tyreBuffer = makeNoiseBuffer(ctx, 3, 91);
    this.tyreSrc = ctx.createBufferSource();
    this.tyreSrc.buffer = tyreBuffer;
    this.tyreSrc.loop = true;
    this.tyreFilter = ctx.createBiquadFilter();
    this.tyreFilter.type = 'bandpass';
    this.tyreFilter.frequency.value = 2100;
    this.tyreFilter.Q.value = 1.4;
    this.tyreGain = ctx.createGain();
    this.tyreGain.gain.value = 0.0;
    this.tyreSrc.connect(this.tyreFilter);
    this.tyreFilter.connect(this.tyreGain);
    this.tyreGain.connect(this.master);
    this.tyreSrc.start();

    // --- wind noise ---
    const windBuffer = makeNoiseBuffer(ctx, 3, 23);
    this.windSrc = ctx.createBufferSource();
    this.windSrc.buffer = windBuffer;
    this.windSrc.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'highpass';
    this.windFilter.frequency.value = 3200;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0;
    this.windSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    this.windSrc.start();

    // --- turbo whistle, rises with rpm ---
    this.turbo = ctx.createOscillator();
    this.turbo.type = 'sine';
    this.turbo.frequency.value = 500;
    this.turboGain = ctx.createGain();
    this.turboGain.gain.value = 0.0;
    this.turbo.connect(this.turboGain);
    this.turboGain.connect(this.master);
    this.turbo.start();

    this.ready = true;
    return true;
  }

  update({ speedKmh, rpm, throttle, brake, drift, offroad, gear }) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const t = 0.045;

    const base = 34 + rpm * 0.038; // Hz, scales with revs
    for (const o of this.oscs) {
      o.osc.frequency.setTargetAtTime(base * o.ratio, now, t);
      const load = throttle * 0.75 + (1 - throttle) * 0.35;
      o.gain.gain.setTargetAtTime(load * (o.ratio <= 1.5 ? 0.9 : 0.55), now, t);
    }

    const cutoff = 260 + rpm * 0.32 + throttle * 500;
    this.engineFilter.frequency.setTargetAtTime(cutoff, now, 0.07);

    let engineLevel = 0.10 + throttle * 0.22 + Math.min(speedKmh / 240, 1) * 0.08;
    if (offroad) engineLevel *= 0.9;
    this.engineGain.gain.setTargetAtTime(engineLevel, now, 0.05);

    this.rumbleFilter.frequency.setTargetAtTime(110 + rpm * 0.025, now, 0.08);
    this.rumbleGain.gain.setTargetAtTime(0.03 + throttle * 0.10 + Math.min(speedKmh / 240, 1) * 0.04, now, 0.06);

    const sp = Math.min(speedKmh / 240, 1);
    const tyreLevel = sp * sp * 0.12 + drift * 0.14;
    this.tyreFilter.frequency.setTargetAtTime(1600 + sp * 700 + drift * 700, now, 0.06);
    this.tyreGain.gain.setTargetAtTime(tyreLevel, now, 0.06);

    this.windGain.gain.setTargetAtTime(sp * sp * 0.20, now, 0.08);
    this.windFilter.frequency.setTargetAtTime(2600 + sp * 4200, now, 0.08);

    this.turbo.frequency.setTargetAtTime(420 + rpm * 0.09, now, 0.09);
    this.turboGain.gain.setTargetAtTime(Math.max(0, rpm - 4200) / 4000 * 0.035, now, 0.08);

    if (gear !== this.lastGear) {
      this.lastGear = gear;
      this.shiftFlash = 0.16;
    }
    if (this.shiftFlash > 0) {
      this.shiftFlash -= 0.016;
      this.engineGain.gain.setTargetAtTime(engineLevel * 0.45, now, 0.02);
    }

    // brake squeal: short high band noise when braking hard at speed
    if (brake && speedKmh > 35) {
      this.tyreGain.gain.setTargetAtTime(tyreLevel + 0.05, now, 0.04);
    }
  }

  level() {
    if (!this.analyser) return 0;
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    this.levelValue = Math.sqrt(sum / data.length);
    return this.levelValue;
  }

  state() {
    return {
      ready: this.ready,
      contextState: this.ctx ? this.ctx.state : 'none',
      sampleRate: this.ctx ? this.ctx.sampleRate : 0,
      level: this.level(),
      gear: this.lastGear,
      oscHz: this.oscs && this.oscs[0] ? this.oscs[0].osc.frequency.value : 0,
      engineGain: this.engineGain ? this.engineGain.gain.value : 0,
    };
  }
}
