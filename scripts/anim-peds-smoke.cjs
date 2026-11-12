// ANIM: boots a built game (dist dir), steps the sim, and reports the spine pitch/roll of EVERY pedestrian each frame; saves frames of the worst one.
// node scripts/anim-peds-smoke.cjs <distDir> <outDir> [port] [seconds]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
(async () => {
  const dist = process.argv[2], out = process.argv[3], port = process.argv[4] || '4491', secs = Number(process.argv[5] || 20);
  fs.mkdirSync(out, { recursive: true });
  const srv = spawn('node', ['/home/user/GTA-Bedstuy/node_modules/vite/bin/vite.js', 'preview', '--outDir', dist, '--port', port, '--strictPort'], { cwd: '/home/user/GTA-Bedstuy', stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 3000));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  const log = []; page.on('console', (m) => { if (m.type() === 'error') log.push('CONSOLE ' + m.text().slice(0, 200)); }); page.on('pageerror', (e) => log.push('PAGEERR ' + e.message.slice(0, 200)));
  await page.route('**/ra-api/**', (r) => r.abort());
  try {
    await page.goto('http://localhost:' + port + '/?perf=0&q=low', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 900000 });
    await page.evaluate(() => { window.__gtaDebug.renderer.domElement.style.visibility = 'hidden'; });
    await page.waitForTimeout(4000);
    const res = await page.evaluate(async (secs) => {
      const d = window.__gtaDebug; d.stopLoop(); d.setHour(15);
      const shot = () => { d.renderOnce(); return d.renderer.domElement.toDataURL('image/jpeg', 0.85); };
      const peds = d.traffic.peds;
      const diag = { fetchStatus: null, loadStreet: null, urlTried: './anim/street.bin', hosted: null };
      try { diag.fetchStatus = (await fetch('./anim/street.bin')).status; } catch (e) { diag.fetchStatus = String(e).slice(0, 100); }
      try { const an = peds.find((p) => p.anim).anim; diag.hosted = an.lib.streetLoaded; diag.loadStreet = await an.lib.loadStreet(); diag.after = an.lib.has('stumble'); } catch (e) { diag.loadStreet = 'throw ' + String(e).slice(0, 120); }
      const stats = { diag, peds: peds.length, street: !!(peds[0] && peds[0].anim && peds[0].anim.lib.has('stumble')), withAnim: peds.filter((p) => p.anim).length, worst: { pitch: 0 }, byClip: {} };
      const frames = {};
      for (let s = 0; s < secs * 2; s++) {
        d.step(30);
        for (const p of peds) {
          const m = p.model; if (!m || p.state === 'down') continue;
          const pitch = Math.max(Math.abs(m.torso.rotation.x), Math.abs(m.hips.rotation.x)), roll = Math.max(Math.abs(m.torso.rotation.z), Math.abs(m.hips.rotation.z));
          const style = p.gait ? p.gait.walkClip : '?';
          const k = style + '/' + (p.anim ? p.anim.idleClipName : '-');
          const e = stats.byClip[k] || (stats.byClip[k] = { n: 0, maxPitchDeg: 0, maxRollDeg: 0 });
          e.n++; e.maxPitchDeg = Math.max(e.maxPitchDeg, +(pitch * 57.3).toFixed(0)); e.maxRollDeg = Math.max(e.maxRollDeg, +(roll * 57.3).toFixed(0));
          if (pitch > stats.worst.pitch) stats.worst = { pitch: +pitch.toFixed(2), deg: +(pitch * 57.3).toFixed(0), id: p.id, state: p.state, style, pose: p.pose, x: p.body.pos.x, z: p.body.pos.z };
        }
      }
      // pictures of three pedestrians near the player, and of the worst
      const pp = d.player.body.pos; const near = peds.slice().sort((a, b) => Math.hypot(a.body.pos.x - pp.x, a.body.pos.z - pp.z) - Math.hypot(b.body.pos.x - pp.x, b.body.pos.z - pp.z));
      near.slice(0, 3).forEach((p, i) => { const q = p.body.pos; d.setFreeCam(q.x + 2.4, 1.4, q.z + 2.4, q.x, 1.0, q.z); d.step(6); frames['ped' + i] = shot(); });
      return { stats, frames };
    }, secs);
    for (const [k, v] of Object.entries(res.frames)) fs.writeFileSync(out + '/' + k + '.jpg', Buffer.from(v.split(',')[1], 'base64'));
    console.log(JSON.stringify(res.stats, null, 1));
  } catch (e) { console.log('FAIL', e.message.slice(0, 300)); }
  console.log(log.slice(0, 8).join('\n'));
  await browser.close().catch(() => {}); srv.kill();
})();
