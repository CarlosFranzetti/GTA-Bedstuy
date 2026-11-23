/**
 * GAIT3: the shoe of one BUILT person, read from its skin. The foot lock used one shoe for everybody (the sole 7.5 cm under the ankle bone, heel at +0.07, ball at
 * -0.12), but the bodies differ: a boy's sole is about 5.5 cm under the ankle, a short heavy man's 8.2, and the ball sits 11 to 18 cm forward of it. With the one
 * shoe a child's feet floated 2 cm above the road and some walks slid.
 * Measured once per person at construction, in the ankle bone's own frame (rig units, forward is -z): the skin vertices whose strongest bone is the ankle.
 */
import * as THREE from 'three';
import type { FootDims } from './footlock';

const P = new THREE.Vector3();
const inv = new THREE.Matrix4();

/** the shoe of side 0 (left) and 1 (right) for this figure, or null when the figure has no skinned mesh or no ankle bones (the caller keeps the default shoe) */
export function measureFeet(group: THREE.Object3D | undefined, ankles: THREE.Object3D[] | undefined): [FootDims, FootDims] | null {
  if (!group || !ankles || ankles.length < 2) return null;
  let mesh: THREE.SkinnedMesh | null = null;
  group.traverse((o) => { if (!mesh && (o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh; });
  const m = mesh as THREE.SkinnedMesh | null;
  if (!m || !m.skeleton) return null;
  try {
    const bones = m.skeleton.bones, bi = [bones.indexOf(ankles[0] as THREE.Bone), bones.indexOf(ankles[1] as THREE.Bone)];
    if (bi[0] < 0 || bi[1] < 0) return null;
    group.updateMatrixWorld(true);
    m.skeleton.update();
    const g = m.geometry, n = g.getAttribute('position').count, si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight');
    if (!si || !sw) return null;
    const out: FootDims[] = [];
    for (let s = 0; s < 2; s++) {
      inv.copy(ankles[s].matrixWorld).invert();
      const loc: THREE.Vector3[] = [];
      for (let i = 0; i < n; i++) {
        let best = 0, bw = -1;
        for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
        if (best !== bi[s]) continue;
        m.getVertexPosition(i, P);
        loc.push(P.clone().applyMatrix4(m.matrixWorld).applyMatrix4(inv));
      }
      if (loc.length < 20) return null;
      let ymin = 9, toe = 9;
      for (const q of loc) { if (q.y < ymin) ymin = q.y; if (q.z < toe) toe = q.z; }
      let heel = -9;
      for (const q of loc) if (q.y < ymin + 0.02 && q.z > heel) heel = q.z;
      const d: FootDims = { ankleH: -ymin, heel, ball: heel + 0.72 * (toe - heel), toe };
      // a mesh that is not a foot (no sole under the ankle, an absurd length) keeps the default shoe
      if (!(d.ankleH > 0.03 && d.ankleH < 0.12 && heel - toe > 0.15 && heel - toe < 0.4)) return null;
      out.push(d);
    }
    return [out[0], out[1]];
  } catch { return null; }
}
