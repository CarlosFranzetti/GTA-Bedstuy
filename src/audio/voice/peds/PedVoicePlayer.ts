/**
 * Audio backend for the BarkDirector: plays one pedestrian / story line through WebAudio.
 *  - audio from the voice pack, else the clip cache (a line prerendered while idle); never a live render on the spot
 *    (Kokoro is 4 to 7x slower than real time on CPU);
 *  - otherwise SpeechSynthesis with the ped's seeded role slot, pitch and rate;
 *  - otherwise silent (the director still shows the subtitle).
 * Spatial: inverse distance (2 m reference, cut at 25 m by the director) and a distance low-pass, through the `street` fx.
 * Visemes: a 30 Hz envelope of an AnalyserNode on the voice, or syllable timing when the system voice speaks.
 */
import { ClipCache } from '../ClipCache';
import { FxBank, type FxHost } from '../fx';
import type { PackLookup } from '../pack';
import { clipKey, lineSeconds } from '../script';
import { pedRhythmId, planSpeech, shapeClip, type Phrase } from '../prosody';
import { rhythmFor } from '../rhythm';
import type { Clip, TtsEngine } from '../types';
import { pickVoices, type SpeechLike, type UtteranceLike, type VoiceLike } from '../../talk/TalkPlayer';
import type { VoiceRole } from '../../talk/script';
import type { BackendHooks, SpeakJob, SpeechBackend } from './BarkDirector';

export interface PedPlayerEnv {
  ctx: () => AudioContext | null;
  dest: () => AudioNode | null;
  pack: () => PackLookup | null;
  cache: ClipCache;
  engine: () => TtsEngine | null;
  speech: SpeechLike | null;
  makeUtterance: (text: string) => UtteranceLike;
  volume: () => number;
  /** Seconds to wait for pack/cache audio before the system voice takes over. */
  waitSec?: number;
}

const VISEME_HZ = 30;
/** Ped speech sits 4 dB under the 0 dB reference at 2 m (SOUND-BAR section 2: -20 vs -16). */
const REF_GAIN = 0.63;

/** Mouth opening 0..1 at time `t` of a line of `durSec` from syllable timing (no audio available). */
export function syllableOpen(text: string, durSec: number, t: number): number {
  if (t < 0 || t > durSec || durSec <= 0) return 0;
  const words = text.split(/\s+/).filter(Boolean);
  const syl = words.reduce((n, w) => n + Math.max(1, (w.toLowerCase().match(/[aeiouy]+/g) ?? []).length), 0);
  const rate = syl / durSec;
  const phase = (t * rate) % 1;
  const v = Math.sin(Math.PI * phase);
  return Math.max(0, Math.min(1, 0.12 + 0.88 * v * v));
}

/** Inverse-distance gain (reference 2 m). */
export function distanceGain(dist: number): number { return REF_GAIN * Math.min(1, 2 / Math.max(2, dist)); }
export function distanceCutoff(dist: number): number { return Math.max(1500, 7000 - dist * 220); }

export class PedVoicePlayer implements SpeechBackend {
  private bank: FxBank | null = null;
  private bankCtx: AudioContext | null = null;
  private voices: Record<VoiceRole, VoiceLike | null> | null = null;
  private voiceCount = -1;
  /** Last decisions, for the probe and the debug panel. */
  readonly modes: Record<string, number> = { pack: 0, cache: 0, live: 0, system: 0, silent: 0 };

  constructor(private readonly env: PedPlayerEnv) {}

  private host(): FxHost | null {
    const ctx = this.env.ctx(); const dest = this.env.dest();
    return ctx && dest ? { ctx, dest } : null;
  }

  private fx(host: FxHost, preset: SpeakJob['voice'] extends infer V ? (V extends { fx: infer F } ? F : never) : never): AudioNode {
    if (!this.bank || this.bankCtx !== host.ctx) { this.bank = new FxBank(host); this.bankCtx = host.ctx; }
    return this.bank.input(preset as never);
  }

  /** Phrases of a job: the same plan the bake made (story speakers keep their own rhythm, peds share one per voice preset). */
  private phrases(job: SpeakJob): Phrase[] {
    const v = job.voice!;
    const id = job.cls === 'story' || job.cls === 'mission' ? job.who : pedRhythmId(v.kokoro);
    return planSpeech(job.text, id, v.speed, rhythmFor(id));
  }

  private async fetchClips(job: SpeakJob): Promise<{ clips: Clip[]; gaps: number[]; mode: 'pack' | 'cache' } | null> {
    const v = job.voice;
    if (!v) return null;
    const pack = this.env.pack();
    const out: Clip[] = [];
    const gaps: number[] = [];
    let usedPack = false;
    for (const p of this.phrases(job)) {
      const key = clipKey(p.text, v.kokoro, p.speed);
      gaps.push(p.gap);
      let clip: Clip | null = null;
      if (pack && pack.has(key)) { clip = await pack.get(key); if (clip) usedPack = true; }
      if (!clip) clip = await this.env.cache.get(key);
      if (!clip) return null;
      out.push(clip);
    }
    return out.length ? { clips: out, gaps, mode: usedPack ? 'pack' : 'cache' } : null;
  }

  begin(job: SpeakJob, hooks: BackendHooks): { cancel(): void } {
    let dead = false;
    const timers = new Set<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>();
    const sources: AudioScheduledSourceNode[] = [];
    let nodes: AudioNode[] = [];
    let utter: UtteranceLike | null = null;
    const cleanup = () => {
      for (const t of timers) { clearTimeout(t as never); clearInterval(t as never); }
      timers.clear();
      for (const s of sources) { try { s.stop(); s.disconnect(); } catch { /* ended */ } }
      for (const n of nodes) { try { n.disconnect(); } catch { /* ignore */ } }
      sources.length = 0; nodes = [];
      if (utter) { try { this.env.speech?.cancel(); } catch { /* ignore */ } utter = null; }
    };
    const cancel = () => { dead = true; cleanup(); };

    const speakSystem = () => {
      const speech = this.env.speech;
      const v = job.voice;
      if (!speech || !v) { silent(); return; }
      const list = speech.getVoices();
      if (!this.voices || list.length !== this.voiceCount) { this.voices = pickVoices(list); this.voiceCount = list.length; }
      const u = this.env.makeUtterance(job.text);
      u.voice = this.voices[v.sys.role] ?? this.voices.host ?? null;
      u.pitch = v.sys.pitch; u.rate = v.sys.rate;
      u.volume = Math.min(1, Math.max(0, this.env.volume() * Math.min(1, 2 / Math.max(2, job.dist))));
      u.lang = u.voice?.lang ?? 'en-US';
      const dur = Math.max(0.8, lineSeconds(job.text, v.sys.rate));
      utter = u;
      this.modes.system++;
      let t0 = 0;
      const end = () => { if (dead) return; dead = true; cleanup(); hooks.ended(); };
      u.onend = end; u.onerror = end;
      try { speech.speak(u); } catch { end(); return; }
      t0 = Date.now();
      hooks.started(dur, 'system');
      const iv = setInterval(() => { if (!dead) hooks.viseme((Date.now() - t0) / 1000, syllableOpen(job.text, dur, (Date.now() - t0) / 1000)); }, 1000 / VISEME_HZ);
      timers.add(iv);
      const guard = setTimeout(end, dur * 2500 + 3000); timers.add(guard);
    };

    const silent = () => {
      const dur = Math.max(1, job.text.split(/\s+/).length / 2.6 + 0.3);
      this.modes.silent++;
      hooks.started(dur, 'silent');
      const t = setTimeout(() => { if (!dead) { dead = true; hooks.ended(); } }, dur * 1000); timers.add(t);
    };

    const host = this.host();
    if (!host || !job.voice) { if (job.voice) speakSystem(); else silent(); return { cancel }; }

    const wait = (this.env.waitSec ?? 0.3) * 1000;
    let settled = false;
    const fallback = setTimeout(() => { if (!settled && !dead) { settled = true; speakSystem(); } }, wait);
    timers.add(fallback);
    void this.fetchClips(job).then((res) => {
      if (settled || dead) return;
      settled = true; clearTimeout(fallback);
      if (!res) { speakSystem(); return; }
      this.playClips(host, job, res.clips, res.gaps, res.mode, hooks, sources, (n) => { nodes = n; }, timers, () => { if (!dead) { dead = true; cleanup(); hooks.ended(); } });
    }, () => { if (!settled && !dead) { settled = true; speakSystem(); } });
    return { cancel };
  }

  private playClips(host: FxHost, job: SpeakJob, clips: Clip[], gaps: number[], mode: 'pack' | 'cache', hooks: BackendHooks, sources: AudioScheduledSourceNode[], keep: (n: AudioNode[]) => void, timers: Set<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>, done: () => void): void {
    const { ctx } = host;
    const v = job.voice!;
    const tap = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = distanceCutoff(job.dist); lp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = distanceGain(job.dist);
    tap.connect(analyser); analyser.connect(lp); lp.connect(g); g.connect(this.fx(host, v.fx));
    keep([tap, analyser, lp, g]);
    let at = ctx.currentTime + 0.03;
    const start = at;
    for (const [i, c] of clips.entries()) {
      const pcm = shapeClip(c.samples, c.sampleRate);
      const buf = ctx.createBuffer(1, pcm.length, c.sampleRate);
      buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = v.playbackRate;
      src.detune.value = v.detune;
      src.connect(tap);
      src.start(at);
      sources.push(src);
      at += buf.duration / v.playbackRate + (gaps[i] ?? 0.1) / v.playbackRate;
    }
    const total = at - start - (gaps[clips.length - 1] ?? 0.1) / v.playbackRate;
    this.modes[mode]++;
    hooks.started(total, mode);
    const data = new Float32Array(analyser.fftSize);
    const iv = setInterval(() => {
      analyser.getFloatTimeDomainData(data);
      let s = 0; for (let i = 0; i < data.length; i++) s += data[i] * data[i];
      const rms = Math.sqrt(s / data.length);
      hooks.viseme(Math.max(0, ctx.currentTime - start), Math.max(0, Math.min(1, rms * 5)));
    }, 1000 / VISEME_HZ);
    timers.add(iv);
    const end = setTimeout(done, Math.max(50, (at - ctx.currentTime - (gaps[clips.length - 1] ?? 0.1) / v.playbackRate) * 1000)); timers.add(end);
  }

  /** Idle-time live render into the cache (predicted story lines). */
  async prerender(job: SpeakJob): Promise<void> {
    const e = this.env.engine();
    const v = job.voice;
    if (!e || !e.usable || !v) return;
    const pack = this.env.pack();
    for (const p of this.phrases(job)) {
      const key = clipKey(p.text, v.kokoro, p.speed);
      if (pack?.has(key) || this.env.cache.has(key) || await this.env.cache.get(key)) continue;
      const clip = await e.synth({ text: p.text, voice: v.kokoro, speed: p.speed }, 1);
      this.env.cache.put(key, clip);
      this.modes.live++;
    }
  }
}
