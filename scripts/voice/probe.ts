/**
 * Real-browser probe of the voice pack path (run by probe.mjs): time to first audio for a pack hit, a cache hit and a live
 * render, viseme rate and subtitle sync through the real PedVoicePlayer, and the fallback when the pack is missing.
 */
import { ClipCache } from '../../src/audio/voice/ClipCache';
import { NeuralTts } from '../../src/audio/voice/NeuralTts';
import { SpeechPlayer } from '../../src/audio/voice/SpeechPlayer';
import { VoiceHub } from '../../src/audio/voice/VoiceHub';
import { clipKey, splitSentences } from '../../src/audio/voice/script';
import { CAST_MAP } from '../../src/audio/voice/cast';
import { PedVoicePlayer } from '../../src/audio/voice/peds/PedVoicePlayer';
import type { SpeakJob } from '../../src/audio/voice/peds/BarkDirector';

const W = window as unknown as { __out?: unknown; __log: string[] };
W.__log = [];
const log = (...a: unknown[]) => W.__log.push(a.join(' '));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const out: Record<string, unknown> = {};
  try {
    const q = new URLSearchParams(location.search);
    const ctx = new AudioContext();
    await ctx.resume();
    const dest = ctx.createGain(); dest.connect(ctx.destination);
    const manifest = await (await fetch('/voice/manifest.json')).json() as { entries: Record<string, { who: string; text: string; dur: number }>; engine: string };
    const sample = Object.entries(manifest.entries).find(([, e]) => e.who === 'deja' && e.text.length > 25)!;
    const dj = CAST_MAP.get('deja')!;
    out.packClips = Object.keys(manifest.entries).length; out.engine = manifest.engine;

    // 1. pack hit through the real SpeechPlayer (hub with a pack)
    const hub = new VoiceHub({ ctx: () => ctx, dest: () => dest, speech: null, makeUtterance: () => ({} as never), volume: () => 1, hosted: true, storage: null, persist: null, packBase: '/voice/', warn: (m) => log('WARN', m) });
    hub.onGesture();
    await hub.pack!.load();
    const t0 = performance.now();
    const firstAudio = await new Promise<number>((res) => { hub.player.play([{ who: 'deja', text: sample[1].text }], { onStart: () => res(performance.now() - t0) }); });
    out.packFirstAudioMs = Math.round(firstAudio);
    hub.player.cancel();
    const t1 = performance.now();
    await new Promise<void>((res) => { hub.player.play([{ who: 'deja', text: sample[1].text }], { onStart: () => { out.packSecondMs = Math.round(performance.now() - t1); res(); } }); });
    hub.player.cancel();

    // 2. cache hit (no pack): put the decoded clip in a ClipCache, then play
    const key = clipKey(sample[1].text, dj.voice, dj.speed);
    const clip = await hub.pack!.get(key);
    const cache = new ClipCache(null);
    cache.put(key, clip!);
    const fake = { usable: false, ready: false, rtf: 0, kind: 'fake' } as never;
    const p2 = new SpeechPlayer({ ctx: () => ctx, dest: () => dest, speech: null, makeUtterance: () => ({} as never), engine: () => fake, cache, volume: () => 1 });
    const t2 = performance.now();
    await new Promise<void>((res) => {
      // engine unusable and no pack: cache covers it, so the neural path is used
      p2.play([{ who: 'deja', text: sample[1].text }], { onStart: () => { out.cacheFirstAudioMs = Math.round(performance.now() - t2); res(); } });
      setTimeout(res, 3000);
    });
    p2.cancel();

    // 3. viseme rate + subtitle sync through PedVoicePlayer with a baked line (a pack voice stands in for a ped group)
    const player = new PedVoicePlayer({ ctx: () => ctx, dest: () => dest, pack: () => hub.pack, cache: hub.cache, engine: () => null, speech: null, makeUtterance: () => ({} as never), volume: () => 1 });
    const job: SpeakJob = { speakerId: 'ped-probe', lineId: 'probe', text: sample[1].text, who: 'ped-probe', cls: 'ambient', priority: 1, dist: 6, toPlayer: false, dueAt: 0,
      voice: { kokoro: dj.voice, speed: dj.speed, fx: 'street', playbackRate: 1, detune: 0, sys: { role: 'host', pitch: 1, rate: 1 } } };
    const vis: number[] = []; let started = 0; let mode = ''; let dur = 0; const tb = performance.now();
    await new Promise<void>((res) => {
      player.begin(job, { started: (d, m) => { started = performance.now(); dur = d; mode = m; }, viseme: (t, o) => vis.push(o), ended: () => res() });
      setTimeout(res, 15000);
    });
    out.pedMode = mode; out.pedDurSec = +dur.toFixed(2); out.pedStartMs = Math.round(started - tb);
    out.visemeSamples = vis.length; out.visemeHz = +(vis.length / Math.max(0.1, dur)).toFixed(1);
    out.visemeMax = +Math.max(...vis).toFixed(2); out.visemeMin = +Math.min(...vis).toFixed(2);
    // subtitle appears at hooks.started; audio is scheduled 30 ms later plus output latency
    out.subtitleSyncMs = Math.round(30 + (ctx.baseLatency + ((ctx as unknown as { outputLatency?: number }).outputLatency ?? 0)) * 1000);

    // 4. pack missing (artifact build): hub with a base that 404s; speech via a fake SpeechSynthesis
    const spoken: string[] = [];
    const speech = { getVoices: () => [], speak: (u: { text: string; onend?: () => void }) => { spoken.push(u.text); setTimeout(() => u.onend?.(), 20); }, cancel() {}, pause() {}, resume() {} };
    const warns: string[] = [];
    const hub2 = new VoiceHub({ ctx: () => ctx, dest: () => dest, speech: speech as never, makeUtterance: (t) => ({ text: t } as never), volume: () => 1, hosted: true, storage: null, persist: null, packBase: '/no-such-pack/', warn: (m) => warns.push(m) });
    hub2.onGesture(); await hub2.pack!.load();
    out.missingState = hub2.pack!.state; out.missingMode = hub2.player.mode;
    await new Promise<void>((res) => { hub2.player.play([{ who: 'deja', text: sample[1].text }], { onEnd: () => res() }); setTimeout(res, 3000); });
    out.missingSpoken = spoken.length; out.missingWarnings = warns.length;
    const hub3 = new VoiceHub({ ctx: () => ctx, dest: () => dest, speech: speech as never, makeUtterance: (t) => ({ text: t } as never), volume: () => 1, hosted: false, storage: null, persist: null });
    out.artifactPack = hub3.pack === null ? 'none (nothing fetched)' : 'present';

    // 5. live render (optional, slow): ?live=1
    if (q.get('live')) {
      const tts = new NeuralTts({ slowRtf: 99, warn: (m) => log('WARN', m), onProgress: () => undefined });
      const tl = performance.now(); await tts.load(); out.liveLoadSec = +((performance.now() - tl) / 1000).toFixed(1);
      const line = splitSentences('Stay on the floor.')[0];
      const t5 = performance.now();
      const c = await tts.synth({ text: line, voice: dj.voice, speed: dj.speed });
      out.liveFirstAudioMs = Math.round(performance.now() - t5); out.liveRtf = +((performance.now() - t5) / 1000 / (c.samples.length / c.sampleRate)).toFixed(2);
    }
    out.log = W.__log;
  } catch (e) { out.error = String((e as Error).stack ?? e); }
  W.__out = out;
})();
