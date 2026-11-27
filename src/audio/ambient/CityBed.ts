/**
 * The always-on city bed (AMBIENT, 27 Nov 2026): one looping pink-noise buffer through three paths, a low hum, a brighter
 * daytime traffic hiss and a darker night rumble with faint crickets. Moved out of AudioSystem.build so the offline checks can
 * render the real thing; the graph is the one it was, with two changes: the loop is 8 s and crossfaded at its seam (it was 2 s
 * and cut), and the buffer is entered at a random offset.
 */
import { HUM_LOOP_SECONDS, seamlessPink, loopOffset } from './noise';
import type { SourceMutes } from './mutes';

export const HUM_GAIN = 0.05;
export const DAY_BED_GAIN = 0.035;
export const NIGHT_BED_GAIN = 0.05;
export const CRICKET_GAIN = 0.004;
export const AMBIENCE_TC = 2.5;

export interface CityBedOptions {
  night: boolean;
  /** [0, 1) draws for the noise and the entry offset. */
  random: () => number;
  mutes?: SourceMutes;
  /** Overrides the loop buffer (the before/after measurement feeds the old cut loop through the same graph). */
  buffer?: (ctx: BaseAudioContext, sr: number, random: () => number) => AudioBuffer;
}

export class CityBed {
  readonly dayGain: GainNode;
  readonly nightGain: GainNode;
  private readonly humGate: GainNode;
  private readonly cricketGate: GainNode;
  private readonly nodes: AudioNode[] = [];
  private readonly srcs: AudioScheduledSourceNode[] = [];
  private unsub: (() => void) | null = null;

  constructor(private readonly ctx: BaseAudioContext, dest: AudioNode, private readonly opts: CityBedOptions) {
    const now = ctx.currentTime;
    const sr = ctx.sampleRate || 44100;
    const mk = <T extends AudioNode>(n: T): T => { this.nodes.push(n); return n; };
    const gain = (v: number): GainNode => { const g = mk(ctx.createGain()); g.gain.value = v; return g; };
    const filter = (type: BiquadFilterType, hz: number): BiquadFilterNode => { const f = mk(ctx.createBiquadFilter()); f.type = type; f.frequency.value = hz; return f; };

    this.humGate = gain(1);
    this.humGate.connect(dest);
    const buf = opts.buffer ? opts.buffer(ctx, sr, opts.random) : (() => {
      const b = ctx.createBuffer(1, Math.floor(sr * HUM_LOOP_SECONDS), sr);
      b.getChannelData(0).set(seamlessPink(HUM_LOOP_SECONDS, sr, opts.random).subarray(0, b.length));
      return b;
    })();
    const hum = mk(ctx.createBufferSource());
    hum.buffer = buf; hum.loop = true;
    const humFilter = filter('lowpass', 500);
    const humGain = gain(HUM_GAIN);
    hum.connect(humFilter); humFilter.connect(humGain); humGain.connect(this.humGate);

    const dayFilter = filter('bandpass', 1100);
    this.dayGain = gain(opts.night ? 0 : DAY_BED_GAIN);
    hum.connect(dayFilter); dayFilter.connect(this.dayGain); this.dayGain.connect(this.humGate);

    const nightFilter = filter('lowpass', 220);
    this.nightGain = gain(opts.night ? NIGHT_BED_GAIN : 0);
    hum.connect(nightFilter); nightFilter.connect(this.nightGain); this.nightGain.connect(this.humGate);

    // crickets: a 4.3 kHz sine, chopped at 11 Hz, riding on the night bed; its own gate so it can be muted alone
    this.cricketGate = gain(1);
    const cricket = mk(ctx.createOscillator()); cricket.type = 'sine'; cricket.frequency.value = 4300;
    const cricketAmp = gain(CRICKET_GAIN);
    const chirp = mk(ctx.createOscillator()); chirp.type = 'square'; chirp.frequency.value = 11;
    const chirpDepth = gain(CRICKET_GAIN);
    chirp.connect(chirpDepth); chirpDepth.connect(cricketAmp.gain);
    cricket.connect(cricketAmp); cricketAmp.connect(this.cricketGate); this.cricketGate.connect(this.nightGain);

    hum.start(now, loopOffset(buf.duration || HUM_LOOP_SECONDS, opts.random()));
    cricket.start(now); chirp.start(now);
    this.srcs.push(hum, cricket, chirp);

    if (opts.mutes) {
      const m = opts.mutes;
      const sync = (): void => { this.humGate.gain.value = m.gain('hum'); this.cricketGate.gain.value = m.gain('crickets'); };
      sync();
      this.unsub = m.onChange(sync);
    }
  }

  setNight(night: boolean, tc = AMBIENCE_TC): void {
    const now = this.ctx.currentTime;
    this.dayGain.gain.setTargetAtTime(night ? 0 : DAY_BED_GAIN, now, tc);
    this.nightGain.gain.setTargetAtTime(night ? NIGHT_BED_GAIN : 0, now, tc);
  }

  dispose(): void {
    this.unsub?.(); this.unsub = null;
    for (const s of this.srcs) { try { s.stop(); } catch { /* not started */ } }
    for (const n of this.nodes) { try { n.disconnect(); } catch { /* already gone */ } }
  }
}
