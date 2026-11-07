// Headless e2e (NAV6 / H6 P1): walk the west sidewalk of Throop Ave end to end, hugging the building line (the lane the blind
// tester used, x = -10.6) and along the centre of the sidewalk, in both directions, with the real keyboard path
// (W held, camera facing the walking direction). Fails if the player stops making progress anywhere on the way.
//
// Usage: node tests/e2e/walk-throop.mjs [--port 4432] [--skip-build]     (exit code 1 on any failure)
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');

const args = process.argv.slice(2);
const argv = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = Number(argv('--port', 4432));
const log = (...a) => console.log('[walk-throop]', ...a);
if (!args.includes('--skip-build')) { log('building'); execSync('npm run build', { stdio: 'ignore' }); }
const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
preview.stderr.on('data', (d) => process.stderr.write(d));
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(`http://localhost:${PORT}/`); if (r.ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
const hardStop = setTimeout(() => { console.error('[walk-throop] hard timeout'); preview.kill(); process.exit(2); }, 900_000);
let browser, failed = false;
try {
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/?q=low`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 120_000 });
  const btn = page.getByRole('button', { name: 'Resume' });
  if (await btn.isVisible().catch(() => false)) await btn.click();
  await page.waitForTimeout(300);

  // Throop W sidewalk: x from -11 (building line) to -7 (kerb); the block south of Kosciuszko spans z 5..95 (H6 wedge at z 56..63).
  const runs = [
    { name: 'building lane, southbound', x: -10.6, z0: 8, z1: 92 },
    { name: 'building lane, northbound', x: -10.6, z0: 92, z1: 8 },
    { name: 'centre, southbound', x: -9, z0: 8, z1: 92 },
  ];
  for (const r of runs) {
    const key = r.z1 > r.z0 ? 'KeyS' : 'KeyW'; // the camera looks north (-z): W walks north, S walks south
    await page.keyboard.down(key);
    const res = await page.evaluate(({ x, z0, z1 }) => {
      const d = window.__gtaDebug;
      const dir = Math.sign(z1 - z0);
      d.teleport(x, z0, 0);
      d.settle(400);
      let last = z0; const stalls = []; let worst = Infinity;
      for (let sec = 0; sec < 70 && (z1 - d.player.body.pos.z) * dir > 1; sec++) {
        d.step(60);
        const z = d.player.body.pos.z, gain = (z - last) * dir;
        worst = Math.min(worst, gain);
        if (gain < 1) stalls.push({ z: +z.toFixed(1), x: +d.player.body.pos.x.toFixed(1), gain: +gain.toFixed(2) });
        last = z;
      }
      return { endZ: +d.player.body.pos.z.toFixed(1), stalls, worst: +worst.toFixed(2), reached: (z1 - d.player.body.pos.z) * dir <= 1 };
    }, r);
    await page.keyboard.up(key);
    log(key, 'held:', r.name, JSON.stringify(res));
    if (!res.reached || res.stalls.length) { failed = true; log('FAIL', r.name); }
  }
  if (errors.length) { failed = true; log('page errors', errors); }
} finally {
  clearTimeout(hardStop);
  await browser?.close();
  preview.kill();
}
log(failed ? 'FAILED' : 'PASSED');
process.exit(failed ? 1 : 0);
