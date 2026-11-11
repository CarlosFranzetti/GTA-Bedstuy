// Boot smoke: launches Electron (software GL) with remote debugging on 4477 and checks the page over CDP.
// Run under xvfb: xvfb-run -a node scripts/smoke.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const electron = createRequire(import.meta.url)('electron');
const PORT = 4477;
const p = spawn(electron, ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu-sandbox'], { env: { ...process.env, GTA_SMOKE: '1' }, stdio: 'inherit' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page;
for (let i = 0; i < 60 && !page; i++) {
  await sleep(1000);
  try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page'); } catch {}
}
if (!page) { console.error('SMOKE FAIL: no page target'); p.kill(); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d.result ?? d.error); pend.delete(d.id); }
  else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
  else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
await sleep(15000);
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.value;
const out = {
  url: await ev('location.href'),
  debug: await ev('typeof window.__gtaDebug'),
  native: await ev('JSON.stringify({n: window.gtaNative?.isNative, p: window.gtaNative?.platform, v: window.gtaNative?.version, keys: Object.keys(window.gtaNative||{})})'),
  title: await ev('document.title'),
  errors,
};
console.log(JSON.stringify(out, null, 1));
p.kill();
process.exit(out.debug === 'undefined' || errors.length ? 1 : 0);
