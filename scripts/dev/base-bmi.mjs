// BASE seat: BMI-equivalent of the source figures at grid points (mesh volume x 1.01 kg/L over stature squared).
// node scripts/dev/base-bmi.mjs   (prints per shape: weight -1, 0, +1, +1.4 at average muscle, and muscle -1, +1 at average weight)
import { loadSources, buildBody, SHAPES, gridTargets } from '../people-pipeline.mjs';
const src = loadSources();
const vol = (b) => { const P = b.positions, ix = b.indices; let v = 0; for (let t = 0; t < ix.length; t += 3) { const a = ix[t] * 3, c = ix[t + 1] * 3, d = ix[t + 2] * 3; v += (P[a] * (P[c + 1] * P[d + 2] - P[c + 2] * P[d + 1]) - P[a + 1] * (P[c] * P[d + 2] - P[c + 2] * P[d]) + P[a + 2] * (P[c] * P[d + 1] - P[c + 1] * P[d])) / 6; } return Math.abs(v); };
const at = (shape, w, m) => {
  // bilinear over the grid like the runtime (gridCoeffs), applied as target weights
  const f = (t) => [Math.max(0, -t), 1 - Math.abs(t), Math.max(0, t)], fm = f(m), fw = f(w), t = { ...shape.targets };
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const k = `${i}${j}`; if (k === '11') continue; const c = fm[i] * fw[j]; if (!c) continue; for (const [n, x] of Object.entries(gridTargets(shape, k))) t[n] = (t[n] ?? 0) + c * x; }
  const b = buildBody(src, { ...shape, targets: t });
  return (vol(b) * 1010) / (b.height * b.height);
};
for (const name of (process.argv[2] ?? 'wh_m,wh_f,ba_m,ba_f,ea_m,wh_m_old,wh_f_old,teen_a,teen_b').split(',')) {
  const s = SHAPES[name];
  const r = [[-1, 0], [0, 0], [1, 0], [1.4, 0], [0, -1], [0, 1], [1, -1], [1, 1], [-1, 1]].map(([w, m]) => `${w}/${m}:${at(s, w, m).toFixed(1)}`);
  console.log(name.padEnd(9), r.join('  '));
}
