// Phone-first look at the radio page with the network open: full-page and first-screen pictures with a station playing, plus
// a list of tap targets under 44 px, horizontal overflow, and what the first screen holds.
//   node scripts/dev/radiopage-ux.mjs <url> <outDir> [--station id] [--w 390 --h 844]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const a = process.argv.slice(2), url = a[0], out = a[1]; mkdirSync(out, { recursive: true });
const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const w = Number(arg('w', 390)), h = Number(arg('h', 844)), station = arg('station', 'bkhouse'), tag = arg('tag', `${w}`);
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({ proxy: proxy ? { server: proxy, bypass: 'localhost,127.0.0.1' } : undefined, args: ['--mute-audio'] });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 700, hasTouch: w < 700, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => !!window.__radioPage, null, { timeout: 60000 });
await page.screenshot({ path: `${out}/${tag}-0-arrival.png` });
if (w < 700) await page.touchscreen.tap(w / 2, 200); else await page.mouse.click(w / 2, 200);
await page.evaluate((id) => { const p = window.__radioPage; p.unlockAudio(); p.tune(id); }, station);
await page.waitForTimeout(9000);
await page.screenshot({ path: `${out}/${tag}-1-first-screen.png` });
await page.screenshot({ path: `${out}/${tag}-2-full.png`, fullPage: true });
const rep = await page.evaluate((ALL) => {
  const vw = innerWidth, small = [];
  for (const e of document.querySelectorAll('button, a, input, select, [role=button], [role=slider], [tabindex]')) {
    const r = e.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    if (!ALL && e.checkVisibility && !e.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })) continue; // inside a closed <details>
    if (r.width < 44 || r.height < 44) small.push(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${String(e.className).split(' ')[0]} ${Math.round(r.width)}x${Math.round(r.height)} "${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 24)}"`);
  }
  const v = window.__radioPage.view();
  return { overflowX: document.documentElement.scrollWidth > vw, pageHeight: document.documentElement.scrollHeight, viewport: [vw, innerHeight], status: v.status, title: v.title, smallTargets: small.length, small: small.slice(0, 40) };
}, a.includes('--count-hidden'));
console.log(JSON.stringify(rep, null, 1));
await browser.close();
