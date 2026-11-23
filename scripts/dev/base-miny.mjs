// BASE seat: lowest point of each level of a shape, new hang vs PEOPLE_HANG=old (node scripts/dev/base-miny.mjs wh_m)
import { loadSources, buildShape } from '../people-pipeline.mjs';
const { MeshoptSimplifier } = await import('meshoptimizer'); await MeshoptSimplifier.ready;
const src = loadSources();
for (const hang of ['old', 'new']) {
  process.env.PEOPLE_HANG = hang === 'old' ? 'old' : '';
  const b = buildShape(src, MeshoptSimplifier, process.argv[2] ?? 'wh_m');
  let fy = Infinity; for (let i = 1; i < b.body.positions.length; i += 3) fy = Math.min(fy, b.body.positions[i]);
  console.log(hang, 'full', fy.toFixed(4), Object.entries(b.lods).map(([k, L]) => { let m = Infinity; for (let i = 1; i < L.position.length; i += 3) m = Math.min(m, L.position[i]); return `${k} ${m.toFixed(4)}`; }).join(' '), 'ankleY', b.body.rig.ankleY.toFixed(3));
}
