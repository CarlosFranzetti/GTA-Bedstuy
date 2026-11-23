// compare rig joints of two builds: node rigcmp.mjs
import { loadSources, buildBody, SHAPES } from '../people-pipeline.mjs';
const src = loadSources();
for (const name of ['wh_m', 'wh_f', 'teen_b', 'ba_m_old']) {
  process.env.PEOPLE_HANG = 'old'; const a = buildBody(src, SHAPES[name]);
  process.env.PEOPLE_HANG = ''; const b = buildBody(src, SHAPES[name]);
  const d = Object.keys(a.rig).filter((k) => Array.isArray(a.rig[k])).map((k) => `${k} ${(Math.hypot(...a.rig[k].map((v, i) => v - b.rig[k][i])) * 1000).toFixed(1)}`);
  console.log(name, 'height', a.height.toFixed(4), b.height.toFixed(4), d.join(', '));
  console.log('  shoulderL old', a.rig.shoulderL.map(v=>v.toFixed(3)), 'new', b.rig.shoulderL.map(v=>v.toFixed(3)), 'wristL', a.rig.wristL.map(v=>v.toFixed(3)), b.rig.wristL.map(v=>v.toFixed(3)));
}
