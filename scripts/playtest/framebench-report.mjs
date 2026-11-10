// Summarise a framebench.json: frame-time percentiles, hitches >50 ms (with the busiest section), camera yaw-rate steps.
// Usage: node scripts/playtest/framebench-report.mjs <framebench.json>
import { readFileSync } from 'node:fs';
const r = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const phases = {};
r.frames.forEach((f, i) => { if (i > 0) (phases[f[6]] ??= []).push(i); });
console.log(`inCar=${r.inCar} outCar=${r.outCar} frames=${r.frames.length} errors=${r.errs.length}`);
console.log('phase      n   dt p50/p95/p99 ms   >50ms  yawRate step p95/max (deg/s)  camPosStep p99 (m)  walk disp (m)');
for (const [ph, idx] of Object.entries(phases)) {
  if (ph === 'boot') continue;
  const dts = idx.map((i) => r.frames[i][1]);
  const steps = []; const jerk = []; const pstep = [];
  let prevW = null;
  for (const i of idx) {
    const a = r.frames[i - 1], b = r.frames[i];
    if (!a[2] || !b[2]) continue;
    const dt = b[1] / 1000; if (dt <= 0) continue;
    const w = (wrap(b[2][3] - a[2][3]) * 180 / Math.PI) / dt;
    if (prevW !== null) jerk.push(Math.abs(w - prevW));
    prevW = w;
    pstep.push(Math.hypot(b[2][0] - a[2][0], b[2][2] - a[2][2]));
  }
  const first = r.frames[idx[0]], last = r.frames[idx[idx.length - 1]];
  console.log(`${ph.padEnd(8)} ${String(idx.length).padStart(4)}   ${pct(dts, .5).toFixed(0)}/${pct(dts, .95).toFixed(0)}/${pct(dts, .99).toFixed(0)}   ${dts.filter((d) => d > 50).length}   ${pct(jerk, .95).toFixed(0)}/${Math.max(0, ...jerk).toFixed(0)}   ${pct(pstep, .99).toFixed(2)}   ${Math.hypot(last[4] - first[4], last[5] - first[5]).toFixed(1)}`);
}
const hitches = r.frames.map((f, i) => [i, f]).filter(([i, f]) => i > 0 && f[1] > 50 && f[6] !== 'boot');
const cause = {};
for (const [, f] of hitches) {
  const s = Object.entries(f[7] ?? {}).sort((a, b) => b[1] - a[1])[0];
  const k = s && s[1] > f[1] * 0.3 ? s[0] : 'unattributed (gpu/swiftshader wait or other JS)';
  cause[k] = (cause[k] ?? 0) + 1;
}
console.log('hitch frames >50 ms:', hitches.length, JSON.stringify(cause));
console.log('longtasks >50 ms by phase:', JSON.stringify(r.long.reduce((m, l) => (m[l[2]] = (m[l[2]] ?? 0) + 1, m), {})));
const jsms = {};
for (const f of r.frames) for (const [k, v] of Object.entries(f[7] ?? {})) (jsms[k] ??= []).push(v);
console.log('JS ms per frame p50/p99 by section:', Object.entries(jsms).map(([k, v]) => `${k} ${pct(v, .5).toFixed(1)}/${pct(v, .99).toFixed(1)}`).join('  '));
