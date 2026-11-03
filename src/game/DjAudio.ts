/** Web Audio side of the DJ decks: two looping buffer sources with gain, plus a 20 s shop preview. */
import type { DeckId, DjAudioPort } from './DjGame';

export interface DjHost { ctx: AudioContext; dest: AudioNode }

export const PREVIEW_SECONDS = 20;

export class WebDjAudio implements DjAudioPort {
  private readonly gains: [GainNode, GainNode];
  private readonly buffers: [AudioBuffer | null, AudioBuffer | null] = [null, null];
  private readonly sources: [AudioBufferSourceNode | null, AudioBufferSourceNode | null] = [null, null];
  private readonly out: GainNode;

  constructor(private readonly host: DjHost, level = 0.9) {
    const { ctx, dest } = host;
    this.out = ctx.createGain(); this.out.gain.value = level; this.out.connect(dest);
    this.gains = [ctx.createGain(), ctx.createGain()];
    this.gains.forEach((g) => g.connect(this.out));
  }

  setBuffer(deck: DeckId, buffer: AudioBuffer | null): void { this.stop(deck); this.buffers[deck] = buffer; }

  start(deck: DeckId, offsetSec: number, rate: number): void {
    this.stop(deck);
    const buf = this.buffers[deck];
    if (!buf) return;
    const src = this.host.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    src.playbackRate.value = rate;
    src.connect(this.gains[deck]);
    try { src.start(0, Math.max(0, offsetSec % Math.max(0.01, buf.duration))); } catch { /* ignore */ }
    this.sources[deck] = src;
  }

  stop(deck: DeckId): void {
    const s = this.sources[deck];
    if (s) { try { s.stop(); s.disconnect(); } catch { /* already stopped */ } }
    this.sources[deck] = null;
  }

  setRate(deck: DeckId, rate: number): void { const s = this.sources[deck]; if (s) s.playbackRate.value = rate; }
  setGain(deck: DeckId, gain: number): void { this.gains[deck].gain.setTargetAtTime(gain, this.host.ctx.currentTime, 0.01); }

  dispose(): void { this.stop(0); this.stop(1); try { this.out.disconnect(); } catch { /* ignore */ } }
}

/** One-shot record preview on its own source (shop listening station, "try before you buy"). */
export class RecordPreview {
  private src: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly host: DjHost, private readonly seconds = PREVIEW_SECONDS) {}

  play(buffer: AudioBuffer, onDone?: () => void): void {
    this.stop();
    const { ctx, dest } = this.host;
    const g = ctx.createGain();
    g.gain.value = 0.85; g.connect(dest);
    const s = ctx.createBufferSource();
    s.buffer = buffer; s.connect(g);
    try { s.start(0, 0); s.stop(ctx.currentTime + this.seconds); } catch { /* ignore */ }
    this.src = s; this.gain = g;
    this.timer = setTimeout(() => { this.stop(); onDone?.(); }, this.seconds * 1000);
  }

  stop(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.src) { try { this.src.stop(); this.src.disconnect(); } catch { /* ignore */ } this.src = null; }
    if (this.gain) { try { this.gain.disconnect(); } catch { /* ignore */ } this.gain = null; }
  }

  get playing(): boolean { return this.src !== null; }
}
