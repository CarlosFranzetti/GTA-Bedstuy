// Recorded blind-playtest session. A tester (no code access) sends commands through <sessionDir>/cmd.jsonl, reads
// screenshots + a small state JSON back, and the run is recorded to a webm with the tester's thoughts burned in as a
// subtitle bar. Protocol: docs/PLAYTEST.md.
//
// Usage: npm run build            (this script builds nothing; it snapshots ./dist)
//        node scripts/playtest/session.mjs <sessionDir> [--port 4402] [--q low] [--width 960] [--height 540]
//                                          [--max-steps 80] [--idle-timeout 600] [--hour <0-24>] [--read-ms-per-char 35]
//                                          [--dist <dir>]   serve this build instead of ./dist (snapshotted either way)
//
// Design notes
//  * Turn based: the simulation is paused while the tester thinks and runs only while an action executes, so the
//    world never moves behind the tester's back. Durations ("ms") are GAME milliseconds (fixed 60 Hz steps), not wall
//    time, so a slow software renderer (swiftshader) gives the same result as a fast GPU, just in more wall time.
//  * Headless pointer lock is refused, so the harness reports document.pointerLockElement as the canvas and feeds
//    mouse look as synthetic mousemove events (movementX/Y) to the game's own Input handler. No game code is touched.
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync, existsSync, readFileSync, renameSync, cpSync, readdirSync, rmSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cutVideo } from './cut.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseArgs(argv) {
  const o = { port: 4402, q: 'low', width: 960, height: 540, maxSteps: 80, idleTimeout: 600, hour: null, readMsPerChar: 35, dist: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') o.port = Number(argv[++i]);
    else if (a === '--q') o.q = argv[++i];
    else if (a === '--width') o.width = Number(argv[++i]);
    else if (a === '--height') o.height = Number(argv[++i]);
    else if (a === '--max-steps') o.maxSteps = Number(argv[++i]);
    else if (a === '--idle-timeout') o.idleTimeout = Number(argv[++i]);
    else if (a === '--hour') o.hour = Number(argv[++i]);
    else if (a === '--dist') o.dist = resolve(argv[++i]);
    else if (a === '--read-ms-per-char') o.readMsPerChar = Number(argv[++i]);
    else rest.push(a);
  }
  if (!rest[0]) { console.error('usage: node scripts/playtest/session.mjs <sessionDir> [--port 4402] [--q low] [--width 960] [--height 540] [--max-steps 80] [--idle-timeout 600]'); process.exit(2); }
  o.dir = resolve(rest[0]);
  return o;
}

/** Keys the tester may use (everything the game actually reads; Escape is deliberately absent). */
export const ALLOWED_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyF', 'KeyE', 'KeyR', 'KeyX', 'KeyH']);
const MAX_HOLD_MS = 10_000, MAX_STEP_MS = 25_000, MAX_ACTIONS = 24, FIXED_MS = 1000 / 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------------------------
// Pure helpers (also used by tests)
export function sanitizeActions(raw) {
  const actions = [], notes = [];
  let total = 0;
  if (!Array.isArray(raw)) return { actions, notes: ['"actions" is not an array; treated as empty'] };
  for (const a of raw.slice(0, MAX_ACTIONS)) {
    if (!a || typeof a !== 'object') { notes.push('ignored a non-object action'); continue; }
    const keys = Array.isArray(a.keys) ? a.keys : a.key !== undefined ? [a.key] : [];
    const bad = keys.filter((k) => !ALLOWED_KEYS.has(k));
    if (bad.length) notes.push(`ignored unknown key(s): ${bad.join(', ')}`);
    const good = keys.filter((k) => ALLOWED_KEYS.has(k));
    let look = null;
    if (a.look && typeof a.look === 'object') look = { dx: clampNum(a.look.dx, -2000, 2000), dy: clampNum(a.look.dy, -800, 800) };
    if (a.wait !== undefined && !good.length && !look) {
      const ms = clampNum(a.wait, 0, MAX_HOLD_MS); total += ms; actions.push({ wait: ms });
    } else if (good.length) {
      const tap = a.tap === true;
      const ms = tap ? 120 : clampNum(a.ms ?? 500, 0, MAX_HOLD_MS);
      total += ms; actions.push({ keys: good, ms, tap, look });
    } else if (look) {
      actions.push({ look });
    } else notes.push('ignored an action with nothing to do');
    if (total > MAX_STEP_MS) { notes.push(`step capped at ${MAX_STEP_MS} game ms`); break; }
  }
  if (raw.length > MAX_ACTIONS) notes.push(`only the first ${MAX_ACTIONS} actions were run`);
  return { actions, notes };
}
function clampNum(v, lo, hi) { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 0; }
export const hhmm = (h) => { const m = Math.round(((h % 24) + 24) % 24 * 60) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

/** Page-side code (a string so it can be injected before the game boots). */
const INIT_SCRIPT = `
(() => {
  // The harness can hold the render loop (no frames at all) while the tester thinks and while a screenshot is taken: a
  // software renderer under load otherwise makes screenshots time out, and memory only grows while frames are drawn.
  // gl.finish() after every drawn frame keeps the renderer from queueing frames faster than it can draw them.
  const raf = window.requestAnimationFrame.bind(window);
  window.__ptHold = false;
  const loop = (cb) => raf((t) => {
    if (window.__ptHold) { setTimeout(() => loop(cb), 150); return; }
    cb(t);
    try { window.__ptGl ??= window.__gtaDebug?.renderer?.getContext?.(); window.__ptGl?.finish(); } catch { /* ignore */ }
  });
  window.requestAnimationFrame = (cb) => loop(cb);
})();
`;

// ---------------------------------------------------------------------------------------------------------------
async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const D = opt.dir;
  for (const d of ['video', 'frames', 'state']) mkdirSync(join(D, d), { recursive: true });
  const cmdPath = join(D, 'cmd.jsonl');
  if (!existsSync(cmdPath)) writeFileSync(cmdPath, '');
  const log = (...a) => console.log('[playtest]', ...a);
  const logPath = join(D, 'log.jsonl');
  const T0 = Date.now();
  let videoT0 = T0;

  // ---- serve a private snapshot of dist/ (another lane's `vite build` empties dist/ while we run)
  const srcDist = opt.dist ?? resolve(ROOT, 'dist');
  if (!existsSync(join(srcDist, 'index.html'))) { console.error('[playtest] no dist/index.html: run `npm run build` first'); process.exit(1); }
  const dist = join(D, '.dist');
  rmSync(dist, { recursive: true, force: true });
  cpSync(srcDist, dist, { recursive: true });
  // the port must be free: a leftover preview from an earlier run would silently serve another build
  for (let i = 0; i < 40; i++) {
    let busy = false;
    try { busy = (await fetch(`http://localhost:${opt.port}/`)).ok; } catch { /* free */ }
    if (!busy) break;
    if (i === 39) { console.error(`[playtest] port ${opt.port} is already serving something; pick another --port`); process.exit(1); }
    await sleep(500);
  }
  const preview = spawn('node', [join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', dist, '--port', String(opt.port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  let previewDead = false;
  preview.on('exit', () => { previewDead = true; });
  const base = `http://localhost:${opt.port}`;
  for (let i = 0; i < 80 && !previewDead; i++) { try { if ((await fetch(`${base}/`)).ok) break; } catch { /* not up yet */ } await sleep(250); }
  if (previewDead) { console.error(`[playtest] preview server exited (port ${opt.port} busy?)`); process.exit(1); }

  const errorBuf = [];
  const pushErr = (s) => { if (errorBuf.length < 20) errorBuf.push(String(s).slice(0, 300)); };
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: opt.width, height: opt.height }, recordVideo: { dir: join(D, 'video'), size: { width: opt.width, height: opt.height } } });
  await context.addInitScript(INIT_SCRIPT);
  const page = await context.newPage();
  videoT0 = Date.now();
  const video = page.video();
  page.on('console', (m) => { if (m.type() === 'error') pushErr(m.text()); });
  page.on('pageerror', (e) => pushErr('pageerror: ' + e));
  let crashed = false;
  page.on('crash', () => { crashed = true; pushErr('PAGE CRASHED'); });

  let ended = false;
  const cleanup = async () => { try { await browser.close(); } catch { /* ignore */ } try { preview.kill(); } catch { /* ignore */ } try { rmSync(dist, { recursive: true, force: true }); } catch { /* ignore */ } };

  try {
    // ---- boot
    await page.goto(`${base}/?q=${opt.q}&perf=0`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => window.__gtaReady === true, null, { timeout: 240_000 });
    log('game ready', ((Date.now() - T0) / 1000).toFixed(1) + 's');
    await page.mouse.click(opt.width / 2, opt.height / 2); // first gesture (hides the splash; headless pointer lock fails, so the pause menu opens)
    await page.waitForTimeout(800);
    const resume = page.getByRole('button', { name: 'Resume' });
    if (await resume.isVisible().catch(() => false)) { await resume.click(); await page.waitForTimeout(300); }
    await page.evaluate(() => {
      document.activeElement?.blur?.();
      // pretend the pointer is locked: the game's own Input then accepts mousemove deltas
      const canvas = document.querySelector('canvas.game') || document.querySelector('canvas');
      Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => canvas });
      document.dispatchEvent(new Event('pointerlockchange'));
      // count fixed simulation steps (the tester's durations are in game time)
      const d = window.__gtaDebug;
      window.__ptSteps = 0;
      const orig = d.physics.step.bind(d.physics);
      d.physics.step = (dt) => { window.__ptSteps++; return orig(dt); };
      // subtitle bar
      const bar = document.createElement('div');
      bar.id = 'pt-subtitle';
      bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;pointer-events:none;background:rgba(8,8,12,.78);color:#fff;padding:10px 18px 12px;font:600 22px/1.3 system-ui,Segoe UI,Arial,sans-serif;display:flex;gap:14px;align-items:flex-start;border-top:2px solid rgba(255,196,0,.9);box-sizing:border-box;min-height:64px';
      bar.innerHTML = '<div style="flex:none;display:flex;flex-direction:column;gap:4px;align-items:flex-start"><span style="background:#ffc400;color:#111;font:800 13px/1 system-ui,sans-serif;letter-spacing:.12em;padding:4px 7px;border-radius:3px">TESTER</span><span id="pt-step" style="font:600 12px/1 ui-monospace,monospace;color:#ffd75e"></span></div><div id="pt-text" style="flex:1;min-width:0;text-shadow:0 1px 2px #000"></div>';
      document.body.appendChild(bar);
      window.__ptSubtitle = (text, stepLabel) => {
        const t = document.getElementById('pt-text');
        t.textContent = text;
        const n = text.length;
        t.style.fontSize = n > 260 ? '16px' : n > 170 ? '18px' : n > 90 ? '20px' : '22px';
        document.getElementById('pt-step').textContent = stepLabel;
      };
      window.__ptSubtitle('Starting the playtest...', 'STEP 0');
      d.setPaused(true);
      window.__ptHold = true;
    });
    if (opt.hour !== null) await page.evaluate((h) => window.__gtaDebug.setHour(h), opt.hour);
    await sleep(1500);

    // ---- in-page helpers
    const setSubtitle = (text, label) => page.evaluate(([t, l]) => window.__ptSubtitle(t, l), [text, label]);
    const frames2 = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const running = async (on) => page.evaluate((o) => { window.__gtaDebug.setPaused(!o); window.__ptHold = !o; }, on);
    const hold = (on) => page.evaluate((o) => { window.__ptHold = o; }, on);
    // Waits in GAME time: the sim may run only a few steps per wall second on a software renderer, so the wall-clock
    // cap is generous (10 min). A wait that is still cut short is recorded in the step's notes as actionsCutShort so
    // the tester is never misled about how long a key was really held.
    const cutShort = [];
    const gameWait = async (ms) => {
      const need = Math.max(1, Math.round(ms / FIXED_MS));
      const start = await page.evaluate(() => window.__ptSteps);
      const target = start + need;
      try { await page.waitForFunction((t) => window.__ptSteps >= t, target, { timeout: 600_000, polling: 40 }); return true; }
      catch {
        const got = await page.evaluate(() => window.__ptSteps).catch(() => start);
        cutShort.push({ requestedMs: ms, ranMs: Math.round((got - start) * FIXED_MS) });
        return false;
      }
    };
    const look = (dx, dy) => page.evaluate(([x, y]) => {
      const c = document.querySelector('canvas.game') || document.querySelector('canvas');
      c.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: x, movementY: y }));
    }, [dx, dy]);

    const dismissMenu = async () => {
      const open = await page.getByRole('button', { name: 'Resume' }).isVisible().catch(() => false);
      if (open) { await page.getByRole('button', { name: 'Resume' }).click().catch(() => {}); await page.evaluate(() => document.activeElement?.blur?.()); await sleep(200); }
      return open;
    };

    // ---- state snapshot
    const readState = () => page.evaluate(() => {
      const d = window.__gtaDebug, p = d.player;
      const veh = p.vehicle;
      const b = veh ? veh.body : p.body;
      const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
      const deg = (r) => Math.round(((r * 180 / Math.PI) % 360 + 360) % 360);
      const compass = (r) => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round((((r * 180 / Math.PI) % 360) + 360) % 360 / 45) % 8];
      let camYaw = b.heading;
      try { const cam = d.pipeline.camera; const v = new cam.position.constructor(); cam.getWorldDirection(v); camYaw = Math.atan2(v.x, -v.z); } catch { /* fall back to body heading */ }
      const text = (sel) => { const e = document.querySelector(sel); return e && !e.hidden && e.offsetParent !== null ? (e.textContent || '').trim() : ''; };
      const rel = (dx, dz) => {
        const a = wrap(Math.atan2(dx, -dz) - camYaw);
        const ad = Math.abs(a) * 180 / Math.PI;
        const side = a >= 0 ? 'right' : 'left';
        const label = ad < 25 ? 'ahead' : ad > 155 ? 'behind' : ad < 65 ? `ahead-${side}` : ad > 115 ? `behind-${side}` : side;
        return { label, deg: Math.round(a * 180 / Math.PI) };
      };
      const near = [];
      for (const o of d.physics.bodies()) {
        if (o === p.body || o === b) continue;
        const dx = o.pos.x - b.pos.x, dz = o.pos.z - b.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 25) continue;
        if (o.kind === 'static' && dist > 8) continue;
        const r = rel(dx, dz);
        const e = { type: o.kind === 'static' ? 'obstacle' : o.kind, distance_m: +dist.toFixed(1), direction: r.label, bearing_deg: r.deg };
        const u = o.userData;
        if (o.kind === 'vehicle' || o.kind === 'cop') { e.vehicle = u?.spec?.type ?? undefined; e.occupied = !!u?.driver; if (u?.driver === 'player') continue; }
        near.push(e);
      }
      near.sort((x, y) => x.distance_m - y.distance_m);
      const mission = (() => {
        const panel = document.querySelector('.msn-panel');
        if (!panel || panel.hidden) return null;
        const t = (s) => (panel.querySelector(s)?.textContent || '').trim();
        return { title: t('.msn-title'), objective: t('.msn-objective'), step: t('.msn-step'), timer: t('.msn-timer'), carrying: t('.msn-carry') };
      })();
      const menuOpen = !!document.querySelector('[data-ui-modal]:not([hidden])');
      return {
        gameHour: +d.dayNight.timeOfDay.toFixed(3),
        player: { x: +b.pos.x.toFixed(1), z: +b.pos.z.toFixed(1), headingDeg: deg(b.heading), headingCompass: compass(b.heading), cameraFacingDeg: deg(camYaw), cameraFacing: compass(camYaw) },
        inVehicle: !!veh, enteringCar: !!p.isEntering,
        vehicle: veh ? { type: veh.spec?.type ?? null, speedKmh: Math.round(Math.abs(veh.speed) * 3.6) } : null,
        walkSpeedKmh: veh ? 0 : Math.round(Math.hypot(b.vel.x, b.vel.z) * 3.6),
        wantedStars: d.wanted.stars,
        prompt: text('.hud-prompt'),
        street: text('.hud-street'),
        radio: text('.hud-radio'),
        mission,
        missionToast: text('.msn-toast'), missionRetry: text('.msn-retry'), cash: text('.msn-cash'),
        hudToast: text('.hud-toast'), locationCard: text('.hud-card'),
        menuOpen,
        nearby: near.slice(0, 5), nearbyTotal: near.length,
        sim: { steps: window.__ptSteps, fps: Math.round(window.__gtaStats?.fps ?? 0), heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576) },
      };
    });

    // ---- capture one step
    const capture = async (n, extra = {}) => {
      const framePath = `frames/step-${n}.jpg`, statePath = `state/step-${n}.json`;
      await dismissMenu();
      await hold(false);
      await page.evaluate(() => { const b = document.getElementById('pt-subtitle'); if (b) b.style.visibility = 'hidden'; });
      await frames2(); await frames2(); // draw the final state (canvas + HUD), then freeze rendering for the screenshot
      await hold(true);
      await page.screenshot({ path: join(D, framePath), type: 'jpeg', quality: 60, timeout: 240_000 });
      await page.evaluate(() => { const b = document.getElementById('pt-subtitle'); if (b) b.style.visibility = 'visible'; });
      const st = await readState();
      st.step = n; st.consoleErrorsSinceLastStep = errorBuf.splice(0); Object.assign(st, extra);
      writeFileSync(join(D, statePath), JSON.stringify(st, null, 2));
      return { framePath, statePath, state: st };
    };

    // ---- step 0: what the tester sees before acting
    const first = await capture(0);
    appendFileSync(logPath, JSON.stringify({ step: 0, thought: '(start)', actions: [], statePath: first.statePath, framePath: first.framePath, t: +((Date.now() - T0) / 1000).toFixed(1), tVideo: +((Date.now() - videoT0) / 1000).toFixed(2), tVideoEnd: +((Date.now() - videoT0) / 1000).toFixed(2) }) + '\n');
    writeFileSync(join(D, 'ready-0'), JSON.stringify({ step: 0, framePath: first.framePath, statePath: first.statePath }));
    await setSubtitle('Waiting for the first command...', 'STEP 0');
    log('step 0 ready; waiting for commands in', cmdPath);

    // ---- command loop
    let lineIdx = 0, lastStep = 0, processed = 0, lastActivity = Date.now(), endSummary = '', endReason = '';
    const readNew = () => {
      let text = '';
      try { text = readFileSync(cmdPath, 'utf8'); } catch { return []; }
      const lines = text.split('\n');
      const out = [];
      while (lineIdx < lines.length) {
        const raw = lines[lineIdx];
        const isLast = lineIdx === lines.length - 1;
        if (raw.trim() === '') { if (!isLast) lineIdx++; else break; continue; }
        let obj;
        try { obj = JSON.parse(raw); } catch (e) {
          if (isLast) break; // maybe still being written
          out.push({ bad: String(e.message), raw, line: lineIdx + 1 }); lineIdx++; continue;
        }
        out.push({ obj, line: lineIdx + 1 }); lineIdx++;
      }
      return out;
    };
    const queue = [];
    while (!ended) {
      if (crashed) { endReason = 'page crashed'; break; }
      if (previewDead) { endReason = 'preview server died'; break; }
      if (!queue.length) queue.push(...readNew());
      if (!queue.length) {
        if ((Date.now() - lastActivity) / 1000 > opt.idleTimeout) { endReason = `idle timeout (${opt.idleTimeout}s without a command)`; break; }
        await sleep(250); continue;
      }
      const item = queue.shift();
      lastActivity = Date.now();
      if (item.bad) { writeFileSync(join(D, `error-line${item.line}.json`), JSON.stringify({ line: item.line, error: 'invalid JSON: ' + item.bad, raw: item.raw.slice(0, 500) }, null, 2)); log('bad JSON on line', item.line); continue; }
      const cmd = item.obj;
      if (cmd && cmd.end === true) { endSummary = String(cmd.summary ?? ''); endReason = 'tester ended the session'; break; }

      const requested = Number.isInteger(cmd?.step) ? cmd.step : null;
      const n = requested !== null && requested > lastStep ? requested : lastStep + 1;
      const thought = String(cmd?.thought ?? '').trim() || '(no thought given)';
      const { actions, notes } = sanitizeActions(cmd?.actions);
      if (requested !== n) notes.push(requested === null ? `no step number given; used ${n}` : `step ${requested} was not new; used ${n}`);
      const tThought = (Date.now() - videoT0) / 1000;
      await setSubtitle(thought, `STEP ${n}/${opt.maxSteps}`);
      await sleep(Math.min(7000, 1400 + opt.readMsPerChar * thought.length)); // keep the thought readable in the recording while the world is frozen

      const ran = [];
      const tAct = (Date.now() - videoT0) / 1000;
      await running(true);
      for (const a of actions) {
        try {
          if (a.wait !== undefined) { await gameWait(a.wait); ran.push(a); continue; }
          if (!a.keys) { await look(a.look.dx, a.look.dy); await frames2(); ran.push(a); continue; }
          for (const k of a.keys) await page.keyboard.down(k);
          if (a.look && a.ms > 0) {
            const slices = Math.max(1, Math.round(a.ms / 100));
            for (let i = 0; i < slices; i++) { await look(a.look.dx / slices, a.look.dy / slices); await gameWait(a.ms / slices); }
          } else {
            if (a.look) await look(a.look.dx, a.look.dy);
            await gameWait(a.ms);
          }
          for (const k of [...a.keys].reverse()) await page.keyboard.up(k);
          ran.push(a);
        } catch (e) {
          notes.push('action failed: ' + String(e.message).slice(0, 120));
          for (const k of a.keys ?? []) await page.keyboard.up(k).catch(() => {});
        }
      }
      await gameWait(150); // let the last input take effect
      await running(false);
      if (cutShort.length) notes.push(...cutShort.map((c) => `action cut short: asked ${c.requestedMs} game ms, ran ${c.ranMs}`));
      const cap = await capture(n, { notes: notes.length ? notes : undefined, actionsCutShort: cutShort.length ? cutShort.splice(0) : undefined });
      const tEnd = (Date.now() - videoT0) / 1000;
      lastStep = n; processed++;
      appendFileSync(logPath, JSON.stringify({ step: n, thought, actions: ran, ignored: notes.length ? notes : undefined, statePath: cap.statePath, framePath: cap.framePath, t: +((Date.now() - T0) / 1000).toFixed(1), tVideoThought: +tThought.toFixed(2), tVideoActions: +tAct.toFixed(2), tVideoEnd: +tEnd.toFixed(2) }) + '\n');
      writeFileSync(join(D, `ready-${n}`), JSON.stringify({ step: n, framePath: cap.framePath, statePath: cap.statePath }));
      log(`step ${n} done (${actions.length} actions)`, cap.state.player.x, cap.state.player.z, cap.state.street);
      lastActivity = Date.now();
      if (processed >= opt.maxSteps) { endReason = `max steps (${opt.maxSteps}) reached`; break; }
    }

    // ---- finish
    ended = true;
    await setSubtitle(endSummary ? `END: ${endSummary}` : `END (${endReason})`, 'END').catch(() => {});
    await running(false).catch(() => {});
    await sleep(Math.min(8000, 2500 + opt.readMsPerChar * endSummary.length));
    await page.screenshot({ path: join(D, 'frames', 'final.jpg'), type: 'jpeg', quality: 60, timeout: 60_000 }).catch(() => {});
    const tFinal = (Date.now() - videoT0) / 1000;
    appendFileSync(logPath, JSON.stringify({ end: true, reason: endReason, summary: endSummary, steps: processed, tVideoEnd: +tFinal.toFixed(2) }) + '\n');
    const vpath = await video?.path().catch(() => null);
    await context.close(); // flushes the webm
    if (vpath && existsSync(vpath)) renameSync(vpath, join(D, 'playtest.webm'));
    writeTranscript(D, opt, endReason, endSummary);
    const ff = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    if (ff.status === 0 && existsSync(join(D, 'playtest.webm'))) makeMp4(D);
    else log('ffmpeg not found: convert with  ffmpeg -i playtest.webm -c:v libx264 -pix_fmt yuv420p playtest.mp4');
    writeFileSync(join(D, 'ended'), JSON.stringify({ reason: endReason, steps: processed }));
    log('session ended:', endReason, '-', processed, 'steps');
  } catch (e) {
    console.error('[playtest] FAILED:', e);
    process.exitCode = 1;
    try { appendFileSync(logPath, JSON.stringify({ end: true, reason: 'harness error: ' + String(e.message).slice(0, 200) }) + '\n'); } catch { /* ignore */ }
    try { const vp = await page.video()?.path(); await context.close(); if (vp && existsSync(vp)) renameSync(vp, join(D, 'playtest.webm')); writeTranscript(D, opt, 'harness error', ''); } catch { /* ignore */ }
  } finally {
    await cleanup();
  }
}

// ---------------------------------------------------------------------------------------------------------------
function readLog(D) {
  const p = join(D, 'log.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
function describeAction(a) {
  if (a.wait !== undefined) return `wait ${Math.round(a.wait)}ms`;
  if (!a.keys) return `look(${Math.round(a.look.dx)},${Math.round(a.look.dy)})`;
  const k = a.keys.map((x) => x.replace(/^Key/, '')).join('+');
  return (a.tap ? `tap ${k}` : `hold ${k} ${Math.round(a.ms)}ms`) + (a.look ? ` + look(${Math.round(a.look.dx)},${Math.round(a.look.dy)})` : '');
}
export function notableChanges(prev, cur) {
  const out = [];
  if (!prev) return out;
  if (prev.inVehicle !== cur.inVehicle) out.push(cur.inVehicle ? 'got into a car' : 'got out of the car');
  if (prev.wantedStars !== cur.wantedStars) out.push(`wanted ${prev.wantedStars} -> ${cur.wantedStars} stars`);
  if (prev.street !== cur.street && cur.street) out.push(`street: ${cur.street}`);
  const pm = prev.mission?.objective ?? '', cm = cur.mission?.objective ?? '';
  if (pm !== cm) out.push(cm ? `mission: ${cur.mission.title} - ${cm}` : 'mission HUD cleared');
  if (cur.missionToast && cur.missionToast !== prev.missionToast) out.push(`toast: ${cur.missionToast}`);
  if (cur.hudToast && cur.hudToast !== prev.hudToast) out.push(`toast: ${cur.hudToast}`);
  if (cur.prompt && cur.prompt !== prev.prompt) out.push(`prompt: ${cur.prompt}`);
  const moved = Math.hypot(cur.player.x - prev.player.x, cur.player.z - prev.player.z);
  if (moved < 0.3) out.push('did not move');
  else if (moved > 40) out.push(`moved ${Math.round(moved)} m`);
  if (cur.consoleErrorsSinceLastStep?.length) out.push(`${cur.consoleErrorsSinceLastStep.length} console error(s)`);
  if (cur.menuOpen) out.push('pause menu was open');
  return out;
}
function writeTranscript(D, opt, reason, summary) {
  const rows = readLog(D).filter((r) => r.step !== undefined);
  const lines = ['# Playtest transcript', '', `Session: ${D}`, `Ended: ${reason}`, `Steps: ${rows.filter((r) => r.step > 0).length}`, ''];
  if (summary) lines.push('## Tester summary', '', summary, '');
  lines.push('## Steps', '');
  let prev = null;
  for (const r of rows) {
    let st = null;
    try { st = JSON.parse(readFileSync(join(D, r.statePath), 'utf8')); } catch { /* missing */ }
    const time = st ? hhmm(st.gameHour) : '--:--';
    lines.push(`### Step ${r.step} · game ${time}${st ? ` · ${st.street || 'unknown street'}` : ''}`);
    lines.push('', `> ${r.thought}`, '');
    if (r.actions?.length) lines.push(`Actions: ${r.actions.map(describeAction).join('; ')}`);
    if (r.ignored?.length) lines.push(`Harness notes: ${r.ignored.join('; ')}`);
    if (st) {
      const ch = notableChanges(prev, st);
      lines.push(`State: pos (${st.player.x}, ${st.player.z}), facing ${st.player.cameraFacing}, ${st.inVehicle ? `in ${st.vehicle?.type ?? 'car'} at ${st.vehicle?.speedKmh} km/h` : 'on foot'}, wanted ${st.wantedStars}`);
      if (ch.length) lines.push(`Notable: ${ch.join('; ')}`);
      prev = st;
    }
    lines.push(`Frame: ${r.framePath}`, '');
  }
  writeFileSync(join(D, 'transcript.md'), lines.join('\n'));
}
/**
 * playtest.mp4 = the webm reduced to the action windows (log tVideoActions -> tVideoEnd, +-0.3 s): the dead time while the
 * tester thinks and the world is frozen is gone. One ffmpeg pass (see cut.mjs). If the cut fails there is NO playtest.mp4
 * (never a stub or a copy of the full video); playtest.webm is the untouched recording.
 */
function makeMp4(D) {
  const res = cutVideo(D, readLog(D));
  if (res.ok) console.log(`[playtest] playtest.mp4: ${res.windows.length} action windows, ${res.seconds.toFixed(1)} s`);
  else console.error(`[playtest] playtest.mp4 not written: ${res.reason}. Cut it later with: node scripts/playtest/cut.mjs ${D}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
