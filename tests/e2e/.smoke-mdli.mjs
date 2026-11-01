// Headless render smoke test using the preinstalled Playwright + Chromium (SwiftShader WebGL).
// Usage: npm run build && node tests/e2e/smoke.mjs   (serves dist/ via vite preview)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const PORT = 4407;
const log = (...a) => console.log('[smoke]', ...a);
const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
preview.stderr.on('data', (d) => process.stderr.write(d));
const waitForServer = async () => {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`http://localhost:${PORT}/`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('preview server did not start');
};
const errors = [];
let browser;
const hardStop = setTimeout(() => { console.error('[smoke] hard timeout'); process.exit(2); }, 300_000);
try {
  await waitForServer(); log('server up');
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (['error','warning'].includes(m.type())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/?q=low`, { waitUntil: 'load', timeout: 60_000 }); log('loaded');
  await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 90_000 }); log('ready');
  const gl = await page.evaluate(() => !!document.querySelector('canvas.game')?.getContext('webgl2'));
  await page.waitForTimeout(3000); // let frames run
  const stats = await page.evaluate(() => window.__gtaStats ?? null);
  mkdirSync('tests/e2e/__screenshots__', { recursive: true });
  await page.screenshot({ path: 'tests/e2e/__screenshots__/smoke.png', timeout: 120_000 });
  console.log(JSON.stringify({ webgl2: gl, stats, errors }, null, 2));
  if (!gl) { console.error('no WebGL2 context'); process.exitCode = 1; }
  if (errors.length) { console.error('console errors'); process.exitCode = 1; }
} catch (e) {
  console.error('[smoke] failed:', e.message); process.exitCode = 1;
} finally {
  clearTimeout(hardStop);
  await browser?.close();
  preview.kill();
}
