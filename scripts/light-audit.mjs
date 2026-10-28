// Lighting audit: renders hours x viewpoints headlessly and prints luminance stats per frame.
// Usage: npm run build && node scripts/light-audit.mjs [--out DIR] [--hours 6,9,12] [--views street,car,aerial,signals,shops,ew,stoop,stoop2] [--q low,medium,high] [--medium-hours 12,21] [--dist DIR] [--port N] [--tag PREFIX] [--weather dry|rain|wet|drying]
// Views: street (player on foot at the spawn), car (driving), aerial, signals / shops (night lamp bloom), ew (east-west street away from the sun: shadow bias), stoop / stoop2 (close oblique looks at the stoop nearest the spawn).
// Tiers: low runs --hours; any other tier runs --medium-hours (high is slow on a CPU rasteriser).
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
const WEATHER = arg('weather', ''); // dry | rain | wet | drying (needs __gtaDebug.setWeather); snapped, so the street is fully soaked
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
          // put the first traffic car on the Throop Ave lane next to the spawn crossing and drive it from there
          const v = d.traffic.vehicles[0];
          const n = d.grid.nearestLaneNode({ x: 2, z: 30 });
          v.body.pos.x = n.pos.x; v.body.pos.z = n.pos.z; v.body.heading = n.heading; v.body.vel.x = 0; v.body.vel.z = 0;
          d.teleport(n.pos.x, n.pos.z, n.heading);
          p.tryEnter([v]);
          d.step(90); // the walk-to-door animation takes ~0.4 s of sim time
        }
      }, view);
      for (const hour of hours) {
        await page.evaluate(({ hour, view, weather }) => {
          const d = window.__gtaDebug;
          if (weather) d.setWeather(weather, true);
          d.setHour(hour); d.step(45); d.dayNight.timeOfDay = hour; d.nightLights.update(d.player.body.pos, d.dayNight.isNight, 1);
          d.pipeline.setHour(hour); d.pipeline.setNight(d.dayNight.isNight);
          d.pipeline.snapGrade?.();
          const p = d.player; const pos = p.vehicle ? p.vehicle.body.pos : p.body.pos;
          if (view === 'aerial') d.setFreeCam(pos.x - 30, 50, pos.z + 110, pos.x, 5, pos.z);
          // night-lamp views: signal heads at the Throop / Kosciuszko crossing, and a storefront-lined stretch of Throop
          if (view === 'signals') {
            // stand 14 m in front of the signal head nearest the Throop / Kosciuszko crossing, looking at it (the lamps are an InstancedMesh)
            const im = d.scene.getObjectByName('signal-lamps');
            if (im && im.count) {
              let best = -1, bd = 1e9;
              const tmp = im.instanceMatrix.array;
              for (let i = 0; i < im.count; i++) { const x = tmp[i * 16 + 12], z = tmp[i * 16 + 14]; const dd = Math.hypot(x, z); if (dd < bd) { bd = dd; best = i; } }
              const o = best * 16; const px = tmp[o + 12], py = tmp[o + 13], pz = tmp[o + 14];
              const fx = tmp[o + 8], fz = tmp[o + 10]; const fl = Math.hypot(fx, fz) || 1;
              d.setFreeCam(px + (fx / fl) * 14, 2.0, pz + (fz / fl) * 14, px, py, pz);
            } else d.setFreeCam(-5, 2.2, 42, 0, 4.6, 6);
          }
          if (view === 'shops') d.setFreeCam(3, 1.7, -8, 3, 3, -70);
          // an east-west street shot looking away from the low sun (lit road: poles / trees / cars cast shadows to check bias)
          if (view === 'ew') { const east = hour >= 12; d.setFreeCam(east ? -60 : 60, 1.7, 3.5, east ? 20 : -20, 1.0, -3); }
          if (view === 'stoop' || view === 'stoop2') {
            // close oblique look at the stoop nearest the spawn: acne shows on its treads / cheek walls, peter-panning at the shadow's foot
            let best = null;
            for (const b of d.physics.bodies()) {
              const pts = b.shape.points; if (!pts || !String(b.id).includes('stoop')) continue;
              const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length + b.pos.x, cz = pts.reduce((s, q) => s + q.z, 0) / pts.length + b.pos.z;
              const dd = Math.hypot(cx - 9, cz - 20); if (!best || dd < best.dd) best = { cx, cz, dd };
            }
            const ox = 9 - best.cx, oz = 20 - best.cz, ol = Math.hypot(ox, oz) || 1;
            const ux = ox / ol, uz = oz / ol; // unit vector from the stoop toward the street
            const side = view === 'stoop' ? 3.5 : -3.5; // lateral offset (m) so the view is oblique to the facade
            d.setFreeCam(best.cx + ux * 6 - uz * side, 2.0, best.cz + uz * 6 + ux * side, best.cx, 0.9, best.cz);
          }
          d.settle(30);
        }, { hour, view, weather: WEATHER });
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
