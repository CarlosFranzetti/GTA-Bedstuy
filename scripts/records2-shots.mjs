// RECORDS2 lane: shop screenshots (dance crates, a liner note, the listening post filled and empty) and the clip decode check.
// node scripts/records2-shots.mjs <outDir> [--port 4477] [--hosted]   Run through SWARM_SMALL=1 scripts/swarm-render.sh. Non-localhost requests are blocked.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = resolve(process.argv[2] ?? 'records2-shots'); mkdirSync(out, { recursive: true });
const port = Number(arg('--port', 4477));
const env = { ...process.env, VITE_HOSTED: '1' };
const srv = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore', env });
const base = `http://127.0.0.1:${port}/scripts/records2-harness.html`;
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(base)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const blocked = [];
  const open = async (vp, mobile, query = '') => {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    await ctx.route((u) => !['127.0.0.1', 'localhost'].includes(u.hostname), (r) => { blocked.push(r.request().url()); return r.abort(); });
    const page = await ctx.newPage(); page.setDefaultTimeout(120000);
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(base + query); await page.waitForFunction(() => !!window.__r2); await page.waitForTimeout(800);
    return { ctx, page, errors };
  };
  const D = { width: 1280, height: 800 };
  let { ctx, page, errors } = await open(D, false);
  // 1. decode every clip: fetch, decode, non-silent
  const report = [];
  for (const id of await page.evaluate(() => window.__r2.ids)) report.push(await page.evaluate((i) => window.__r2.probe(i), id));
  writeFileSync(`${out}/decode.json`, JSON.stringify(report, null, 1));
  console.log('decoded', report.length, 'min rms', Math.min(...report.map((r) => r.rms)).toFixed(4), 'min secs', Math.min(...report.map((r) => r.seconds)).toFixed(1));
  // 2. crates
  const chip = async (text) => { await page.evaluate((t) => { [...document.querySelectorAll('.shop-chip')].find((b) => b.textContent === t).click(); }, text); await page.waitForTimeout(300); };
  await page.screenshot({ path: `${out}/01-all.png` });
  for (const [i, t] of ['House & tech house', 'Electro & progressive', 'Breaks', 'Disco & nu-disco', 'Pre-war dance floor'].entries()) { await chip(t); await page.screenshot({ path: `${out}/02-crate-${i + 1}.png` }); }
  await chip('Disco & nu-disco');
  await page.evaluate(() => { document.querySelectorAll('.shop-card')[0].querySelector('.shop-btn').click(); }); await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/03-liner-bysa.png` });
  await page.evaluate(() => window.__r2.shop.closeLiner());
  // sleeve eras at liner size: 12-inch (synth), promo (synth), 2000s picture sleeve (house crate)
  await chip('Synth originals');
  for (const [i, name] of [[3, 'twelve'], [4, 'promo']]) { await page.evaluate((k) => { document.querySelectorAll('.shop-card')[k].querySelector('.shop-btn').click(); }, i); await page.waitForTimeout(250); await page.screenshot({ path: `${out}/03-liner-${name}.png`, clip: { x: 280, y: 60, width: 720, height: 360 } }); await page.evaluate(() => window.__r2.shop.closeLiner()); }
  await chip('House & tech house');
  await page.evaluate(() => { document.querySelectorAll('.shop-card')[3].querySelector('.shop-btn').click(); }); await page.waitForTimeout(250); await page.screenshot({ path: `${out}/03-liner-picture.png`, clip: { x: 280, y: 60, width: 720, height: 360 } }); await page.evaluate(() => window.__r2.shop.closeLiner());
  await chip('Listening post'); await page.screenshot({ path: `${out}/04-post.png` });
  await page.evaluate(() => window.__r2.shop.togglePost('post-liath')); await page.waitForTimeout(500);
  console.log('listen flag', await page.evaluate(() => window.__listen), 'iframe', await page.evaluate(() => document.querySelector('.shop-post-player')?.getAttribute('src')?.slice(0, 60)));
  await page.screenshot({ path: `${out}/05-post-playing.png` });
  await page.evaluate(() => window.__r2.shop.close()); console.log('listen flag after close', await page.evaluate(() => window.__listen));
  console.log('errors', errors); await ctx.close();
  ({ ctx, page, errors } = await open(D, false, '?post=empty'));
  await chip('Listening post'); await page.screenshot({ path: `${out}/06-post-empty.png` }); await ctx.close();
  ({ ctx, page, errors } = await open({ width: 390, height: 844 }, true));
  await page.screenshot({ path: `${out}/07-phone.png` }); await chip('House & tech house'); await page.screenshot({ path: `${out}/08-phone-house.png` }); await ctx.close();
  console.log('blocked non-local requests:', blocked.length, [...new Set(blocked.map((u) => new URL(u).hostname))]);
  await browser.close();
} finally { srv.kill(); }
