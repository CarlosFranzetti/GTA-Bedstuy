/**
 * BOOMBOX: levels for the bar visualiser and the speaker cones. Two honest sources:
 *  - 'real': read from an AnalyserNode on the page's own audio graph. Only what the page plays itself goes through it (WBSY Talk's voice pack,
 *    the stings). SoundCloud is a cross-origin frame, live streams are media elements without CORS (routing them through an analyser would
 *    silence them) and the Group Chat uses the browser's speech synthesis, which cannot be captured.
 *  - 'sim': a tempo-guess animation driven by play state. It is labelled SIMULATED. Nothing here is called live analysis unless it is.
 * 'idle' when nothing plays. Reduced motion: static bars and no cone pulse.
 */
export const BARS = 16;
export type VizSource = 'real' | 'sim' | 'idle';
export interface Frame { bars: number[]; bass: number; source: VizSource }

const BPM: Array<[RegExp, number]> = [
  [/hip hop|rap|trap/i, 92], [/house|techno|club|electronic/i, 124], [/grime|garage|bass|uk/i, 138], [/soul|funk|disco|boogie/i, 108],
  [/dancehall|reggae|soca|caribbean/i, 98], [/salsa|cumbia|latin|reggaeton/i, 96], [/synth|80s|wave/i, 118], [/rock|indie/i, 128], [/talk|news|public/i, 70],
];
/** A rough tempo for the simulated animation, from the station's genre line. */
export function tempoGuess(genre: string): number {
  for (const [re, bpm] of BPM) if (re.test(genre)) return bpm;
  return 110;
}

const STATIC_SHAPE = Array.from({ length: BARS }, (_, i) => 0.22 + 0.16 * Math.sin(i * 0.55 + 0.8) + 0.08 * Math.cos(i * 1.3));

/** The simulated frame at time t (s). Pure. */
export function simFrame(t: number, bpm: number, playing: boolean, reduced: boolean): Frame {
  if (!playing) return { bars: new Array(BARS).fill(0.04), bass: 0, source: 'idle' };
  if (reduced) return { bars: STATIC_SHAPE.slice(), bass: 0, source: 'sim' };
  const beat = (t * bpm) / 60;
  const ph = beat % 1;
  const kick = Math.pow(1 - ph, 3);
  const bars: number[] = [];
  for (let i = 0; i < BARS; i++) {
    const low = 1 - i / BARS;
    const wob = 0.5 + 0.5 * Math.sin(t * (2.1 + i * 0.37) + i * 1.7);
    bars.push(Math.min(1, 0.12 + 0.5 * low * kick + 0.3 * wob * (0.4 + 0.6 * (1 - low * 0.6))));
  }
  return { bars, bass: kick, source: 'sim' };
}

/** Frame from analyser byte data (frequency domain, 0..255). Pure. */
export function realFrame(data: ArrayLike<number>): Frame {
  const n = data.length;
  const bars: number[] = [];
  const per = Math.max(1, Math.floor(n / BARS));
  let sum = 0;
  for (let i = 0; i < BARS; i++) {
    let m = 0;
    for (let k = 0; k < per; k++) m = Math.max(m, data[Math.min(n - 1, i * per + k)] ?? 0);
    bars.push(m / 255); sum += m;
  }
  let low = 0;
  for (let i = 0; i < Math.min(4, n); i++) low = Math.max(low, data[i]);
  return { bars, bass: low / 255, source: sum / (BARS * 255) > 0.004 ? 'real' : 'idle' };
}

export interface VizState { playing: boolean; bpm: number; analyser: AnalyserNode | null; analysable: boolean }

export class Visualiser {
  private buf: Uint8Array<ArrayBuffer> | null = null;
  private realAt = -1e9;
  constructor(readonly reduced: boolean) {}
  /** `analysable` is true only for stations whose sound goes through the page's own graph. */
  frame(t: number, s: VizState): Frame {
    if (s.analysable && s.analyser) {
      if (!this.buf || this.buf.length !== s.analyser.frequencyBinCount) this.buf = new Uint8Array(s.analyser.frequencyBinCount);
      s.analyser.getByteFrequencyData(this.buf);
      const f = realFrame(this.buf);
      if (f.source === 'real') { this.realAt = t; return this.reduced ? { bars: f.bars, bass: 0, source: 'real' } : f; }
      if (t - this.realAt < 3) return { bars: f.bars, bass: 0, source: 'real' };
    }
    return simFrame(t, s.bpm, s.playing, this.reduced);
  }
}
