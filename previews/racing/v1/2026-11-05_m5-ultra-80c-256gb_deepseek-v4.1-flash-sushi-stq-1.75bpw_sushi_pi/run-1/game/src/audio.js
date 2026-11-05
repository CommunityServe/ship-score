// All audio is synthesised with the Web Audio API: oscillators for the engine,
// procedurally generated noise buffers for exhaust, wind, tires and impacts.
export class Soundscape {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.muted = false;
    this.engineHz = 0;
    this.ready = false;
  }

  createNoiseBuffer(duration = 1.5) {
    const ctx = this.ctx;
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.035 * white) / 1.035;
      data[i] = white * 0.6 + last * 1.6;
    }
    return buffer;
  }

  async start() {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    try {
      await this.ctx.resume();
    } catch (e) {
      // Audio will resume on the next key press if the browser is strict.
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;

    // A soft limiter so stacked engine/tyre/impact layers don't clip.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -18;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 5;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.18;
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    // Engine tone: three detuned oscillators through distortion + filter.
    this.engineOut = ctx.createGain();
    this.engineOut.gain.value = 0.0;
    this.engineOut.connect(this.master);

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 520;
    this.engineFilter.Q.value = 1.1;

    this.distortion = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / curve.length) * 2 - 1;
      curve[i] = Math.tanh(x * 2.4);
    }
    this.distortion.curve = curve;
    this.distortion.oversample = '2x';

    this.oscGains = [];
    this.oscillators = [];
    const specs = [
      { type: 'sawtooth', detune: 0, gain: 0.6, mult: 1 },
      { type: 'square', detune: 11, gain: 0.18, mult: 2.01 },
      { type: 'triangle', detune: -7, gain: 0.38, mult: 0.5 },
    ];
    for (const spec of specs) {
      const osc = ctx.createOscillator();
      osc.type = spec.type;
      osc.frequency.value = 48;
      osc.detune.value = spec.detune;
      const gain = ctx.createGain();
      gain.gain.value = spec.gain;
      osc.connect(gain);
      gain.connect(this.engineFilter);
      osc.start();
      this.oscillators.push({ osc, mult: spec.mult });
      this.oscGains.push(gain);
    }
    this.engineFilter.connect(this.distortion);
    this.distortion.connect(this.engineOut);

    // Exhaust rumble: filtered brown-ish noise.
    const noiseBuffer = this.createNoiseBuffer(2);
    this.noiseBuffer = noiseBuffer;
    this.exhaust = ctx.createBufferSource();
    this.exhaust.buffer = noiseBuffer;
    this.exhaust.loop = true;

    this.exhaustFilter = ctx.createBiquadFilter();
    this.exhaustFilter.type = 'lowpass';
    this.exhaustFilter.frequency.value = 330;
    this.exhaustFilter.Q.value = 0.7;
    this.exhaustGain = ctx.createGain();
    this.exhaustGain.gain.value = 0.10;
    this.exhaust.connect(this.exhaustFilter);
    this.exhaustFilter.connect(this.exhaustGain);
    this.exhaustGain.connect(this.engineOut);
    this.exhaust.start();

    // Tire screech.
    this.tire = ctx.createBufferSource();
    this.tire.buffer = noiseBuffer;
    this.tire.loop = true;
    this.tireFilter = ctx.createBiquadFilter();
    this.tireFilter.type = 'bandpass';
    this.tireFilter.frequency.value = 1900;
    this.tireFilter.Q.value = 2.5;
    this.tireGain = ctx.createGain();
    this.tireGain.gain.value = 0.0;
    this.tire.connect(this.tireFilter);
    this.tireFilter.connect(this.tireGain);
    this.tireGain.connect(this.master);
    this.tire.start();

    // Wind / air rush at speed.
    this.wind = ctx.createBufferSource();
    this.wind.buffer = noiseBuffer;
    this.wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 900;
    this.windFilter.Q.value = 0.55;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0;
    this.wind.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    this.wind.start();

    this.started = true;
    this.ready = true;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.6, this.ctx.currentTime, 0.05);
    }
  }

  beep(frequency = 660, duration = 0.12, gainValue = 0.1) {
    if (!this.started) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(gainValue, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  crash(intensity = 1) {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const burst = ctx.createBufferSource();
    burst.buffer = this.noiseBuffer;
    burst.playbackRate.value = 0.75 + Math.random() * 0.5;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700 + intensity * 500;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.14 * intensity, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    burst.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    burst.start(now);
    burst.stop(now + 0.4);

    const thud = ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(90, now);
    thud.frequency.exponentialRampToValueAtTime(35, now + 0.2);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.0001, now);
    tg.gain.exponentialRampToValueAtTime(0.16 * intensity, now + 0.01);
    tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    thud.connect(tg);
    tg.connect(this.master);
    thud.start(now);
    thud.stop(now + 0.28);
  }

  update(dt, { speed = 0, throttle = 0, slip = 0, braking = 0, boosting = 0 } = {}) {
    if (!this.started || !this.ctx) return;
    const now = this.ctx.currentTime;
    const speedNorm = Math.min(speed / 320, 1);

    // Engine pitch tracks speed (with a tiny rev flutter).
    const targetHz = 44 + speedNorm * 118 + throttle * 8 + boosting * 12;
    this.engineHz += (targetHz - this.engineHz) * Math.min(1, dt * 4);
    const flutter = Math.sin(performance.now() * 0.011) * 1.2 * (0.3 + throttle);
    for (const { osc, mult } of this.oscillators) {
      osc.frequency.setTargetAtTime(this.engineHz * mult + flutter, now, 0.03);
    }

    const engineVolume = 0.13 + throttle * 0.05 + speedNorm * 0.10 + boosting * 0.04;
    this.engineOut.gain.setTargetAtTime(engineVolume, now, 0.08);

    const cutoff = 320 + speedNorm * 900 + throttle * 700 + boosting * 1000;
    this.engineFilter.frequency.setTargetAtTime(cutoff, now, 0.08);

    const exhaustVolume = 0.08 + throttle * 0.10 + speedNorm * 0.03;
    this.exhaustGain.gain.setTargetAtTime(exhaustVolume, now, 0.1);
    this.exhaustFilter.frequency.setTargetAtTime(260 + speedNorm * 180 + throttle * 120, now, 0.1);
    this.exhaust.playbackRate.setTargetAtTime(0.8 + speedNorm * 0.6, now, 0.1);

    const windVolume = speedNorm * speedNorm * 0.09;
    this.windGain.gain.setTargetAtTime(windVolume, now, 0.15);
    this.windFilter.frequency.setTargetAtTime(550 + speedNorm * 1300, now, 0.15);

    // Tire screech when sliding sideways or when brakes lock hard.
    const slideNorm = Math.min(slip / 9, 1);
    const tireVolume = speed > 10 ? (slideNorm * 0.11 + (braking ? 0.02 : 0)) : 0;
    this.tireGain.gain.setTargetAtTime(tireVolume, now, 0.05);
    this.tireFilter.frequency.setTargetAtTime(1600 + slideNorm * 1300, now, 0.1);
  }

  getDebug() {
    return {
      started: this.started,
      state: this.ctx ? this.ctx.state : 'none',
      engineHz: Number(this.engineHz.toFixed(1)),
      muted: this.muted,
    };
  }
}
