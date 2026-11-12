// Native launch test: starts the real Electron app (software GL), waits for the title screen, presses start, draws one frame, and checks that
// everything the hosted build gained is reachable through the app:// protocol and the content security policy.
//
//   Linux, under a virtual display, through the render queue (the game canvas is hidden from the first byte, see docs/swarm/RULES.md):
//     scripts/swarm-render.sh xvfb-run -a node native/scripts/smoke.mjs [--query "map=real&perf=0"] [--shot out.png] [--json out.json]
//   --exe <binary> tests a packaged app (electron-builder --linux dir) instead of the source tree.
//   Needs native/web (npm --prefix native run prep) and native/out (npm --prefix native run compile).
//
// Exit code 0 = title screen up, start works, one frame drawn, no console errors, no failed app:// requests, no policy blocks on allowed hosts.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const nativeDir = join(here, '..');
const electron = createRequire(import.meta.url)('electron');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const PORT = Number(arg('--port', '4477')), INSPECT = PORT + 1;
const QUERY = arg('--query', 'perf=0');
const SHOT = arg('--shot', '');
const JSON_OUT = arg('--json', '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EXE = arg('--exe', ''); // a packaged app (e.g. native/release/linux-unpacked/gta-bedstuy-native) instead of `electron .`
const p = spawn(EXE || electron, [...(EXE ? [] : ['.']), `--remote-debugging-port=${PORT}`, `--inspect=${INSPECT}`, '--no-sandbox', '--disable-gpu-sandbox', '--debug-gfx', '--q=low'], {
  cwd: nativeDir, env: { ...process.env, GTA_SMOKE: '1', GTA_SMOKE_QUERY: QUERY }, stdio: ['ignore', 'inherit', 'inherit'],
});
let exited = false; p.on('exit', () => { exited = true; });
const bail = (msg) => { console.error('SMOKE FAIL:', msg); try { p.kill(); } catch {} process.exit(1); };

async function target(port, type) {
  for (let i = 0; i < 90 && !exited; i++) {
    await sleep(1000);
    try { const t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => !type || x.type === type); if (t) return t; } catch {}
  }
  return null;
}
function cdp(url) {
  const ws = new WebSocket(url);
  let id = 0; const pend = new Map(); const handlers = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else for (const h of handlers) h(d); };
  const ready = new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  return { ready, send, on: (h) => handlers.push(h), close: () => ws.close() };
}

const page = await target(PORT, 'page');
if (!page) bail('no page target (the app did not start)');
const c = cdp(page.webSocketDebuggerUrl); await c.ready;
const consoleErrors = [], logErrors = [], failedApp = [], offline = [], reqs = new Map(), violations = [];
c.on((d) => {
  const m = d.method, q = d.params;
  if (m === 'Runtime.exceptionThrown') consoleErrors.push(q.exceptionDetails.exception?.description ?? q.exceptionDetails.text);
  else if (m === 'Runtime.consoleAPICalled' && (q.type === 'error' || q.type === 'assert')) consoleErrors.push(q.args.map((a) => a.value ?? a.description).join(' '));
  else if (m === 'Log.entryAdded' && q.entry.level === 'error') logErrors.push(`${q.entry.source}: ${q.entry.text} ${q.entry.url ?? ''}`);
  else if (m === 'Network.requestWillBeSent') reqs.set(q.requestId, { url: q.request.url, status: 0 });
  else if (m === 'Network.responseReceived') { const r = reqs.get(q.requestId); if (r) r.status = q.response.status; if (q.response.url.startsWith('app://') && q.response.status >= 400) failedApp.push(`${q.response.status} ${q.response.url}`); }
  else if (m === 'Network.loadingFailed') {
    const r = reqs.get(q.requestId);
    if (!r || q.canceled) return;
    (r.url.startsWith('app://') ? failedApp : offline).push(`${q.errorText} ${r.url.slice(0, 120)}`);
  }
});
await c.send('Runtime.enable'); await c.send('Log.enable'); await c.send('Network.enable'); await c.send('Page.enable');
const ev = async (expression, awaitPromise = false) => {
  const r = await c.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text };
  return r.result?.result?.value;
};
// The game canvas is hidden for good before any script of the page runs (rules: a visible software-GL canvas piles up gigabytes).
await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `
  { const st = document.createElement('style'); st.textContent = 'canvas{visibility:hidden !important}'; document.documentElement.appendChild(st); }
  window.__violations = [];
  addEventListener('securitypolicyviolation', (e) => window.__violations.push(e.effectiveDirective + ' ' + e.blockedURI));` });
await c.send('Page.reload');

const t0 = Date.now();
let boot = null;
for (let i = 0; i < 240 && !exited; i++) {
  await sleep(500);
  boot = await ev(`(() => { const s = document.querySelector('.hud-splash'); const l = document.getElementById('loading');
    return { dbg: typeof window.__gtaDebug, splash: !!s && getComputedStyle(s).display !== 'none', title: (document.querySelector('.hud-title') || {}).textContent || '', loading: !!l && getComputedStyle(l).display !== 'none' && !l.classList.contains('fading') }; })()`);
  if (boot && boot.dbg === 'object' && boot.splash && !boot.loading) break;
}
if (exited) bail('the app exited while booting');
const bootMs = Date.now() - t0;
if (!(boot && boot.dbg === 'object' && boot.splash)) bail(`never reached the title screen: ${JSON.stringify(boot)} (errors: ${JSON.stringify(consoleErrors.slice(0, 5))})`);
await ev(`__gtaDebug.renderer.domElement.style.visibility = 'hidden'`);
if (SHOT) {
  const s = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(SHOT.replace(/\.png$/, '') + '-title.png', Buffer.from(s.result.data, 'base64'));
}

// ---- start the game: a click is the first gesture
const titleOk = /GTA/.test(boot.title) && /BED-STUY/.test(boot.title);
await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 400, y: 300 });
await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 400, y: 300, button: 'left', clickCount: 1 });
await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 400, y: 300, button: 'left', clickCount: 1 });
await sleep(4000);
const started = await ev(`(() => { const s = document.querySelector('.hud-splash'); return !s || s.classList.contains('fading') || getComputedStyle(s).display === 'none'; })()`);

// ---- one frame, drawn by hand from a stopped loop, read back in the same task
const frame = await ev(`(() => {
  const g = window.__gtaDebug; g.stopLoop();
  const info = g.renderOnce();
  const gl = g.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(4); const seen = new Set(); let lit = 0;
  for (let y = 4; y < h; y += Math.max(1, Math.floor(h / 24))) for (let x = 4; x < w; x += Math.max(1, Math.floor(w / 24))) { gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); seen.add((px[0] >> 4) * 256 + (px[1] >> 4) * 16 + (px[2] >> 4)); if (px[0] + px[1] + px[2] > 12) lit++; }
  const url = SHOT_WANTED ? g.renderer.domElement.toDataURL('image/png') : '';
  return { w, h, calls: info.total, tris: info.triangles, colours: seen.size, lit, url, glError: gl.getError(), lost: gl.isContextLost() };
})()`.replace('SHOT_WANTED', SHOT ? 'true' : 'false'));
if (frame?.url) { writeFileSync(SHOT.replace(/\.png$/, '') + '-frame.png', Buffer.from(frame.url.split(',')[1], 'base64')); delete frame.url; }

// ---- what the hosted build gained, through the app protocol
const feat = await ev(`(async () => {
  const out = {};
  const head = async (u) => { try { const r = await fetch(u); const b = await r.arrayBuffer(); return { ok: r.ok, status: r.status, bytes: b.byteLength, type: r.headers.get('content-type') }; } catch (e) { return { ok: false, error: String(e) }; } };
  out.street = await head('./anim/street.bin');
  out.core = await head('./anim/core.bin');
  out.voiceManifest = await head('./voice/manifest.json');
  out.voiceBank = await head('./voice/banks/dj-cass.mp3');
  out.overview = await head('./data/brooklyn-overview.json');
  out.furniture = await head('./data/realmap-furniture.json');
  out.fontFile = await head('./fonts/Anton-Regular.woff2');
  out.artDir = await head('./art/');
  await document.fonts.ready;
  out.fonts = [...document.fonts].map((f) => f.family.replace(/"/g, '') + ' ' + f.weight + ' ' + f.status);
  out.antonUsable = document.fonts.check('20px Anton');
  out.native = window.gtaNative ? { isNative: window.gtaNative.isNative, platform: window.gtaNative.platform, version: window.gtaNative.version } : null;
  out.title = document.title;
  out.overlay = !!document.querySelector('[data-gfx-debug]');
  out.url = location.href;
  return out;
})()`, true);
const seenReq = (re) => [...reqs.values()].some((r) => re.test(r.url) && r.status >= 200 && r.status < 400);
feat.gameFetchedStreet = seenReq(/anim\/street\.bin/);
feat.gameFetchedVoiceManifest = seenReq(/voice\/manifest\.json/);

// ---- content security policy probes (no network needed: a block is reported before any request is made)
const csp = await ev(`(async () => {
  const hit = async (label, fn, allowed) => {
    const before = window.__violations.length;
    try { await fn(); } catch {}
    await new Promise((r) => setTimeout(r, 300));
    const blocked = window.__violations.slice(before).length > 0;
    return { label, blocked, expected: allowed ? 'allowed' : 'blocked', pass: blocked !== allowed };
  };
  const res = [];
  const stream = (u) => () => { const a = new Audio(); a.preload = 'none'; a.src = u; a.load(); };
  res.push(await hit('radio stream wfmu', stream('https://stream0.wfmu.org/freeform-128k'), true));
  res.push(await hit('radio stream somafm', stream('https://ice2.somafm.com/u80s-128-mp3'), true));
  res.push(await hit('radio stream kexp', stream('https://kexp.streamguys1.com/kexp128.mp3'), true));
  res.push(await hit('now-playing kexp', () => fetch('https://api.kexp.org/v2/plays/?limit=1'), true));
  res.push(await hit('now-playing somafm', () => fetch('https://api.somafm.com/channels.json'), true));
  res.push(await hit('soundcloud api.js', () => { const s = document.createElement('script'); s.src = 'https://w.soundcloud.com/player/api.js'; document.head.appendChild(s); }, true));
  res.push(await hit('soundcloud widget iframe', () => { const f = document.createElement('iframe'); f.setAttribute('allow', 'autoplay; encrypted-media'); f.style.cssText = 'width:1px;height:1px;position:fixed;left:0;top:0;opacity:0'; f.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent('https://soundcloud.com/platform/tracks') + '&auto_play=false'; document.body.appendChild(f); }, true));
  res.push(await hit('voice model host', () => fetch('https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/config.json'), true));
  res.push(await hit('voice library from jsdelivr (blob worker)', () => new Promise((resolve) => {
    const src = "self.addEventListener('securitypolicyviolation', (e) => postMessage('violation ' + e.effectiveDirective)); import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js').then(() => postMessage('ok'), () => postMessage('failed'));";
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = (m) => { if (/violation/.test(String(m.data))) window.__violations.push('worker ' + m.data); if (m.data === 'ok' || m.data === 'failed') { w.terminate(); resolve(); } };
    setTimeout(() => { w.terminate(); resolve(); }, 8000);
  }), true));
  res.push(await hit('phonemizer from an unlisted CDN is refused', () => import('https://unpkg.com/phonemizer@1.2.1/dist/phonemizer.js'), false));
  res.push(await hit('an unlisted site is refused (fetch)', () => fetch('https://evil.example/x'), false));
  res.push(await hit('an unlisted site is refused (iframe)', () => { const f = document.createElement('iframe'); f.src = 'https://evil.example/'; document.body.appendChild(f); }, false));
  res.push(await hit('inline script is refused', () => { const s = document.createElement('script'); s.textContent = 'window.__x = 1'; document.head.appendChild(s); }, false));
  return res;
})()`, true);

// ---- the "Copy graphics report" path, through the main process
let report = '';
const ins = await target(INSPECT, null);
if (ins) {
  const m = cdp(ins.webSocketDebuggerUrl); await m.ready;
  const r = await m.send('Runtime.evaluate', { expression: '__gtaSmoke.collectGraphicsReport()', awaitPromise: true, returnByValue: true });
  report = r.result?.result?.value ?? `(no report: ${JSON.stringify(r.result)})`;
  m.close();
}

const real = /map=real/.test(QUERY) ? await ev(`(() => { const d = window.__gtaDebug; return { realWorld: /map=real/.test(location.search), buildings: d.scene.children.length }; })()`) : null;

const out = { query: QUERY, bootMs, boot, titleOk, started, frame, feat, csp, real, offline: offline.slice(0, 12), consoleErrors, logErrors, failedApp, violations: await ev('window.__violations'), report };
const problems = [];
if (!titleOk) problems.push(`title screen text: ${JSON.stringify(boot.title)}`);
if (!started) problems.push('the title screen did not respond to a click');
if (!frame || frame.__error || !(frame.calls > 0) || frame.lost) problems.push(`no frame drawn: ${JSON.stringify(frame)}`);
else if (frame.colours < 3 || frame.lit < 5) problems.push(`the frame looks empty: ${frame.colours} colours, ${frame.lit} lit samples`);
if (frame?.glError) problems.push(`gl error ${frame.glError}`);
for (const k of ['street', 'core', 'voiceManifest', 'voiceBank', 'overview', 'furniture', 'fontFile']) if (!feat[k]?.ok || !(feat[k].bytes > 0)) problems.push(`${k} not served: ${JSON.stringify(feat[k])}`);
if (!feat.gameFetchedStreet) problems.push('the game itself never fetched anim/street.bin');
if (!feat.native?.isNative) problems.push('window.gtaNative missing');
if (!feat.overlay) problems.push('--debug-gfx did not open the graphics overlay');
if (!feat.antonUsable) problems.push('Anton font not usable');
for (const x of csp) if (!x.pass) problems.push(`policy: ${x.label} was ${x.blocked ? 'blocked' : 'allowed'}, expected ${x.expected}`);
for (const e of consoleErrors) problems.push(`console error: ${String(e).slice(0, 300)}`);
for (const e of logErrors) if (!/ERR_(NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|CONNECTION|TUNNEL|PROXY|CERT)/.test(e) && !/evil\.example|unpkg\.com/.test(e)) problems.push(`log error: ${e.slice(0, 300)}`);
for (const e of failedApp) problems.push(`failed app:// request: ${e}`);
if (!/webgl renderer/.test(report)) problems.push('graphics report has no renderer line');
out.problems = problems;
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, report: report.split('\n') }, null, 1));
console.log(problems.length ? `SMOKE FAIL (${problems.length})` : 'SMOKE OK');
try { p.kill(); } catch {}
await sleep(500);
process.exit(problems.length ? 1 : 0);
