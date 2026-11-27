// RADIOUX mockups: phone first screen, station grid with the mini player, whole page (sections closed), desktop, plus 360x740, tablet and a faked
// "sound blocked" state. Network open.  node scripts/dev/radiopage-mock.mjs <url> <outDir> [--station bkhouse] [--secs 9]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const a = process.argv.slice(2), url = a[0], out = a[1]; mkdirSync(out, { recursive: true });
const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const station = arg('station', 'bkhouse'), secs = Number(arg('secs', 9));
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({ proxy: proxy ? { server: proxy, bypass: 'localhost,127.0.0.1' } : undefined, args: ['--mute-audio'] });
async function run(w, h, tag, steps) {
  const phone = w < 700;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => !!window.__radioPage, null, { timeout: 60000 });
  await page.evaluate((id) => { const p = window.__radioPage; p.unlockAudio(); p.tune(id); }, station);
  await page.waitForTimeout(secs * 1000);
  await steps(page);
  const m = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, overflowX: document.documentElement.scrollWidth > innerWidth }));
  console.log(tag, JSON.stringify(m));
  await ctx.close();
}
await run(390, 844, 'phone390', async (p) => {
  await p.screenshot({ path: `${out}/radioux-phone-first-screen.png` });
  await p.evaluate(() => document.querySelector('.stations').scrollIntoView({ block: 'start' })); await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/radioux-phone-stations.png` });
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/radioux-phone-full.png`, fullPage: true });
  await p.evaluate(() => { const s = document.querySelector('.status'); s.dataset.level = 'tap'; s.querySelector('b').textContent = 'Tap to hear it'; s.querySelector('.reason').textContent = 'Your phone is blocking sound until you tap.'; s.querySelector('.go').hidden = false; });
  await p.screenshot({ path: `${out}/radioux-phone-blocked-faked.png` });
});
await run(360, 740, 'phone360', async (p) => { await p.screenshot({ path: `${out}/radioux-360x740.png` }); });
await run(768, 1024, 'tablet', async (p) => { await p.screenshot({ path: `${out}/radioux-768x1024.png` }); });
await run(1280, 800, 'desktop', async (p) => { await p.screenshot({ path: `${out}/radioux-desktop.png` }); await p.screenshot({ path: `${out}/radioux-desktop-full.png`, fullPage: true }); });
await browser.close();
