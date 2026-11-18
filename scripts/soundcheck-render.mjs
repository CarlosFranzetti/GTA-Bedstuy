// SOUNDCHECK: 60 s street scene through the real AudioSystem, offline, with per-bus stems and a loudness report.
//   SWARM_LIGHT=1 scripts/swarm-render.sh node scripts/soundcheck-render.mjs street [--out dir] [--tag name] [--car sedan] [--no-standin]
// Speech stand-ins are real baked clips of the voice pack (public/voice): a DJ line and two pedestrian barks.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const a = process.argv.slice(2);
const mode = a[0] ?? 'street';
const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const out = resolve(arg('out', '/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/soundcheck'));
const tag = arg('tag', 'street');
mkdirSync(out, { recursive: true });

// ---- real baked clips for the voices
const man = JSON.parse(readFileSync('public/voice/manifest.json', 'utf8'));
function decode(file, off, len) {
  const mp3 = readFileSync(resolve('public/voice', file)).subarray(off, off + len);
  const f32 = execFileSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-f', 'f32le', '-ar', '24000', '-ac', '1', 'pipe:1'], { input: mp3, maxBuffer: 1 << 26 });
  return f32.toString('base64');
}
const pick = (pred) => Object.values(man.entries).find(pred);
const dj = pick((e) => ['tommy','lou','deja','cass'].includes(e.who) && e.dur > 3 && e.dur < 6);
const b1 = pick((e) => /^g(09|10|11)$/.test(e.who) && e.file.includes('bark') && e.dur > 1.8 && e.dur < 3);
const b2 = pick((e) => /^g0[0-4]$/.test(e.who) && e.file.includes('bark') && e.dur > 1.8 && e.dur < 3);
console.log('speech stand-ins:', JSON.stringify([dj, b1, b2].map((e) => e && { who: e.who, text: e.text, dur: e.dur, lufs: e.lufs })));
const speech = mode !== 'street' ? null : { dj: decode(dj.file, dj.off, dj.len), bark1: decode(b1.file, b1.off, b1.len), bark2: decode(b2.file, b2.off, b2.len) };

const js = execFileSync('npx', ['--no-install', 'esbuild', mode === 'stutter' ? 'scripts/soundcheck-stutter.ts' : 'scripts/soundcheck-harness.ts', '--bundle', '--format=iife', '--target=es2022', `--alias:@=${resolve('src')}`, '--log-level=error'], { maxBuffer: 1 << 28 }).toString();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 400)));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: js });
if (mode === 'stutter') {
  const R = [];
  for (const [fn, ...args] of [['voiceSteal'], ['sirenRelease', 'whoop'], ['sirenRelease', 'hilo'], ['engineSwap'], ['hardCut'], ['limiter'], ['gearDip', 'sedan'], ['gearDip', 'bus'], ['gearDip', 'boxtruck'], ['gearDip', 'coupe911'], ['gearDip', 'cab']]) {
    const r = await page.evaluate(([fn, args]) => window.stutter[fn](...args), [fn, args]);
    for (const x of [r].flat()) { R.push(x); console.log(JSON.stringify(x)); }
  }
  writeFileSync(`${out}/stutter_${tag}.json`, JSON.stringify(R, null, 1));
}
if (mode === 'street') {
  const r = await page.evaluate(([speech, standIn, car]) => window.soundcheck.street({ speech, standInRadio: standIn, carType: car }), [speech, !a.includes('--no-standin'), arg('car', 'sedan')]);
  for (const [s, b64] of Object.entries(r.files)) writeFileSync(`${out}/${tag}_${s}.wav`, Buffer.from(b64, 'base64'));
  delete r.files;
  writeFileSync(`${out}/${tag}.json`, JSON.stringify(r, null, 1));
  console.log('peaks dBFS', JSON.stringify(r.peaks));
  for (const [w, v] of Object.entries(r.report)) console.log(w.padEnd(15), Object.entries(v).map(([k, x]) => `${k} ${x}`).join('  '));
}
await browser.close();
