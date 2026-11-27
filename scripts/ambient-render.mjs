// AMBIENT: before/after table of the environment sources, one at a time (see scripts/ambient-harness.ts).
//   NODE_PATH=/opt/node-tools/node_modules:/home/user/GTA-Bedstuy/node_modules SWARM_LIGHT=1 scripts/swarm-render.sh node scripts/ambient-render.mjs [--src dir] [--tag name] [--secs 40] [--only a,b]
// --src <dir>  bundle the audio code of another tree (a `git archive` of the commit before the lane) instead of src/.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const out = resolve(arg('out', '/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/ambient'));
const tag = arg('tag', 'after');
const secs = +arg('secs', '40');
mkdirSync(out, { recursive: true });
const js = execFileSync('npx', ['--no-install', 'esbuild', 'scripts/ambient-harness.ts', '--bundle', '--format=iife', '--target=es2022', `--alias:@=${resolve(arg('src', 'src'))}`, '--log-level=error'], { maxBuffer: 1 << 28 }).toString();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 400)));
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: js });
const names = a.includes('--cost') && !arg('only', '') ? [] : arg('only', '') ? arg('only', '').split(',') : await page.evaluate(() => window.ambient.names);
const R = [];
for (const name of names) {
  for (const [hz, stalls] of [[60, false], [30, false], [15, false], [60, true]]) {
    if ((name === 'hum_day' || name === 'hum_night') && (hz !== 60 || stalls) && !(hz === 60 && stalls)) continue; // a static graph does not care about the main thread
    const r = await page.evaluate(([n, h, s, c]) => window.ambient.runOne(n, h, s, c), [name, hz, stalls, secs]);
    R.push(r);
    console.log(JSON.stringify(r));
  }
}
if (a.includes('--cost')) for (const n of ['hum_day', 'wash', 'road', 'weather', 'env_all']) { const r = await page.evaluate(([n, c]) => window.ambient.cost(n, c), [n, 30]); R.push({ cost: r }); console.log(JSON.stringify(r)); }
writeFileSync(`${out}/ambient_${tag}.json`, JSON.stringify(R, null, 1));
await browser.close();
