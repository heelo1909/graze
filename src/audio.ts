// Generated sound (Web Audio, no files). Silent until unlock() runs inside a user gesture.
type Ctor = typeof AudioContext;

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private lastGraze = 0;
  private noise: AudioBuffer | null = null;

  /** Create or resume the AudioContext. Call from keydown/pointerdown (Safari needs the gesture). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const C: Ctor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
        if (!C) return;
        this.ctx = new C();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
    } catch { /* no audio available; stay silent */ }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  /** boost 0..1: pitch rises with it. Throttled, since graze events arrive every tick. */
  graze(boost: number): void {
    const c = this.live();
    if (!c || c.currentTime - this.lastGraze < 0.07) return;
    this.lastGraze = c.currentTime;
    const b = Math.min(1, Math.max(0, boost));
    this.tone(520 + b * 780, 0.09, 'triangle', 0.16);
  }

  crash(): void {
    const c = this.live();
    if (!c || !this.master) return;
    const t = c.currentTime;
    if (!this.noise) {
      const n = Math.floor(c.sampleRate * 0.5);
      this.noise = c.createBuffer(1, n, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 0.45);
    const g = c.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.5);
    this.tone(110, 0.3, 'sine', 0.35, 40);
  }

  tick(): void { this.tone(440, 0.09, 'square', 0.1); }

  go(): void { this.tone(880, 0.3, 'square', 0.12); }

  win(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.2, undefined, i * 0.1));
  }

  private live(): AudioContext | null {
    return this.ctx && this.master && this.ctx.state === 'running' && !this.muted ? this.ctx : null;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, endFreq?: number, delay = 0): void {
    const c = this.live();
    if (!c || !this.master) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}
