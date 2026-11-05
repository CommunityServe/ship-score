/**
 * Fully procedural WebAudio engine. Nothing is loaded from disk.
 * The engine drone's pitch and volume track the car's velocity, with a
 * separate wind-noise layer that swells in the high-speed sections.
 */
export class EngineAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engine = null;
    this.subEngine = null;
    this.wind = null;
    this.windFilter = null;
    this.engineFilter = null;
    this.started = false;
    this.muted = false;
    this.lastSpeed = 0;
  }

  makeNoiseBuffer(ctx) {
    const seconds = 2.0;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let random = 0.0;
    for (let i = 0; i < data.length; i++) {
      // Box-filtered brown noise gives a convincing wind / gravel texture.
      random = random * 0.94 + (Math.random() * 2 - 1) * 0.24;
      data[i] = random;
    }
    return buffer;
  }

  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    // Main engine drone: a sawtooth wound through a low-pass filter.
    this.engine = ctx.createOscillator();
    this.engine.type = 'sawtooth';
    this.engine.frequency.value = 45;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineFilter.Q.value = 2;
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0.08;
    this.engine.connect(this.engineFilter);
    this.engineFilter.connect(engineGain);
    engineGain.connect(this.master);

    // A bright overtone that gives the impression of acceleration.
    this.subEngine = ctx.createOscillator();
    this.subEngine.type = 'triangle';
    this.subEngine.frequency.value = 70;
    const subFilter = ctx.createBiquadFilter();
    subFilter.type = 'bandpass';
    subFilter.frequency.value = 650;
    subFilter.Q.value = 3;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.012;
    this.subEngine.connect(subFilter);
    subFilter.connect(subGain);
    subGain.connect(this.master);

    // Wind layer made from generated buffered noise.
    const noise = this.makeNoiseBuffer(ctx);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'highpass';
    this.windFilter.frequency.value = 600;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.0;
    src.connect(this.windFilter);
    this.windFilter.connect(windGain);
    windGain.connect(this.master);
    src.start();
    this.wind = { src, gain: windGain };

    this.engine.start();
    this.subEngine.start();

    // Keep the oscillators alive so we can update their pitch every frame.
    this.engineGain = engineGain;
    this.subGain = subGain;
    this.started = true;
    this.applySpeed(this.lastSpeed);
    if (ctx.state === 'suspended') ctx.resume();
  }

  setSpeed(speedKmh) {
    if (!this.started) return;
    this.lastSpeed = speedKmh;
  }

  applySpeed(speedKmh) {
    if (!this.started || this.muted) return;
    const ctx = this.ctx;
    const norm = Math.min(Math.max(speedKmh, 0), 260) / 260;

    const engineFreq = 34 + norm * 180 + Math.sin(ctx.currentTime * 0.2) * 2;
    this.engine.frequency.setTargetAtTime(engineFreq, ctx.currentTime, 0.18);
    this.subEngine.frequency.setTargetAtTime(44 + norm * 260, ctx.currentTime, 0.18);

    this.engineFilter.frequency.setTargetAtTime(180 + norm * 620, ctx.currentTime, 0.2);
    this.engineGain.gain.setTargetAtTime(0.035 + norm * 0.14 + Math.pow(norm, 2) * 0.04, ctx.currentTime, 0.25);
    this.subGain.gain.setTargetAtTime(0.005 + Math.pow(norm, 2) * 0.03, ctx.currentTime, 0.25);

    // Wind noise tracks speed, not acceleration, so braking is clearly audible.
    this.wind.gain.gain.setTargetAtTime(Math.pow(norm, 1.8) * 0.11, ctx.currentTime, 0.25);
    this.windFilter.frequency.setTargetAtTime(500 + norm * 900, ctx.currentTime, 0.2);
  }

  mute() {
    this.muted = !this.muted;
    if (!this.started) return;
    this.master.gain.setTargetAtTime(this.muted ? 0.0 : 0.9, this.ctx.currentTime, 0.1);
  }

  suspend() {
    if (this.started && this.ctx.state === 'running') {
      this.ctx.suspend();
    }
  }
}
