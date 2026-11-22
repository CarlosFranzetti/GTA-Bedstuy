/**
 * LIMBS seat (body team, round 2): arms and legs as anatomy: deltoid cap, upper arm, elbow, forearm, wrist, hand; thigh, knee, calf, ankle, foot.
 *
 * Called from dressLodBody in pedMesh.ts right after the mass fit, in the order applyTorso, applyLimbs, applyAges, on every level of detail.
 * `pos` is the level's vertex positions in the shape's own space (metres, y up, crown at the shape's stature); move vertices in place.
 * The three levels must agree: derive every number from the shape's joints and landmarks or from a fit made once on the hi level, never from a level's own vertices alone.
 */
import type { MhLod, MhShape } from './pedMesh';
import type { PedSpec } from '@/textures/painters/ped';

export function applyLimbs(_s: MhShape, _spec: PedSpec, _L: MhLod, _pos: Float32Array): void {
  // the seat's deformers go here
}

// ---------------------------------------------------------------- measuring (used by the fit and by tests/unit/entities/limbs-anatomy.test.ts)
/** extent of one limb's skin in the plane at a height (shape space, metres) */
export interface Sec { y: number; ok: boolean; x0: number; x1: number; z0: number; z1: number }
const LEFT_ARM = [4, 5], LEFT_LEG = [8, 9];
function wsetL(L: MhLod, set: number[]): Float32Array {
  const n = L.position.length / 3, w = new Float32Array(n);
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) if (set.includes(L.joints[i * 4 + k])) w[i] += L.weights[i * 4 + k];
  return w;
}
/** hull of the left limb's triangle edges cut by the plane y (an edge counts when both ends are limb skin) */
export function limbSection(L: MhLod, pos: Float32Array, w: Float32Array, y: number): Sec {
  const h: Sec = { y, ok: false, x0: 9, x1: -9, z0: 9, z1: -9 };
  for (let t = 0; t < L.index.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = L.index[t + k], b = L.index[t + (k + 1) % 3];
    if (w[a] < 0.5 || w[b] < 0.5 || pos[a * 3] > 0.02 || pos[b * 3] > 0.02) continue;
    const ya = pos[a * 3 + 1], yb = pos[b * 3 + 1]; if ((ya - y) * (yb - y) > 0 || ya === yb) continue;
    const u = (y - ya) / (yb - ya), x = pos[a * 3] + (pos[b * 3] - pos[a * 3]) * u, z = pos[a * 3 + 2] + (pos[b * 3 + 2] - pos[a * 3 + 2]) * u;
    h.ok = true; h.x0 = Math.min(h.x0, x); h.x1 = Math.max(h.x1, x); h.z0 = Math.min(h.z0, z); h.z1 = Math.max(h.z1, z);
  }
  return h;
}
export function limbWeights(L: MhLod, kind: 'leg' | 'arm'): Float32Array { return wsetL(L, kind === 'leg' ? LEFT_LEG : LEFT_ARM); }
