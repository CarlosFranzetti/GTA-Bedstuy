// Offline render + distinctness report for the vehicle sound model.
// Usage: scripts/swarm-render.sh node scripts/sfx14-render.mjs [--out <dir>] [--engine-min 2.0] [--horn-min 1.5]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import { execFileSync } from 'node:child_process';
const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const out = resolve(arg('out', '/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/sfx14'));
const engMin = Number(arg("engine-min", 2.5)), hornMin = Number(arg('horn-min', 1.5));
mkdirSync(out, { recursive: true });
const bundleJs = execFileSync('npx', ['--no-install', 'esbuild', 'scripts/sfx14-harness.ts', '--bundle', '--format=iife', '--target=es2022', `--alias:@=${resolve('src')}`], { maxBuffer: 1 << 26 }).toString();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: bundleJs });
const REP = ['sedan', 'cab', 'boxtruck', 'hatch', 'beater', 'bus', 'pony', 'luxury', 'minivan', 'garbage'];
const engines = [], horns = [];
for (const t of await page.evaluate(() => window.sfx14.types)) engines.push(await page.evaluate((t) => window.sfx14.renderEngine(t), t));
for (const t of await page.evaluate(() => window.sfx14.hornTypes)) horns.push(await page.evaluate((t) => window.sfx14.renderHorn(t, t, t === 'cop' ? 'wail' : t === 'ambulance' ? 'wail' : undefined, t === 'cop' || t === 'ambulance' ? 4 : 1.2), t));
for (const [n, t, m] of [['cop_whoop', 'cop', 'whoop'], ['cop_yelp', 'cop', 'yelp'], ['ambulance_yelp', 'ambulance', 'yelp'], ['ambulance_hilo', 'ambulance', 'hilo'], ['ambulance_parody', 'ambulance', 'parody']]) horns.push(await page.evaluate(([n, t, m]) => window.sfx14.renderHorn(n, t, m, 3.5), [n, t, m]));
horns.push(await page.evaluate(() => window.sfx14.renderHorn('novelty_ooga', 'sedan', undefined, 0.9, true)));
const startstop = await page.evaluate(() => window.sfx14.renderEngine('sedan', 6, true));
const fx = await page.evaluate(() => window.sfx14.renderFx());
await browser.close();
const save = (n, b64) => writeFileSync(`${out}/${n}.wav`, Buffer.from(b64, 'base64'));
for (const e of engines) if (REP.includes(e.type)) save(`engine_${e.type}`, e.wav);
save('engine_sedan_start_stop', startstop.wav);
for (const h of horns) save(`horn_${h.name}`, h.wav);
const rms = (u, v) => Math.sqrt(u.reduce((s, x, i) => s + (x - v[i]) ** 2, 0) / u.length);
const ed = (p, q) => Math.sqrt((rms(p.idleBands, q.idleBands) ** 2 + rms(p.fullBands, q.fullBands) ** 2) / 2);
let minE = [1e9, ''], minH = [1e9, ''];
const rowsE = engines.map((e) => ({ type: e.type, idleHz: +e.idleHz.toFixed(1), redHz: +e.redHz.toFixed(0), idlePk: +e.idlePeak.toFixed(0), centroid: +e.centroid.toFixed(0), rmsDb: +e.rmsDb.toFixed(1), peakDb: +e.peakDb.toFixed(1), shifts: e.shifts }));
const typesH = horns.filter((h) => !h.name.includes('_'));
for (let i = 0; i < engines.length; i++) for (let j = i + 1; j < engines.length; j++) { const d = ed(engines[i], engines[j]); if (d < minE[0]) minE = [d, `${engines[i].type}/${engines[j].type}`]; }
for (let i = 0; i < typesH.length; i++) for (let j = i + 1; j < typesH.length; j++) { const d = rms(typesH[i].bands, typesH[j].bands); if (d < minH[0]) minH = [d, `${typesH[i].name}/${typesH[j].name}`]; }
const nearest = (list, f, key) => list.map((p) => { let b = [1e9, '']; for (const q of list) if (q !== p) { const d = f(p, q); if (d < b[0]) b = [d, q[key]]; } return { n: p[key], d: +b[0].toFixed(2), with: b[1] }; });
const nE = nearest(engines, ed, 'type'), nH = nearest(typesH, (p, q) => rms(p.bands, q.bands), 'name');
console.log('ENGINES (firing Hz at idle/redline, idle spectral peak <400Hz, centroid at WOT, loudness, peak dBFS, nearest neighbour dB distance)');
for (const r of rowsE) console.log(r.type.padEnd(10), String(r.idleHz).padStart(6), String(r.redHz).padStart(6), String(r.idlePk).padStart(5), String(r.centroid).padStart(6), String(r.rmsDb).padStart(6), String(r.peakDb).padStart(6), ' nn', nE.find((x) => x.n === r.type).d, nE.find((x) => x.n === r.type).with);
console.log('HORNS (centroid, peak Hz<400, peak dBFS, nearest)');
for (const h of horns) console.log(h.name.padEnd(18), String(Math.round(h.centroid)).padStart(6), String(Math.round(h.peakHz)).padStart(5), h.peakDb.toFixed(1).padStart(6), nH.find((x) => x.n === h.name) ? ' nn ' + nH.find((x) => x.n === h.name).d + ' ' + nH.find((x) => x.n === h.name).with : '');
console.log('FX peak dBFS', JSON.stringify(Object.fromEntries(Object.entries(fx).map(([k, v]) => [k, +v.toFixed(1)]))));
const clip = [...engines.map((e) => e.peakDb), ...horns.map((h) => h.peakDb), ...Object.values(fx), startstop.peakDb].some((p) => p > -1);
console.log(`min engine distance ${minE[0].toFixed(2)} dB (${minE[1]}) need >= ${engMin}; min horn distance ${minH[0].toFixed(2)} dB (${minH[1]}) need >= ${hornMin}; clipping ${clip}`);
writeFileSync(`${out}/report.json`, JSON.stringify({ engines: rowsE, nearestEngine: nE, nearestHorn: nH, fx, minE, minH }, null, 1));
process.exit(minE[0] >= engMin && minH[0] >= hornMin && !clip ? 0 : 1);
