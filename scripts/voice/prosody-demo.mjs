#!/usr/bin/env node
// Prosody evidence: renders demo scenes with the free Kokoro voices, once the old way (sentence by sentence, fixed 0.14 s
// gap) and once with the prosody layer (phrases, rhythm profiles, turn gaps), writes before/after MP3s and a table of
// measured numbers (speech rate, pause count, pause-length spread) read back from the audio.
//   node scripts/voice/prosody-demo.mjs --out <dir> [--scenes host-tommy,ad-silo] [--no-street]
// Raw Kokoro clips are cached in <dir>/render-cache so a re-run only renders what changed. No effect chain is applied
// (the game runs studio/phone/ad filters on top); every file is normalised to -16 LUFS.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { integratedLufs, normalise, trimSilence } from './loudness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const flag = (n) => args.includes(`--${n}`);
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY && !flag('no-relaunch')) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args, '--no-relaunch'], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS || '/root/.ccr/ca-bundle.crt' } });
  process.exit(r.status ?? 1);
}
const OUT = resolve(opt('out', join(root, 'cache/prosody-demo')));
const ONLY = opt('scenes', '') ? opt('scenes', '').split(',') : null;
const SR = 24000;
mkdirSync(join(OUT, 'render-cache'), { recursive: true });

const { build } = await import(pathToFileURL(join(root, 'node_modules/vite/dist/node/index.js')).href);
const bundleDir = join(OUT, 'bundle');
await build({ root, configFile: false, logLevel: 'error', resolve: { alias: { '@': join(root, 'src') } },
  build: { ssr: join(here, 'prosody-entry.ts'), outDir: bundleDir, emptyOutDir: true, target: 'node20', minify: false, rolldownOptions: { output: { format: 'es', entryFileNames: 'entry.mjs' } } }, ssr: { noExternal: true } });
const E = await import(pathToFileURL(join(bundleDir, 'entry.mjs')).href);

const { KokoroTTS } = await import('kokoro-js');
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
let renders = 0;
async function clip(voice, speed, text) {
  const key = `${voice}_${speed.toFixed(2)}_${E.hash32(text.toLowerCase())}`;
  const f = join(OUT, 'render-cache', key + '.f32');
  if (existsSync(f)) { const b = readFileSync(f); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); }
  const t0 = Date.now();
  const g = await tts.generate(text, { voice, speed });
  const x = trimSilence(g.audio, SR, 0.03);
  writeFileSync(f, Buffer.from(x.buffer, x.byteOffset, x.byteLength));
  renders++; console.log(`[render] ${voice} ${speed.toFixed(2)} "${text.slice(0, 50)}" ${(x.length / SR).toFixed(1)}s in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return x;
}

function fadeEdges(x, sec = 0.006) { const y = new Float32Array(x); const n = Math.min(y.length >> 1, Math.round(sec * SR)); for (let i = 0; i < n; i++) { const g = 0.5 - 0.5 * Math.cos(Math.PI * i / n); y[i] *= g; y[y.length - 1 - i] *= g; } return y; }

/** Renders items onto a timeline; returns the mixed samples and the placement of each phrase. */
async function mix(items) {
  const clips = new Map();
  for (const it of items) if (it.k === 'say') clips.set(it, await clip(it.voice, it.speed, it.text));
  const placed = E.timeline(items, (s) => clips.get(s).length / SR);
  const total = Math.max(...placed.map((p) => p.end)) + 0.2;
  const out = new Float32Array(Math.ceil(total * SR));
  for (const p of placed) { const x = fadeEdges(clips.get(p.s)); const o = Math.round(p.at * SR); for (let i = 0; i < x.length; i++) out[o + i] += x[i]; }
  return { out, placed };
}

// ---- measurement from audio: 10 ms frames, silence = below -45 dB relative to the clip's loud frames; pauses are silent runs of 120 ms or more inside the speech
function analyse(x) {
  const hop = SR / 100; const n = Math.floor(x.length / hop); const rms = new Float64Array(n);
  for (let f = 0; f < n; f++) { let s = 0; for (let i = 0; i < hop; i++) s += x[f * hop + i] ** 2; rms[f] = Math.sqrt(s / hop); }
  const loud = [...rms].sort((a, b) => a - b)[Math.floor(n * 0.95)] || 1e-6;
  const thr = loud * 10 ** (-45 / 20);
  const voiced = Array.from(rms, (r) => r > thr);
  let a = voiced.indexOf(true); let b = voiced.lastIndexOf(true);
  if (a < 0) return { dur: 0, speech: 0, pauses: [] };
  const pauses = []; let run = 0;
  for (let f = a; f <= b; f++) { if (!voiced[f]) run++; else { if (run >= 12) pauses.push(run / 100); run = 0; } }
  const speech = (b - a + 1) / 100 - pauses.reduce((s, p) => s + p, 0);
  return { dur: (b - a + 1) / 100, speech, pauses };
}
const mean = (v) => v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
const sd = (v) => { if (v.length < 2) return 0; const m = mean(v); return Math.sqrt(mean(v.map((x) => (x - m) ** 2))); };
const wordsOf = (t) => (E.spokenText(t).match(/[\p{L}\p{N}']+/gu) ?? []).length;

async function writeMp3(name, samples) {
  const norm = normalise(trimSilence(samples, SR, 0.05), SR, -16, -3).samples;
  const wav = join(OUT, name.replace(/\.mp3$/, '.f32'));
  const mp3 = await new Promise((res, rej) => { const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', 'pipe:0', '-c:a', 'libmp3lame', '-b:a', '64k', '-f', 'mp3', 'pipe:1']); const o = []; p.stdout.on('data', (d) => o.push(d)); p.on('close', (c) => c === 0 ? res(Buffer.concat(o)) : rej(new Error('ffmpeg'))); p.stdin.end(Buffer.from(norm.buffer, norm.byteOffset, norm.byteLength)); });
  writeFileSync(join(OUT, name), mp3); void wav;
  return norm;
}

const report = { scenes: {}, street: {}, planBySpeaker: {} };
const perSpeaker = { old: {}, new: {} };
function collect(which, scene, placed, lines) {
  // audio of each line = its phrases only; turn gaps are the silences between a line's end and the next line's start
  const byLine = new Map();
  for (const p of placed) { if (!byLine.has(p.s.line)) byLine.set(p.s.line, []); byLine.get(p.s.line).push(p); }
  const turns = []; let prevEnd = null;
  for (const [li, ps] of byLine) {
    const t0 = Math.min(...ps.map((p) => p.at)), t1 = Math.max(...ps.map((p) => p.end));
    const L = new Float32Array(Math.ceil((t1 - t0) * SR) + 1);
    ps.forEach((p) => { const x = scene.clips.get(p.s); const o = Math.round((p.at - t0) * SR); for (let i = 0; i < x.length && o + i < L.length; i++) L[o + i] += x[i]; });
    const m = analyse(L); const who = lines[li].who; const w = wordsOf(lines[li].text);
    const e = (perSpeaker[which][who] ??= { lines: 0, words: 0, dur: 0, speech: 0, pauses: [] });
    e.lines++; e.words += w; e.dur += m.dur; e.speech += m.speech; e.pauses.push(...m.pauses);
    if (prevEnd !== null && prevWho(li, lines) !== who) turns.push(t0 - prevEnd);
    prevEnd = t1;
  }
  return turns;
}
const prevWho = (li, lines) => lines[li - 1]?.who;

for (const sc of E.scenes()) {
  if (ONLY && !ONLY.includes(sc.id)) continue;
  console.log(`\n== ${sc.id}: ${sc.title}`);
  const res = {};
  for (const which of ['old', 'new']) {
    const items = which === 'old' ? E.oldItems(sc.lines) : E.newItems(sc.lines);
    const clips = new Map();
    for (const it of items) if (it.k === 'say') clips.set(it, await clip(it.voice, it.speed, it.text));
    const placed = E.timeline(items, (s) => clips.get(s).length / SR);
    const total = Math.max(...placed.map((p) => p.end)) + 0.2;
    const out = new Float32Array(Math.ceil(total * SR));
    for (const p of placed) { const x = fadeEdges(clips.get(p.s)); const o = Math.round(p.at * SR); for (let i = 0; i < x.length; i++) out[o + i] += x[i]; }
    await writeMp3(`${sc.id}-${which === 'old' ? 'before' : 'after'}.mp3`, out);
    const turns = collect(which, { clips }, placed, sc.lines);
    const all = analyse(out);
    res[which] = { seconds: +all.dur.toFixed(1), phrases: items.filter((i) => i.k === 'say').length, turnGapsSec: turns.map((t) => +t.toFixed(2)) };
  }
  report.scenes[sc.id] = { title: sc.title, ...res };
}

if (!flag('no-street')) {
  for (const which of ['old', 'new']) {
    const sets = which === 'old' ? E.streetOld() : E.streetNew();
    const all = [];
    for (const [i, s] of sets.entries()) {
      const clips = new Map();
      for (const it of s.items) clips.set(it, await clip(it.voice, it.speed, it.text));
      const placed = E.timeline(s.items, (x) => clips.get(x).length / SR);
      const end = Math.max(...placed.map((p) => p.end));
      const x = new Float32Array(Math.ceil((end + 0.1) * SR));
      for (const p of placed) { const c = fadeEdges(clips.get(p.s)); const o = Math.round(p.at * SR); for (let k = 0; k < c.length; k++) x[o + k] += c[k]; }
      const norm = normalise(trimSilence(x, SR, 0.03), SR, -16, -3).samples;
      all.push(norm, new Float32Array(Math.round(0.9 * SR)));
      const m = analyse(x); const w = wordsOf(E.STREET[i].text);
      const e = (perSpeaker[which]['bark:' + s.group] ??= { lines: 0, words: 0, dur: 0, speech: 0, pauses: [] });
      e.lines++; e.words += w; e.dur += m.dur; e.speech += m.speech; e.pauses.push(...m.pauses);
    }
    const cat = new Float32Array(all.reduce((n, a) => n + a.length, 0)); let o = 0; for (const a of all) { cat.set(a, o); o += a.length; }
    await writeMp3(`street-barks-${which === 'old' ? 'before' : 'after'}.mp3`, cat);
  }
}

const row = (e) => e ? { lines: e.lines, words: e.words, wordsPerMinuteOverall: +(e.words / e.dur * 60).toFixed(0), articulationWordsPerSec: +(e.words / e.speech).toFixed(2), pauses: e.pauses.length, pausesPerLine: +(e.pauses.length / e.lines).toFixed(2), pauseMeanSec: +mean(e.pauses).toFixed(3), pauseSdSec: +sd(e.pauses).toFixed(3), pauseMinSec: e.pauses.length ? Math.min(...e.pauses) : 0, pauseMaxSec: e.pauses.length ? Math.max(...e.pauses) : 0 } : null;
report.measured = {};
for (const who of new Set([...Object.keys(perSpeaker.old), ...Object.keys(perSpeaker.new)])) report.measured[who] = { before: row(perSpeaker.old[who]), after: row(perSpeaker.new[who]) };
const ps = E.planStatsBySpeaker();
for (const [who, e] of Object.entries(ps)) report.planBySpeaker[who] = { lines: e.lines, phrases: e.phrases, plannedGaps: e.gaps.length, gapMeanSec: +mean(e.gaps).toFixed(3), gapSdSec: +sd(e.gaps).toFixed(3), speedMean: +mean(e.speeds).toFixed(3), speedSd: +sd(e.speeds).toFixed(3), castSpeed: e.baseSpeed };
writeFileSync(join(OUT, 'numbers.json'), JSON.stringify(report, null, 1));
console.log(`\n[done] ${renders} clips rendered, report ${join(OUT, 'numbers.json')}`);
