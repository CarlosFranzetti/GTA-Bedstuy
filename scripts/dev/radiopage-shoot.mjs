// RADIOPAGE / BOOMBOX: boots the BUILT /radio/ page headless, taps every station, reports each station's status line, collects console errors and
// takes screenshots at desktop and phone width. Outside hosts are blocked (as in this box), so SoundCloud, the live streams and the RA pool
// are expected to fail here, with a reason: that is what this checks. Nothing can be heard.
//
//   VITE_HOSTED=1 npx vite build --outDir <dist> --emptyOutDir
//   SWARM_SMALL=1 scripts/swarm-render.sh node scripts/dev/radiopage-shoot.mjs <dist> [--out docs/swarm/teams/sheets] [--port 4478] [--allow-net]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const a = process.argv.slice(2);
const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const dist = resolve(a[0] ?? 'dist');
const out = resolve(arg('out', 'docs/swarm/teams/sheets'));
const port = Number(arg('port', 4478));
const allowNet = a.includes('--allow-net');
const prefix = arg('prefix', 'boombox');
// BOOMBOX: a fake line goes through the page's own path (RadioPage.noteLine: the caption and the log), held 60 s for the picture.
const fakeLine = (kind, who, text, parodyOf, station) => ({ kind, who, text, parodyOf, stationId: station, station });
mkdirSync(out, { recursive: true });
const srv = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://localhost:${port}/radio/`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const report = { errors: [], blocked: [], stations: [], pageBytes: 0 };
try {
  for (const mode of ['desktop', 'phone']) {
    const ctx = await browser.newContext(mode === 'phone' ? { ...devices['iPhone 13'] } : { viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.route('**/*', (r) => {
      const h = new URL(r.request().url()).hostname;
      if (allowNet || h === 'localhost' || h === '127.0.0.1') return r.continue();
      report.blocked.push(h); return r.abort();
    });
    page.on('console', (m) => { if (m.type() === 'error') report.errors.push(`${mode}: ${m.text().slice(0, 240)}`); });
    page.on('pageerror', (e) => report.errors.push(`${mode} pageerror: ${String(e).slice(0, 240)}`));
    await page.goto(`http://localhost:${port}/radio/`, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForSelector('button.preset');
    const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    report[`${mode}Width`] = width;
    report[`${mode}Overflow`] = width.scroll > width.client;
    if (mode === 'desktop') {
      const ids = await page.$$eval('button.preset', (bs) => bs.map((b) => b.getAttribute('data-id')));
      for (const id of ids) {
        await page.click(`button.preset[data-id="${id}"]`);
        await page.waitForTimeout(allowNet ? 4000 : 700);
        report.stations.push(await page.evaluate((id) => ({
          id, name: document.querySelector('.stn').textContent, freq: document.querySelector('.freq').textContent,
          level: document.querySelector('.status').dataset.level, status: document.querySelector('.status b').textContent, reason: document.querySelector('.status .reason').textContent.slice(0, 120),
          now: document.querySelector('.np').textContent.slice(0, 80), iframes: document.querySelectorAll('#widget iframe').length,
        }), id));
      }
      await page.click('button.preset[data-id="talk"]');
      await page.waitForTimeout(1500);
      await page.evaluate((l) => window.__radioPage.noteLine(l, 60000), fakeLine('talk', 'Dmitri Vance, bad impressionist', 'And that, folks, is why the stoop is the only honest parliament in Brooklyn. Mostly parody. Entirely a bit.', 'a public figure', 'talk'));
      await page.waitForTimeout(900);
      report.desktopBars = await page.evaluate(() => ({ label: document.querySelector('.vlabel').textContent, src: document.querySelector('.vlabel').dataset.src, caption: document.querySelector('.caption').className }));
      await page.screenshot({ path: resolve(out, `${prefix}-desktop.png`), fullPage: false });
      await page.screenshot({ path: resolve(out, `${prefix}-desktop-full.png`), fullPage: true });
      // keyboard: arrows tune along the strip, space stops
      const before = await page.evaluate(() => document.querySelector('.stn').textContent);
      await page.keyboard.press('ArrowRight'); await page.waitForTimeout(700);
      report.keyboard = { before, after: await page.evaluate(() => document.querySelector('.stn').textContent) };
    } else {
      await page.screenshot({ path: resolve(out, `${prefix}-phone-start.png`), fullPage: false });
      await page.tap('button.preset[data-id="hiphop"]');
      await page.waitForTimeout(1500);
      await page.evaluate((l) => window.__radioPage.noteLine(l, 60000), fakeLine('dj-intro', 'Tayo Okafor', 'You are locked in to Stoop Hip Hop Radio, ninety-three point five. Tonight the mix belongs to the DJ on your screen.', '', 'hiphop'));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(900);
      await page.screenshot({ path: resolve(out, `${prefix}-phone.png`), fullPage: false });
      await page.screenshot({ path: resolve(out, `${prefix}-phone-full.png`), fullPage: true });
      report.phoneSmallControls = await page.evaluate(() => Array.from(document.querySelectorAll('button, [role=slider], input')).filter((e) => e.getAttribute('aria-hidden') !== 'true' && e.tabIndex >= 0).map((e) => { const r = e.getBoundingClientRect(); return { t: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((x) => x.h > 0 && (x.h < 44 || x.w < 44)));
    }
    await ctx.close();
  }
} finally { await browser.close(); srv.kill(); }
report.blocked = [...new Set(report.blocked)];
console.log(JSON.stringify(report, null, 1));
process.exit(report.errors.length ? 1 : 0);
