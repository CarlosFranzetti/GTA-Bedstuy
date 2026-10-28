// Lighting audit: renders hours x viewpoints headlessly and prints luminance stats per frame.
// Usage: npm run build && node scripts/light-audit.mjs [--out DIR] [--hours 6,9,12] [--views street,car,aerial] [--q low,medium] [--medium-hours 12,21]
// Stats (sRGB-encoded luma 0..1): mean, %>0.95 (blown), %<0.05 (crushed), mean HSV saturation; "low" = bottom half (street level only).
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('out', '/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/light-audit');
const HOURS = arg('hours', '6,9,12,15,18,19.5,21,0').split(',').map(Number);
const VIEWS = arg('views', 'street,car,aerial').split(',');
const QS = arg('q', 'low,medium').split(',');
const MEDIUM_HOURS = arg('medium-hours', '12,18,0').split(',').map(Number);
const PORT = Number(arg('port', '4173'));
const DIST = arg('dist', 'dist');
const TAG = arg('tag', '');
mkdirSync(OUT, { recursive: true });

const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort', '--outDir', DIST], { stdio: ['ignore', 'pipe', 'pipe'] });
preview.stderr.on('data', (d) => process.stderr.write(d));
const waitForServer = async () => {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://localhost:${PORT}/`)).ok) return; } catch {} await new Promise((r) => setTimeout(r, 250)); }
  throw new Error('preview server did not start');
};
const hardStop = setTimeout(() => { console.error('[audit] hard timeout'); process.exit(2); }, 1_500_000);

const PY = `
import sys, warnings
warnings.simplefilter('ignore')
from PIL import Image
rows = []
for p in sys.argv[1:]:
    im = Image.open(p).convert('RGB')
    w, h = im.size
    px = list(im.getdata())  # noqa
    def stats(pixels):
        n = len(pixels); s = 0.0; blown = 0; dark = 0; sat = 0.0
        for r, g, b in pixels:
            l = (0.2126*r + 0.7152*g + 0.0722*b) / 255.0
            s += l
            if l > 0.95: blown += 1
            if l < 0.05: dark += 1
            mx = max(r, g, b); mn = min(r, g, b)
            sat += (mx - mn) / mx if mx else 0.0
        return s/n, 100.0*blown/n, 100.0*dark/n, sat/n
    a = stats(px)
    lo = stats(px[(h//2)*w:])
    print('%s mean=%.3f blown=%.2f%% dark=%.1f%% sat=%.2f | low-half mean=%.3f blown=%.2f%%' % (p.split('/')[-1], a[0], a[1], a[2], a[3], lo[0], lo[1]))
`;

let browser;
const results = [];
try {
  await waitForServer();
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const q of QS) {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/?q=${q}`, { waitUntil: 'load', timeout: 90_000 });
    await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 120_000 });
    await page.evaluate(async () => { await window.__gtaDebug.packsReady; const d = window.__gtaDebug; d.dayNight.hoursPerSecond = 0; const o = document.getElementById('overlay'); if (o) o.style.display = 'none'; });
    const t0 = Date.now();
    const hours = q === 'low' ? HOURS : MEDIUM_HOURS;
    for (const view of VIEWS) {
      await page.evaluate((view) => {
        const d = window.__gtaDebug;
        d.clearFreeCam();
        const p = d.player;
        if (view === 'street') { if (p.inVehicle) p.exit(); d.teleport(9, 20, 0); }
        if (view === 'car' && !p.inVehicle) {
          // nearest traffic car to the spawn crossing (map centre: lit streets, buildings both sides)
          const v = [...d.traffic.vehicles].sort((m, n) => Math.hypot(m.body.pos.x - 9, m.body.pos.z - 20) - Math.hypot(n.body.pos.x - 9, n.body.pos.z - 20))[0];
          const pos = v.body.pos; d.teleport(pos.x, pos.z, v.body.heading);
          p.tryEnter([v]);
        }
      }, view);
      for (const hour of hours) {
        await page.evaluate(({ hour, view }) => {
          const d = window.__gtaDebug;
          d.setHour(hour); d.step(45); d.dayNight.timeOfDay = hour; d.nightLights.update(d.player.body.pos, d.dayNight.isNight, 1);
          d.pipeline.setHour(hour); d.pipeline.setNight(d.dayNight.isNight);
          d.pipeline.snapGrade?.();
          const p = d.player; const pos = p.vehicle ? p.vehicle.body.pos : p.body.pos;
          if (view === 'aerial') d.setFreeCam(pos.x - 30, 50, pos.z + 110, pos.x, 5, pos.z);
          d.settle(30);
        }, { hour, view });
        // let a few real frames render so the env map / shadows / grade are current
        await page.evaluate(() => new Promise((res) => { let n = 0; const f = () => (++n >= 4 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
        const file = `${OUT}/${TAG}${q}_${view}_${String(hour).replace('.', 'p').padStart(4, '0')}.png`;
        await page.screenshot({ path: file, timeout: 120_000 });
        results.push(file); console.log(`[audit] ${q} ${view} h=${hour} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }
    }
    if (errors.length) console.log(`[audit] console errors (${q}):`, [...new Set(errors)].slice(0, 5));
    await page.close();
  }
  const r = spawnSync('python3', ['-I', '-c', PY, ...results], { encoding: 'utf8' });
  process.stdout.write(r.stdout); if (r.stderr) process.stderr.write(r.stderr);
  console.log(`[audit] ${results.length} frames in ${OUT}`);
} catch (e) {
  console.error('[audit] failed:', e.message); process.exitCode = 1;
} finally {
  clearTimeout(hardStop);
  await browser?.close();
  preview.kill();
}
