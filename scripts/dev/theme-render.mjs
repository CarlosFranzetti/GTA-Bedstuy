// THEME: render the title theme (src/audio/titleThemeV2.ts) offline in headless Chrome to a float WAV, no speakers needed.
//   SWARM_LIGHT=1 scripts/swarm-render.sh node scripts/dev/theme-render.mjs [--motif a|b|c] [--loops 2] [--vol 0.76] [--out dir] [--tag name]
// Writes <out>/<tag>.wav (stereo float32, 44.1 kHz, scheduled for N full loops plus a 5 s tail). Measure with scripts/dev/theme-measure.py.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const require = createRequire('/opt/node-tools/node_modules/');
const { chromium } = require('playwright');
const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const out = resolve(arg('out', '/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/theme'));
const tag = arg('tag', 'title-' + arg('motif', 'a'));
mkdirSync(out, { recursive: true });
const esbuild = process.env.ESBUILD ?? '/root/.npm/_npx/beb367dfa21eb3f5/node_modules/.bin/esbuild';
const entry = resolve(out, 'entry.ts');
writeFileSync(entry, `import * as T from '@/audio/titleThemeV2';
(window as any).render = async (motif: string, loops: number, vol: number) => {
  const sr = 44100, secs = loops * T.LOOP_SEC + 5, ctx = new OfflineAudioContext(2, Math.ceil(sr * secs), sr);
  const th = T.createTitleTheme(ctx, ctx.destination, { manual: true, volume: vol, motif: motif as T.MotifId });
  th.start(); th.scheduleUntil(loops * T.LOOP_SEC + 0.2);
  const nodes = th.nodesCreated;
  const buf = await ctx.startRendering();
  const l = buf.getChannelData(0), r = buf.getChannelData(1), n = l.length, b = new Uint8Array(n * 8);
  const dv = new DataView(b.buffer); for (let i = 0; i < n; i++) { dv.setFloat32(i * 8, l[i], true); dv.setFloat32(i * 8 + 4, r[i], true); }
  let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return { b64: btoa(s), nodes, loopSec: T.LOOP_SEC, t0: 0.06 };
};`);
const js = execFileSync(esbuild, [entry, '--bundle', '--format=iife', '--target=es2022', `--alias:@=${resolve('src')}`, '--log-level=error'], { maxBuffer: 1 << 28 }).toString();
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 400)));
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: js });
const r = await page.evaluate(([m, l, v]) => window.render(m, l, v), [arg('motif', 'a'), +arg('loops', '2'), +arg('vol', '0.76')]);
const f32 = Buffer.from(r.b64, 'base64');
const hdr = Buffer.alloc(44); const sr = 44100;
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + f32.length, 4); hdr.write('WAVEfmt ', 8); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(3, 20); hdr.writeUInt16LE(2, 22);
hdr.writeUInt32LE(sr, 24); hdr.writeUInt32LE(sr * 8, 28); hdr.writeUInt16LE(8, 32); hdr.writeUInt16LE(32, 34); hdr.write('data', 36); hdr.writeUInt32LE(f32.length, 40);
writeFileSync(`${out}/${tag}.wav`, Buffer.concat([hdr, f32]));
writeFileSync(`${out}/${tag}.json`, JSON.stringify({ nodes: r.nodes, loopSec: r.loopSec, t0: r.t0 }));
console.log(`wrote ${out}/${tag}.wav  nodes scheduled ${r.nodes}  loop ${r.loopSec.toFixed(2)} s`);
await browser.close();
