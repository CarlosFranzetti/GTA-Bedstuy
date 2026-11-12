// prints, for a BVH, how upright the body is at frame 0 (should be a T pose) and mid-file: spine up-vector and left-arm direction
import { parseBvh, fk } from '../bvh.mjs';
for (const f of process.argv.slice(2)) {
  const b = parseBvh(f), I = b.index;
  for (const fr of [0, Math.floor(b.frames / 2)]) {
    const k = fk(b, fr);
    const up = k.pos[I.Head].clone().sub(k.pos[I.Hips]).normalize();
    const arm = k.pos[I.LeftForeArm].clone().sub(k.pos[I.LeftArm]).normalize();
    console.log(f.split('/').pop(), 'frame', fr, 'hips->head', up.toArray().map((v) => v.toFixed(2)).join(','), 'leftArm', arm.toArray().map((v) => v.toFixed(2)).join(','));
  }
}
