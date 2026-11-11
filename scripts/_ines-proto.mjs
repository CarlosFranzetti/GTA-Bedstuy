import { loadSources, buildBody, SHAPES, decimate, REGION_BUDGET } from './people-pipeline.mjs';
import { MeshoptSimplifier } from 'meshoptimizer';
await MeshoptSimplifier.ready;
const src = loadSources();
const b = buildBody(src, SHAPES[process.argv[2] ?? 'wh_m']);
const { landmarks: lm } = b;
const variants = [{ ...REGION_BUDGET.hi }, { ...REGION_BUDGET.hi, skullKeep: 0.35 }, { ...REGION_BUDGET.hi, head: 2400, skullKeep: 0.25 }];
for (const bud of variants) {
  const m = decimate(MeshoptSimplifier, b, 6400, bud);
  const P = m.positions, ix = m.indices, W = m.w12;
  let head = 0, face = 0, hand = 0, tot = ix.length / 3;
  for (let t = 0; t < ix.length; t += 3) {
    let hw = 0, z = 0, y = 0;
    for (let k = 0; k < 3; k++) { hw += W[ix[t + k] * 12 + 3] / 3; z += P[ix[t + k] * 3 + 2] / 3; y += P[ix[t + k] * 3 + 1] / 3; }
    if (hw > 0.5) { head++; if (z < -0.11 && y > lm.chinY - 0.01) face++; }
  }
  console.log(JSON.stringify(bud), 'total', tot, 'head', head, 'face', face);
}
