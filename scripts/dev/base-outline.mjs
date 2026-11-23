// BASE seat: outline steps (mm per 1 cm) of the FULL-resolution source body and of the hi level, legs (outer, front, back) and arms. node scripts/dev/base-outline.mjs wh_m [key]
import { loadSources, buildShape, SHAPES } from '../people-pipeline.mjs';
const { MeshoptSimplifier } = await import('meshoptimizer'); await MeshoptSimplifier.ready;
const src = loadSources(), name = process.argv[2] ?? 'wh_m', key = process.argv[3];
const b = buildShape(src, MeshoptSimplifier, name);
const W = (w12, v, set) => set.reduce((t, k) => t + w12[v * 12 + k], 0);
function steps(P, ix, w12, set, y0, y1, part) {
  let prev = null, worst = 0, wy = 0;
  for (let y = y0; y <= y1; y += 0.01) {
    const xs = [], zs = [];
    for (let t = 0; t < ix.length; t += 3) for (let k = 0; k < 3; k++) { const a = ix[t + k], c = ix[t + (k + 1) % 3]; if (W(w12, a, set) < 0.5 || W(w12, c, set) < 0.5 || P[a * 3] > 0 || P[c * 3] > 0) continue; const ya = P[a * 3 + 1], yc = P[c * 3 + 1]; if ((ya - y) * (yc - y) > 0 || ya === yc) continue; const u = (y - ya) / (yc - ya); xs.push(P[a * 3] + (P[c * 3] - P[a * 3]) * u); zs.push(P[a * 3 + 2] + (P[c * 3 + 2] - P[a * 3 + 2]) * u); }
    if (xs.length < 3) continue;
    const o = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    if (prev) for (let k = 0; k < 4; k++) { if (part === 'leg' && k === 1) continue; const d = Math.abs(o[k] - prev[k]); if (d > worst) { worst = d; wy = y; } }
    prev = o;
  }
  return `${part} ${(worst * 1000).toFixed(1)} mm at ${wy.toFixed(2)}`;
}
const R = b.body.rig, lm = b.body.landmarks, P0 = Float32Array.from(b.body.positions);
if (key) for (let i = 0; i < P0.length; i++) P0[i] += 0; // full-res grid deltas are not kept on the result: base only
const H = b.lods.hi, Hw = new Float32Array(H.mesh.positions.length / 3 * 12);
console.log('full', steps(P0, b.body.indices, b.body.w12, [8, 9], lm.ankleY + 0.05, R.hipL[1] - 0.16, 'leg'), steps(P0, b.body.indices, b.body.w12, [4, 5], R.wristL[1] + 0.03, R.shoulderL[1] - 0.12, 'arm'));
console.log('hi  ', steps(H.mesh.positions, H.mesh.indices, H.mesh.w12, [8, 9], lm.ankleY + 0.05, R.hipL[1] - 0.16, 'leg'), steps(H.mesh.positions, H.mesh.indices, H.mesh.w12, [4, 5], R.wristL[1] + 0.03, R.shoulderL[1] - 0.12, 'arm'));
