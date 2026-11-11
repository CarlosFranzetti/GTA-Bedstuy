#!/usr/bin/env node
// Offline voice pack bake: renders the fixed lines (DJ idents and lines, ads, talk shows, story lines, ped barks) with
// the free Kokoro-82M voices (kokoro-js under Node, onnxruntime-node, q8 like the browser), normalises each clip to
// -16 LUFS and a sample peak of at most -1.5 dBFS measured on the decoded MP3 (limiter at -3 dBFS before encoding), encodes mono MP3 (ffmpeg libmp3lame, 24 kHz, 48 kbit/s
// speech, 32 kbit/s ped barks) and writes the pack the hosted and native builds fetch lazily:
//
//   public/voice/manifest.json            { version, engine, sampleRate, entries: { [clipKey]: { file, off, len, dur, lufs, peak, who, text } } }
//   public/voice/banks/<bank>.mp3         clips of one bank (a show, the ads, a DJ, a bark voice group) concatenated;
//                                         every entry is a standalone MP3 at [off, off+len)
//
// Resumable: every finished clip is kept in cache/voice-bake/ (index-<shard>.jsonl + one mp3 per clip), so a killed or
// finished run continues where it stopped, and re-running after a script edit renders only the clips whose key (text,
// voice, speed) is new. The pack is re-assembled every 25 clips, so a partial pack is always valid.
//
//   npm --prefix scripts/voice install                     (once: kokoro-js, onnxruntime-node)
//   node scripts/voice/bake-pack.mjs --plan                 print the plan (clips, speech seconds, per tier) and exit
//   nohup node scripts/voice/bake-pack.mjs > cache/voice-bake/bake.log 2>&1 &      render in the background
//   node scripts/voice/bake-pack.mjs --status              progress, speed, eta, bytes, coverage per tier
//   node scripts/voice/bake-pack.mjs --assemble             rebuild public/voice from the finished clips and exit
//
// Options: --out public/voice  --tiers 0,1,2  --shard 0/2 (run two processes on different cores)  --limit N
//          --budget-mb 25  --voice af_heart (only this voice, for tests)  --dtype q8
// Behind the sandbox proxy the script re-launches itself with NODE_USE_ENV_PROXY=1 and the CA bundle.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { integratedLufs, normalise, peakDb, trimSilence } from './loudness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const flag = (n) => args.includes(`--${n}`);

// ---- proxy re-launch (Node only honours these at start-up)
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY && !flag('no-relaunch') && !flag('assemble') && !flag('plan') && !flag('status')) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args, '--no-relaunch'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS || '/root/.ccr/ca-bundle.crt' },
  });
  process.exit(r.status ?? 1);
}

const OUT = resolve(root, opt('out', 'public/voice'));
const WORK = resolve(root, opt('work', 'cache/voice-bake'));
const BUDGET = Number(opt('budget-mb', '25')) * 1_000_000;
const TIERS = opt('tiers', '') ? opt('tiers', '').split(',').map(Number) : null;
const [SHARD, SHARDS] = opt('shard', '0/1').split('/').map(Number);
const LIMIT = Number(opt('limit', '0')) || Infinity;
const ONLY_VOICE = opt('voice', '');
const DTYPE = opt('dtype', 'q8');
const SAMPLE_RATE = 24000;
const ENGINE = `kokoro-82m-v1.0-${DTYPE}`;
const BITRATE = { dj: 48, ad: 48, show: 48, story: 48, bark: 32 };
mkdirSync(WORK, { recursive: true });

// ---- plan: bundle scripts/voice/plan-entry.ts with vite (same source files and aliases as the game)
async function loadPlan() {
  const { build } = await import(pathToFileURL(join(root, 'node_modules/vite/dist/node/index.js')).href);
  const outDir = join(WORK, 'plan-bundle');
  await build({
    root, configFile: false, logLevel: 'error', resolve: { alias: { '@': join(root, 'src') } },
    build: { ssr: join(here, 'plan-entry.ts'), outDir, emptyOutDir: true, target: 'node20', minify: false, rolldownOptions: { output: { format: 'es', entryFileNames: 'plan.mjs' } } },
    ssr: { noExternal: true },
  });
  const mod = await import(pathToFileURL(join(outDir, 'plan.mjs')).href + `?t=${Date.now()}`);
  return { plan: await mod.buildPlan(join(here, 'stations.snapshot.json')), stats: mod.planStats };
}

// ---- finished-clip store
const clipFile = (key) => join(WORK, 'clips', key.replace(/[^a-zA-Z0-9_.-]/g, '_') + '.mp3');
function readIndex() {
  const m = new Map();
  if (!existsSync(WORK)) return m;
  for (const f of readdirSync(WORK)) {
    if (!/^index-\d+\.jsonl$/.test(f)) continue;
    for (const line of readFileSync(join(WORK, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { const r = JSON.parse(line); if (existsSync(clipFile(r.key))) m.set(r.key, r); } catch { /* torn last line */ }
    }
  }
  return m;
}

function atomicWrite(file, data) { const tmp = file + '.tmp'; writeFileSync(tmp, data); renameSync(tmp, file); }

// ---- assemble the pack from finished clips
function assemble(plan, index) {
  const have = plan.filter((c) => index.has(c.key));
  // budget: keep clips in plan order (priority) until the pack would exceed the budget
  let total = 0; const keep = [];
  for (const c of have) { const len = statSync(clipFile(c.key)).size; if (total + len > BUDGET) continue; total += len; keep.push({ c, len }); }
  const banks = new Map();
  for (const k of keep) { if (!banks.has(k.c.bank)) banks.set(k.c.bank, []); banks.get(k.c.bank).push(k); }
  mkdirSync(join(OUT, 'banks'), { recursive: true });
  const entries = {};
  const live = new Set();
  for (const [bank, list] of banks) {
    const bufs = []; let off = 0;
    for (const { c, len } of list) {
      const r = index.get(c.key);
      bufs.push(readFileSync(clipFile(c.key)));
      entries[c.key] = { file: `banks/${bank}.mp3`, off, len, dur: r.dur, lufs: r.lufs, peak: r.peak, who: c.who, text: c.text };
      off += len;
    }
    atomicWrite(join(OUT, 'banks', `${bank}.mp3`), Buffer.concat(bufs));
    live.add(`${bank}.mp3`);
  }
  for (const f of existsSync(join(OUT, 'banks')) ? readdirSync(join(OUT, 'banks')) : []) if (!live.has(f) && f.endsWith('.mp3')) rmSync(join(OUT, 'banks', f));
  const byTier = {};
  for (const c of plan) { const t = (byTier[c.tier] ??= { planned: 0, baked: 0, sec: 0 }); t.planned++; if (entries[c.key]) { t.baked++; t.sec += entries[c.key].dur; } }
  const lufs = Object.values(entries).map((e) => e.lufs).filter(Number.isFinite);
  const manifest = {
    version: 1, engine: ENGINE, sampleRate: SAMPLE_RATE, format: 'mp3-mono', created: new Date().toISOString(),
    clips: keep.length, bytes: total, budgetBytes: BUDGET,
    lufs: lufs.length ? { min: Math.min(...lufs), max: Math.max(...lufs) } : null,
    peakMax: keep.length ? Math.max(...Object.values(entries).map((e) => e.peak)) : null,
    coverage: byTier, planned: plan.length,
    entries,
  };
  atomicWrite(join(OUT, 'manifest.json'), JSON.stringify(manifest));
  return manifest;
}

// ---- ffmpeg helpers
function ffmpeg(argv, input) {
  return new Promise((res, rej) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...argv], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = []; const err = [];
    p.stdout.on('data', (d) => out.push(d)); p.stderr.on('data', (d) => err.push(d));
    p.on('error', rej);
    p.on('close', (code) => (code === 0 ? res(Buffer.concat(out)) : rej(new Error(`ffmpeg ${code}: ${Buffer.concat(err).toString().slice(0, 300)}`))));
    p.stdin.on('error', () => undefined);
    p.stdin.end(input);
  });
}
const f32buf = (x) => Buffer.from(x.buffer, x.byteOffset, x.byteLength);
const encode = (x, kbps) => ffmpeg(['-f', 'f32le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-i', 'pipe:0', '-c:a', 'libmp3lame', '-b:a', `${kbps}k`, '-ar', String(SAMPLE_RATE), '-ac', '1', '-f', 'mp3', 'pipe:1'], f32buf(x));
const decode = async (mp3) => { const b = await ffmpeg(['-f', 'mp3', '-i', 'pipe:0', '-f', 'f32le', '-ar', String(SAMPLE_RATE), '-ac', '1', 'pipe:1'], mp3); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };

// ---- main
const t0 = Date.now();
const { plan: fullPlan, stats } = await loadPlan();
let plan = fullPlan;
if (ONLY_VOICE) plan = plan.filter((c) => c.voice === ONLY_VOICE);

if (flag('plan')) {
  const s = stats(plan);
  console.log(JSON.stringify({ clips: s.clips, chars: s.chars, approxSpeechSec: Math.round(s.approxSec), approxMinutes: +(s.approxSec / 60).toFixed(1), byTier: s.byTier }, null, 2));
  console.log(`bundle+plan ${(Date.now() - t0) / 1000}s; at 6x real time the whole plan renders in about ${(s.approxSec * 6 / 3600).toFixed(1)} h`);
  process.exit(0);
}

const index = readIndex();
if (flag('assemble') || flag('status')) {
  const m = assemble(plan, index);
  const progFiles = readdirSync(WORK).filter((f) => /^progress-\d+\.json$/.test(f)).map((f) => JSON.parse(readFileSync(join(WORK, f), 'utf8')));
  console.log(JSON.stringify({ clips: m.clips, planned: m.planned, mb: +(m.bytes / 1e6).toFixed(2), lufs: m.lufs, peakMaxDb: m.peakMax, coverage: m.coverage, workers: progFiles }, null, 2));
  process.exit(0);
}

const todo = plan.filter((c, i) => !index.has(c.key) && (!TIERS || TIERS.includes(c.tier)) && i % SHARDS === SHARD).slice(0, LIMIT);
console.log(`[bake] plan ${plan.length} clips, ${index.size} done, ${todo.length} to render (shard ${SHARD}/${SHARDS}), engine ${ENGINE}`);
if (!todo.length) { assemble(plan, index); console.log('[bake] nothing to do; pack assembled'); process.exit(0); }

const { KokoroTTS } = await import('kokoro-js');
const tl = Date.now();
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: DTYPE, device: 'cpu' });
console.log(`[bake] model ready in ${((Date.now() - tl) / 1000).toFixed(1)} s`);
mkdirSync(join(WORK, 'clips'), { recursive: true });

const progressFile = join(WORK, `progress-${SHARD}.json`);
const indexFile = join(WORK, `index-${SHARD}.jsonl`);
let doneNow = 0, audioSec = 0, computeSec = 0, bytesNow = 0, failed = 0;
let usedBytes = [...index.keys()].reduce((n, k) => n + statSync(clipFile(k)).size, 0);
const started = new Date().toISOString();
const writeProgress = (cur) => atomicWrite(progressFile, JSON.stringify({
  pid: process.pid, shard: `${SHARD}/${SHARDS}`, started, updated: new Date().toISOString(), done: doneNow, remaining: todo.length - doneNow - failed, failed,
  packClips: index.size, packMb: +(usedBytes / 1e6).toFixed(2), rtf: audioSec ? +(computeSec / audioSec).toFixed(2) : null,
  etaMin: audioSec ? +(((todo.length - doneNow - failed) * (audioSec / Math.max(1, doneNow)) * (computeSec / audioSec)) / 60).toFixed(0) : null, current: cur,
}));

for (const c of todo) {
  if (usedBytes > BUDGET * 1.02) { console.log('[bake] budget reached, stopping'); break; }
  writeProgress({ key: c.key, tier: c.tier, bank: c.bank, text: c.text.slice(0, 60) });
  try {
    const ts = Date.now();
    const gen = await tts.generate(c.text, { voice: c.voice, speed: c.speed });
    computeSec += (Date.now() - ts) / 1000;
    const raw = gen.audio;
    audioSec += raw.length / gen.sampling_rate;
    if (gen.sampling_rate !== SAMPLE_RATE) throw new Error(`unexpected sample rate ${gen.sampling_rate}`);
    const trimmed = trimSilence(raw, SAMPLE_RATE, 0.03);
    // Normalise, encode, decode and measure what the player will get; correct the target once or twice for MP3 drift.
    let target = -16, ceil = -3.0, mp3, back, lufs, peak;
    for (let attempt = 0; attempt < 3; attempt++) {
      const norm = normalise(trimmed, SAMPLE_RATE, target, ceil);
      mp3 = await encode(norm.samples, BITRATE[c.kind] ?? 48);
      back = await decode(mp3);
      lufs = integratedLufs(back, SAMPLE_RATE); peak = peakDb(back);
      if (!Number.isFinite(lufs) || (Math.abs(lufs + 16) <= 0.4 && peak <= -1.6)) break;
      target += -16 - lufs;
      if (peak > -1.6) ceil -= peak + 1.6 + 0.2;
    }
    if (!Number.isFinite(lufs) || back.length < 1200) throw new Error('silent or empty clip');
    writeFileSync(clipFile(c.key), mp3);
    const rec = { key: c.key, who: c.who, tier: c.tier, bank: c.bank, dur: +(back.length / SAMPLE_RATE).toFixed(3), lufs: +lufs.toFixed(2), peak: +peak.toFixed(2), bytes: mp3.length };
    appendFileSync(indexFile, JSON.stringify(rec) + '\n');
    index.set(c.key, rec);
    usedBytes += mp3.length; bytesNow += mp3.length; doneNow++;
  } catch (e) {
    failed++; console.warn(`[bake] FAILED ${c.key} (${c.text.slice(0, 40)}): ${e.message}`);
  }
  if ((doneNow + failed) % 25 === 0) {
    if (SHARDS === 1) assemble(plan, index);
    console.log(`[bake] ${doneNow}/${todo.length} done, rtf ${(computeSec / Math.max(1, audioSec)).toFixed(2)}, pack ${(usedBytes / 1e6).toFixed(2)} MB`);
  }
}
writeProgress(null);
if (SHARDS === 1) { const m = assemble(plan, readIndex()); console.log(`[bake] finished: ${m.clips}/${m.planned} clips, ${(m.bytes / 1e6).toFixed(2)} MB, lufs ${JSON.stringify(m.lufs)}, peak max ${m.peakMax}`); }
else console.log('[bake] shard finished; run with --assemble to build the pack');
