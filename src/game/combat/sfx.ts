/**
 * Synthesised sounds for the hands: whoosh, punch, thud, glass, pistol crack, tick, dry click, reload, pickup chime.
 * Everything is made here from noise and oscillators (no audio files) and sent to the sound-effects bus
 * (`audio.sfxHost` gives `{ ctx, dest }`; it is null until the first gesture, so every call is a quiet no-op until then).
 */
/**
 * How loud each sound is, as a multiplier on the gains below. Measured offline (scripts/combat-sfx-render.mjs: an OfflineAudioContext,
 * ffmpeg ebur128): the gunshot is the loudest and peaks at about -2.5 dBFS (the noise bursts start at a random offset, so a run varies by about 1 dB); the rest sit 7 to 13 dB under it (momentary loudness).
 */
export const LEVELS = {
  whoosh: 5.1, punch: 0.43, punchHeavy: 0.33, thud: 0.46, carThud: 0.33, glass: 0.34, crack: 0.52, tick: 0.65, click: 2.55, reload: 1.87, pickup: 0.75, throwAway: 6.7,
} as const;

export interface SfxHost { ctx: AudioContext; dest: AudioNode }

/** What Combat plays. Tests pass a recorder with the same shape. */
export interface CombatSounds {
  whoosh(): void;
  punch(heavy: boolean): void;
  thud(): void;
  /** a fist or a brick on sheet metal: a hollow bonk */
  carThud(): void;
  glass(): void;
  crack(): void;
  tick(): void;
  click(): void;
  reload(): void;
  pickup(): void;
  throwAway(): void;
}

export class CombatSfx implements CombatSounds {
  private noise: AudioBuffer | null = null;
  private noiseCtx: BaseAudioContext | null = null;

  /** the level multiplier of the sound being made (LEVELS); nested sounds multiply */
  private level = 1;
  private lv(k: number, fn: () => void): void { const prev = this.level; this.level = prev * k; try { fn(); } finally { this.level = prev; } }

  constructor(private readonly host: () => SfxHost | null) {}

  private env(): { ctx: AudioContext; out: AudioNode; t: number } | null {
    const h = this.host();
    if (!h || h.ctx.state === 'closed') return null;
    return { ctx: h.ctx, out: h.dest, t: h.ctx.currentTime };
  }

  private noiseBuf(ctx: AudioContext): AudioBuffer {
    if (!this.noise || this.noiseCtx !== ctx) {
      const n = Math.floor(ctx.sampleRate * 1.0);
      const b = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = b.getChannelData(0);
      let s = 12345;
      for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = (s / 0x100000000) * 2 - 1; }
      this.noise = b; this.noiseCtx = ctx;
    }
    return this.noise;
  }

  /** A filtered noise burst with an exponential decay. */
  private burst(type: BiquadFilterType, f0: number, f1: number, dur: number, gain: number, q = 0.8, delay = 0): void {
    const e = this.env(); if (!e) return;
    const { ctx, out } = e; const t = e.t + delay;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf(ctx);
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t); flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain * this.level, t + Math.min(0.006, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(out);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }

  /** A pitched tone sweeping from f0 to f1. */
  private tone(wave: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay = 0): void {
    const e = this.env(); if (!e) return;
    const { ctx, out } = e; const t = e.t + delay;
    const o = ctx.createOscillator(); o.type = wave;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain * this.level, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.02);
  }

  whoosh(): void { this.lv(LEVELS.whoosh, () => this.burst('bandpass', 500, 1700, 0.14, 0.16, 1.2)); }
  punch(heavy: boolean): void {
    this.lv(heavy ? LEVELS.punchHeavy : LEVELS.punch, () => {
      this.tone('sine', heavy ? 150 : 180, 55, heavy ? 0.16 : 0.1, heavy ? 0.7 : 0.5);
      this.burst('lowpass', 900, 200, heavy ? 0.12 : 0.07, heavy ? 0.5 : 0.35);
    });
  }
  thud(): void { this.lv(LEVELS.thud, () => { this.tone('sine', 95, 45, 0.14, 0.5); this.burst('lowpass', 500, 150, 0.1, 0.3); }); }
  carThud(): void {
    this.lv(LEVELS.carThud, () => {
      this.tone('sine', 150, 70, 0.16, 0.5);                       // the panel's body
      this.tone('triangle', 260, 230, 0.22, 0.14, 0.004);          // the hollow ring of the sheet metal
      this.burst('bandpass', 1400, 900, 0.05, 0.2, 2);              // the knock
    });
  }
  glass(): void {
    this.lv(LEVELS.glass, () => {
      this.burst('highpass', 3200, 5200, 0.22, 0.32, 0.7);
      for (let i = 0; i < 5; i++) this.tone('sine', 3000 + i * 830 + (i % 2) * 400, 2200 + i * 500, 0.1 + 0.03 * i, 0.07, 0.015 * i);
    });
  }
  crack(): void {
    this.lv(LEVELS.crack, () => {
      this.burst('highpass', 900, 700, 0.05, 0.95, 0.5);               // the sharp edge
      this.tone('sine', 140, 38, 0.2, 0.7);                             // the body of the report
      this.burst('lowpass', 1800, 220, 0.32, 0.22, 0.6, 0.02);          // the tail bouncing off the street
    });
  }
  tick(): void { this.lv(LEVELS.tick, () => { this.tone('triangle', 2300, 1500, 0.05, 0.22); this.burst('highpass', 5000, 6000, 0.03, 0.2); }); }
  private clickBase(): void { this.burst('bandpass', 2600, 2000, 0.025, 0.35, 3); this.tone('square', 700, 500, 0.02, 0.06); }
  click(): void { this.lv(LEVELS.click, () => this.clickBase()); }
  reload(): void {
    this.lv(LEVELS.reload, () => {
      this.clickBase(); this.tone('square', 420, 300, 0.05, 0.08, 0.45);
      this.burst('bandpass', 1500, 1100, 0.04, 0.3, 2, 0.45); this.burst('bandpass', 2400, 1800, 0.03, 0.35, 3, 1.05);
    });
  }
  pickup(): void { this.lv(LEVELS.pickup, () => { this.tone('sine', 660, 700, 0.1, 0.12); this.tone('sine', 990, 1020, 0.16, 0.1, 0.08); }); }
  throwAway(): void { this.lv(LEVELS.throwAway, () => this.burst('bandpass', 700, 2200, 0.1, 0.12, 1.5)); }
}
