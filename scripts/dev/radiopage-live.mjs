// Drives the radio page with the network OPEN and reports, station by station, what really happens: status, title, whether media
// advances, failed requests and console errors. Use on a local preview or the live site:
//   node scripts/dev/radiopage-live.mjs <url> [--phone] [--secs 12] [--only id,id]
// Nobody hears anything here; "advancing" means the media clock moved. This Chromium may lack some codecs (AAC): a stream that
// fails here with a decode error can still play in a real browser. Say so when reporting.
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const a = process.argv.slice(2), url = a[0], phone = a.includes('--phone');
const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const secs = Number(arg('secs', 12)), only = arg('only', '').split(',').filter(Boolean);
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({ proxy: proxy ? { server: proxy } : undefined, args: ['--mute-audio'] });
const ctx = await browser.newContext({ ...(phone ? devices['iPhone 13'] : { viewport: { width: 1280, height: 800 } }), ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const errs = [], failed = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 200)));
page.on('requestfailed', (r) => failed.push(new URL(r.url()).host + ' ' + (r.failure()?.errorText ?? '')));
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => !!window.__radioPage, null, { timeout: 60000 });
const ids = await page.evaluate(() => { const p = window.__radioPage; const out = []; const d = p.director ?? p['director']; for (const s of (d.stations ?? d.catalog ?? [])) out.push(s.id); return out; });
// one real gesture so audio may start
if (phone) await page.touchscreen.tap(195, 300); else await page.mouse.click(640, 300);
await page.evaluate(() => window.__radioPage.unlockAudio());
const out = [];
for (const id of ids) {
  if (only.length && !only.includes(id)) continue;
  errs.length = 0; failed.length = 0;
  await page.evaluate((id) => window.__radioPage.tune(id), id);
  const snap = () => page.evaluate(() => { const v = window.__radioPage.view(); const au = [...document.querySelectorAll('audio')].map((x) => ({ t: +x.currentTime.toFixed(1), paused: x.paused, err: x.error ? x.error.code + ' ' + (x.error.message || '').slice(0, 80) : '', src: (x.currentSrc || '').slice(0, 60) })); return { on: v.on, status: v.status, title: v.title, dj: v.dj, pos: v.pos, frames: document.querySelectorAll('iframe').length, au }; });
  await page.waitForTimeout(secs * 500); const s1 = await snap();
  await page.waitForTimeout(secs * 500); const s2 = await snap();
  const adv = (s2.pos != null && s1.pos != null && s2.pos > s1.pos) || s2.au.some((x, i) => s1.au[i] && x.t > s1.au[i].t);
  out.push({ id, level: s2.status.level, text: s2.status.text, reason: s2.status.reason, title: (s2.title || '').slice(0, 50), pos: [s1.pos, s2.pos], advancing: adv, audio: s2.au.filter((x) => x.src), errors: [...new Set(errs)].slice(0, 3), failed: [...new Set(failed)].slice(0, 4) });
  console.log(JSON.stringify(out[out.length - 1]));
}
await browser.close();
