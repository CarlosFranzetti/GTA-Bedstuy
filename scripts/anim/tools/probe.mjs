import { parseBvh, fk } from '../bvh.mjs';
import * as THREE from 'three';
const dir = '/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/anim/dl_cmu/bvh/';
const [id, step = '0.25', t0 = '0', t1 = '1e9'] = process.argv.slice(2);
const b = parseBvh(dir + id + '.bvh');
const I = b.index;
const rest = fk(b, 0);
let out = [];
for (let t = +t0; t < Math.min(+t1, b.frames * b.dt); t += +step) {
  const f = Math.round(t / b.dt); if (f < 1 || f >= b.frames) continue;
  const fr = fk(b, f), pv = fk(b, Math.max(1, f - Math.round(0.25 / b.dt)));
  const q = fr.rot[I.Hips].clone().multiply(rest.rot[I.Hips].clone().invert());
  const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const yaw = Math.round(Math.atan2(fw.x, fw.z) * 180 / Math.PI);
  const sp = Math.hypot(fr.pos[I.Hips].x - pv.pos[I.Hips].x, fr.pos[I.Hips].z - pv.pos[I.Hips].z) * 0.0564 / 0.25;
  const lh = fr.pos[I.LeftHand], rh = fr.pos[I.RightHand], hp = fr.pos[I.Hips];
  out.push(`${t.toFixed(2)}s y=${(hp.y * .0564).toFixed(2)} v=${sp.toFixed(1)} yaw=${yaw} hand-hand=${(lh.distanceTo(rh) * .0564).toFixed(2)} lhY=${(lh.y * .0564).toFixed(2)} Lh2head=${(lh.distanceTo(fr.pos[I.Head]) * .0564).toFixed(2)} Rh2head=${(rh.distanceTo(fr.pos[I.Head]) * .0564).toFixed(2)} LhRelFore=${((lh.distanceTo(fr.pos[I.RightForeArm])) * .0564).toFixed(2)} RhRelFore=${((rh.distanceTo(fr.pos[I.LeftForeArm])) * .0564).toFixed(2)}`);
}
console.log(id, b.frames, (b.frames * b.dt).toFixed(1) + 's\n' + out.join('\n'));
