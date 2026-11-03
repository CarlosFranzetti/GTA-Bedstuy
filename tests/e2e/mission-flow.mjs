// Headless check of mission flow: one mission at a time, pointer clears after abandon, van entry from the body box. Run as:
//   npm run build && scripts/swarm-render.sh node tests/e2e/mission-flow.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const PORT = 4425;
const log = (...a) => console.log('[flow]', ...a);
const preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
const errors = [];
let browser;
const hardStop = setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 300_000);
const check = (name, ok, extra) => { log(ok ? 'PASS' : 'FAIL', name, extra ?? ''); if (!ok) process.exitCode = 1; };
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/?q=low&perf=0`, { waitUntil: 'load', timeout: 90_000 });
  await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 120_000 });
  await page.mouse.click(300, 200);
  const D = (fn, arg) => page.evaluate(fn, arg);
  const sim = (n = 30) => D((n) => window.__gtaDebug.step(n), n);
  const tp = async (x, z) => { await D(([x, z]) => window.__gtaDebug.teleport(x, z, 0), [x, z]); await sim(20); };
  const press = async (k) => { await page.keyboard.down(k); await page.waitForTimeout(250); await page.keyboard.up(k); await sim(10); };
  const giver = (id) => D((id) => { const m = window.__gtaDebug.missions.missions.find((d) => d.id === id); return m.giver; }, id);
  const info = () => D(() => { const m = window.__gtaDebug.missions; return { id: m.activeId, title: m.hud.title, status: m.hud.status, markers: m.markers.map((k) => k.kind + ':' + k.label) }; });

  const a = await giver('crate-digger'), b = await giver('bodega-run');
  await tp(a.x + 40, a.z); await tp(a.x, a.z); await sim(30);
  let s = await info();
  check('crate digger started via ring', s.id === 'crate-digger' && s.title === 'Crate Digger', JSON.stringify(s));
  await tp(b.x + 40, b.z); await tp(b.x, b.z); await sim(60);
  s = await info();
  check('walking into another giver ring does not swap the mission', s.id === 'crate-digger' && s.title === 'Crate Digger' && s.status === 'active', JSON.stringify(s));
  const hudTitle = await D(() => document.querySelector('.msn-title')?.textContent);
  check('hud title agrees with missions.activeId', hudTitle === 'Crate Digger', hudTitle);

  await press('KeyX'); await sim(30);
  s = await info();
  check('abandon clears the mission', s.id === null && s.status === 'idle', JSON.stringify(s));
  await page.waitForTimeout(400);
  const ptr = await D(() => { const e = document.querySelector('.msn-pointer'); return e && !e.hidden ? e.textContent : null; });
  check('no stale pointer at the bodega ring (it is the dead zone)', !ptr || !/Bodega Run\s+here/.test(ptr), String(ptr));

  // spawn-nearest van / box truck: stand at its far flank and press F
  await tp(9, 20);
  const veh = await D(() => {
    const d = window.__gtaDebug; const out = [];
    for (const bd of d.physics.bodies()) { const v = bd.userData; if (v && v.spec && bd.shape.kind === 'obb' && !v.driver) out.push({ id: v.id, type: v.spec.type, x: bd.pos.x, z: bd.pos.z, h: bd.heading, hw: bd.shape.halfW, hl: bd.shape.halfL }); }
    out.sort((p, q) => Math.hypot(p.x - 9, p.z - 20) - Math.hypot(q.x - 9, q.z - 20));
    return out.filter((v) => v.type === 'boxtruck' || v.type === 'van').concat(out).slice(0, 1)[0];
  });
  log('vehicle', JSON.stringify(veh));
  // the side opposite the driver's door (right flank), 2.2 m off the body
  const rx = Math.cos(veh.h), rz = Math.sin(veh.h), off = veh.hw + 2.2;
  await D(([x, z]) => { window.__gtaDebug.setPaused(false); window.__gtaDebug.teleport(x, z, 0); }, [veh.x + rx * off, veh.z + rz * off]);
  await sim(10);
  await press('KeyF'); await page.waitForTimeout(1500); await sim(60);
  const inV = await D(() => !!window.__gtaDebug.player.vehicle);
  check('F from the far flank enters the ' + veh.type, inV);
} catch (e) { console.error(e); process.exitCode = 1; }
finally {
  log('errors', JSON.stringify(errors));
  if (errors.length) process.exitCode = 1;
  clearTimeout(hardStop);
  await browser?.close().catch(() => {});
  preview.kill();
  process.exit(process.exitCode ?? 0);
}
