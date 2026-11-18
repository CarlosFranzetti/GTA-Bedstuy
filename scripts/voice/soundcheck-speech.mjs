#!/usr/bin/env node
// SOUNDCHECK: two conversations laid out and rendered with the free Kokoro voices, for a before and an after.
//   node scripts/voice/soundcheck-speech.mjs --root <tree> --tag before|after --out <dir> [--tune]
// --root is a checkout holding src/ and scripts/voice/ (the repo itself for "after", a `git archive` of an older commit for
// "before"); --tune applies the per-speaker pitch offsets of src/audio/voice/tune.ts of the repo (the player does the same
// with playbackRate). Raw clips are cached in <out>/render-cache, keyed by voice, speed and text, so identical phrases are
// rendered once. No effect chain is applied (the game's studio/phone/ad filters sit on top); every file is -16 LUFS.
// Prints per-conversation numbers: speech rate, pauses inside a line, gaps between speakers, and a rough pitch per speaker.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const flag = (n) => args.includes(`--${n}`);
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY && !flag('no-relaunch')) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args, '--no-relaunch'], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS || '/root/.ccr/ca-bundle.crt' } });
  process.exit(r.status ?? 1);
}
const ROOT = resolve(opt('root', repo));
const TAG = opt('tag', 'after');
const OUT = resolve(opt('out', join(repo, 'cache/soundcheck-speech')));
const CACHE = resolve(opt('cache', join(OUT, 'render-cache')));
const SR = 24000;
mkdirSync(CACHE, { recursive: true });
const { integratedLufs, normalise, trimSilence } = await import(pathToFileURL(join(repo, 'scripts/voice/loudness.mjs')).href);
const vite = await import(pathToFileURL(join(repo, 'node_modules/vite/dist/node/index.js')).href);
const bundle = async (rootDir, entry, name, out) => {
  await vite.build({ root: rootDir, configFile: false, logLevel: 'error', resolve: { alias: { '@': join(rootDir, 'src') } },
    build: { ssr: entry, outDir: out, emptyOutDir: true, target: 'node20', minify: false, rolldownOptions: { output: { format: 'es', entryFileNames: name } } }, ssr: { noExternal: true } });
  return import(pathToFileURL(join(out, name)).href + `?t=${Date.now()}`);
};
mkdirSync(join(ROOT, 'scripts/voice'), { recursive: true });
if (ROOT !== repo) copyFileSync(join(repo, 'scripts/voice/soundcheck-entry.ts'), join(ROOT, 'scripts/voice/soundcheck-entry.ts'));
const E = await bundle(ROOT, join(ROOT, 'scripts/voice/soundcheck-entry.ts'), 'entry.mjs', join(OUT, `bundle-${TAG}`));
let tuneFor = () => ({ cents: 0 });
if (flag('tune')) tuneFor = (await bundle(repo, join(repo, 'src/audio/voice/tune.ts'), 'tune.mjs', join(OUT, 'bundle-tune'))).tuneFor;

const { KokoroTTS } = await import(pathToFileURL(join(repo, 'scripts/voice/node_modules/kokoro-js/dist/kokoro.js')).href).catch(() => import('kokoro-js'));
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
let renders = 0, renderSec = 0, audioSec = 0;
const hash = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
async function clip(voice, speed, text) {
  const f = join(CACHE, `${voice}_${speed.toFixed(2)}_${hash(text.toLowerCase())}.f32`);
  if (existsSync(f)) { const b = readFileSync(f); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); }
  const t0 = Date.now();
  const g = await tts.generate(text, { voice, speed });
  const x = trimSilence(g.audio, SR, 0.03);
  writeFileSync(f, Buffer.from(x.buffer, x.byteOffset, x.byteLength));
  renders++; renderSec += (Date.now() - t0) / 1000; audioSec += x.length / SR;
  console.log(`[render] ${voice} ${speed.toFixed(2)} "${text.slice(0, 60)}" ${(x.length / SR).toFixed(1)}s in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return x;
}
const fade = (x, sec = 0.006) => { const y = new Float32Array(x); const n = Math.min(y.length >> 1, Math.round(sec * SR)); for (let i = 0; i < n; i++) { const g = 0.5 - 0.5 * Math.cos(Math.PI * i / n); y[i] *= g; y[y.length - 1 - i] *= g; } return y; };
/** Resample by `rate` (>1: higher and faster) with cubic Hermite interpolation. */
function resample(x, rate) {
  if (Math.abs(rate - 1) < 1e-4) return x;
  const n = Math.floor((x.length - 1) / rate), y = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = i * rate, k = Math.floor(p), f = p - k; const a = x[Math.max(0, k - 1)], b = x[k], c = x[Math.min(x.length - 1, k + 1)], d = x[Math.min(x.length - 1, k + 2)]; y[i] = b + 0.5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - d + f * (3 * (b - c) + d - a))); }
  return y;
}
const sh = (cmd, argv, input) => new Promise((res, rej) => { const p = spawn(cmd, argv); const o = []; p.stdout.on('data', (d) => o.push(d)); p.on('close', (c) => (c === 0 ? res(Buffer.concat(o)) : rej(new Error(cmd + c)))); p.stdin.end(input); });
const f32 = (x) => Buffer.from(x.buffer, x.byteOffset, x.byteLength);
const encode = (x, argv, ext) => sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', 'pipe:0', ...argv, '-f', ext, 'pipe:1'], f32(x));

// ---- measurements read back from the audio: 10 ms frames, silence = 45 dB under the loud frames; pauses are silent runs of 120 ms or more inside speech
function analyse(x) {
  const hop = SR / 100, n = Math.floor(x.length / hop), rms = new Float64Array(n);
  for (let f = 0; f < n; f++) { let s = 0; for (let i = 0; i < hop; i++) s += x[f * hop + i] ** 2; rms[f] = Math.sqrt(s / hop); }
  const loud = [...rms].sort((a, b) => a - b)[Math.floor(n * 0.95)] || 1e-6, thr = loud * 10 ** (-45 / 20), voiced = Array.from(rms, (r) => r > thr);
  const a = voiced.indexOf(true), b = voiced.lastIndexOf(true);
  if (a < 0) return { dur: 0, speech: 0, pauses: [] };
  const pauses = []; let run = 0;
  for (let f = a; f <= b; f++) { if (!voiced[f]) run++; else { if (run >= 12) pauses.push(run / 100); run = 0; } }
  return { dur: (b - a + 1) / 100, speech: (b - a + 1) / 100 - pauses.reduce((s, p) => s + p, 0), pauses };
}
/** Median fundamental frequency by autocorrelation on voiced 40 ms frames (a rough number, only for comparing speakers and the tuning). */
function pitch(x) {
  const hz = [], win = Math.round(0.04 * SR), lo = Math.round(SR / 400), hi = Math.round(SR / 70);
  for (let s = 0; s + win + hi < x.length; s += Math.round(0.02 * SR)) {
    let e = 0; for (let i = 0; i < win; i++) e += x[s + i] ** 2; if (e / win < 1e-4) continue;
    let best = 0, bl = 0; for (let l = lo; l <= hi; l++) { let c = 0; for (let i = 0; i < win; i++) c += x[s + i] * x[s + i + l]; if (c > best) { best = c; bl = l; } }
    if (best / e > 0.5 && bl) hz.push(SR / bl);
  }
  hz.sort((a, b) => a - b); return hz.length ? hz[Math.floor(hz.length / 2)] : 0;
}
const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
const sd = (v) => { if (v.length < 2) return 0; const m = mean(v); return Math.sqrt(mean(v.map((x) => (x - m) ** 2))); };
const wordsOf = (t) => (E.spokenText(t).match(/[\p{L}\p{N}']+/gu) ?? []).length;

const report = { tag: TAG, tune: flag('tune'), scenes: {} };
for (const sc of E.scenes()) {
  const its = E.items(sc.lines);
  const clips = new Map(), rate = new Map();
  for (const it of its) if (it.k === 'say') { const r = 2 ** (tuneFor(it.who).cents / 1200); rate.set(it, r); clips.set(it, resample(await clip(it.voice, it.speed, it.text), r)); }
  const placed = E.timeline(its, (s) => clips.get(s).length / SR);
  const total = Math.max(...placed.map((p) => p.end)) + 0.25;
  const mix = new Float32Array(Math.ceil(total * SR));
  for (const p of placed) { const x = fade(clips.get(p.s)); const o = Math.round(p.at * SR); for (let i = 0; i < x.length; i++) mix[o + i] += x[i]; }
  const norm = normalise(trimSilence(mix, SR, 0.05), SR, -16, -3).samples;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${sc.id}-${TAG}.mp3`), await encode(norm, ['-c:a', 'libmp3lame', '-b:a', '96k'], 'mp3'));
  writeFileSync(join(OUT, `${sc.id}-${TAG}.wav`), await encode(norm, ['-c:a', 'pcm_s16le'], 'wav'));
  // per-line and per-speaker numbers
  const byLine = new Map();
  for (const p of placed) { if (!byLine.has(p.s.line)) byLine.set(p.s.line, []); byLine.get(p.s.line).push(p); }
  const lines = [], gaps = []; let prevEnd = null, prevWho = null; const per = {};
  for (const [li, ps] of byLine) {
    const t0 = Math.min(...ps.map((p) => p.at)), t1 = Math.max(...ps.map((p) => p.end));
    const L = new Float32Array(Math.ceil((t1 - t0) * SR) + 1);
    for (const p of ps) { const x = clips.get(p.s), o = Math.round((p.at - t0) * SR); for (let i = 0; i < x.length && o + i < L.length; i++) L[o + i] += x[i]; }
    const m = analyse(L), who = ps[0].s.who, w = wordsOf(sc.lines[li].text);
    const e = (per[who] ??= { lines: 0, words: 0, speech: 0, pauses: [], samples: [] });
    e.lines++; e.words += w; e.speech += m.speech; e.pauses.push(...m.pauses); e.samples.push(...ps.map((p) => clips.get(p.s)));
    if (prevEnd !== null && prevWho !== who) gaps.push(+(t0 - prevEnd).toFixed(2));
    lines.push({ who, t0: +t0.toFixed(2), t1: +t1.toFixed(2), words: w, text: sc.lines[li].text.slice(0, 70) });
    prevEnd = t1; prevWho = who;
  }
  report.scenes[sc.id] = {
    title: sc.title, seconds: +(total - 0.25).toFixed(1), phrases: its.filter((i) => i.k === 'say').length, turnGapsSec: gaps, lines,
    speakers: Object.fromEntries(Object.entries(per).map(([who, e]) => [who, { lines: e.lines, wordsPerSecArticulation: +(e.words / Math.max(0.1, e.speech)).toFixed(2), pausesPerLine: +(e.pauses.length / e.lines).toFixed(2), pauseMeanSec: +mean(e.pauses).toFixed(2), pauseSdSec: +sd(e.pauses).toFixed(2), medianF0Hz: Math.round(pitch(new Float32Array(e.samples.reduce((a, s) => [...a, ...s.slice(0, SR * 3)], []))) ) }])),
  };
  console.log(`[${TAG}] ${sc.id}: ${report.scenes[sc.id].seconds}s, ${report.scenes[sc.id].phrases} phrases, turn gaps ${JSON.stringify(gaps)}`);
}
report.rendered = { clips: renders, computeSec: +renderSec.toFixed(1), audioSec: +audioSec.toFixed(1), rtf: audioSec ? +(renderSec / audioSec).toFixed(2) : null };
writeFileSync(join(OUT, `numbers-${TAG}.json`), JSON.stringify(report, null, 1));
console.log(`[done] ${renders} clips rendered (${renderSec.toFixed(0)} s compute for ${audioSec.toFixed(0)} s of audio)`);
