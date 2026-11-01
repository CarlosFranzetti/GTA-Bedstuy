/**
 * A deck plays one user file through an HTMLAudioElement routed into the radio gain bus
 * (MediaElementSource -> fade gain -> radioBus), so the radio volume, mute and pause rules apply.
 * Two decks give the 0.5 s cross-fade between tracks.
 */

export interface Deck {
  /** Starts a file at an offset (seconds). */
  load(url: string, offset: number): void;
  stop(): void;
  pause(): void;
  resume(): void;
  /** Ramps the deck gain to `level` over `seconds`. */
  fadeTo(level: number, seconds: number): void;
  /** Called when the file ends or fails. */
  onEnded: (() => void) | null;
  onError: (() => void) | null;
  onDuration: ((seconds: number) => void) | null;
  /** Makes later programmatic play() allowed (iOS Safari): call inside a user gesture. */
  unlock(): void;
  readonly playing: boolean;
}

/** One silent 0.1 s mono 8 kHz WAV, used to unlock audio elements on iOS inside the first user gesture. */
export function silentWavDataUri(): string {
  const samples = 800;
  const buf = new Uint8Array(44 + samples);
  const dv = new DataView(buf.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + samples, true); str(8, 'WAVE'); str(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
  str(36, 'data'); dv.setUint32(40, samples, true);
  buf.fill(128, 44);
  let bin = '';
  for (const b of buf) bin += String.fromCharCode(b);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

export class HtmlAudioDeck implements Deck {
  onEnded: (() => void) | null = null;
  onError: (() => void) | null = null;
  onDuration: ((seconds: number) => void) | null = null;
  private readonly el: HTMLAudioElement;
  private readonly gain: GainNode;
  private token = 0;
  private wantPlay = false;

  constructor(private readonly ctx: AudioContext, dest: AudioNode, make: () => HTMLAudioElement = () => new Audio()) {
    this.el = make();
    this.el.preload = 'auto';
    this.el.setAttribute?.('playsinline', '');
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    const src = ctx.createMediaElementSource(this.el);
    src.connect(this.gain);
    this.gain.connect(dest);
    this.el.addEventListener('ended', () => { this.wantPlay = false; this.onEnded?.(); });
    this.el.addEventListener('error', () => {
      if (this.el.getAttribute('src')) { this.wantPlay = false; this.onError?.(); }
    });
    this.el.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(this.el.duration) && this.el.duration > 0) this.onDuration?.(this.el.duration);
    });
  }

  get playing(): boolean { return this.wantPlay && !this.el.paused; }

  load(url: string, offset: number): void {
    const my = ++this.token;
    this.wantPlay = true;
    const el = this.el;
    el.src = url;
    el.load();
    const begin = () => {
      if (my !== this.token) return;
      try { if (offset > 0.05 && (!Number.isFinite(el.duration) || offset < el.duration - 0.2)) el.currentTime = offset; } catch { /* not seekable yet */ }
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => { if (my === this.token) { this.wantPlay = false; this.onError?.(); } });
    };
    if (el.readyState >= 1) begin(); else el.addEventListener('loadedmetadata', begin, { once: true });
  }

  stop(): void {
    this.token++;
    this.wantPlay = false;
    try { this.el.pause(); this.el.removeAttribute('src'); this.el.load(); } catch { /* ignore */ }
    this.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.gain.gain.setValueAtTime(0, this.ctx.currentTime);
  }

  pause(): void { try { this.el.pause(); } catch { /* ignore */ } }

  resume(): void {
    if (!this.wantPlay) return;
    const p = this.el.play();
    if (p && typeof p.catch === 'function') p.catch(() => undefined);
  }

  fadeTo(level: number, seconds: number): void {
    const p = this.gain.gain;
    const now = this.ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(level, now + Math.max(0.001, seconds));
  }

  unlock(): void {
    if (this.wantPlay || this.el.getAttribute('src')) return;
    try {
      this.el.src = silentWavDataUri();
      const p = this.el.play();
      const done = () => { if (!this.wantPlay) { try { this.el.pause(); this.el.removeAttribute('src'); } catch { /* ignore */ } } };
      if (p && typeof p.then === 'function') p.then(done, done); else done();
    } catch { /* ignore */ }
  }
}
