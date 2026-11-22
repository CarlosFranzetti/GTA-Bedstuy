/**
 * AGES seat (body team, round 2): elders, teenagers and children as their own shapes.
 *
 * Called from dressLodBody in pedMesh.ts right after the mass fit, in the order applyTorso, applyLimbs, applyAges, on every level of detail.
 * `pos` is the level's vertex positions in the shape's own space (metres, y up, crown at the shape's stature); move vertices in place.
 * The three levels must agree: derive every number from the shape's joints and landmarks or from a fit made once on the hi level, never from a level's own vertices alone.
 */
import type { MhLod, MhShape } from './pedMesh';
import type { PedSpec } from '@/textures/painters/ped';

export function applyAges(_s: MhShape, _spec: PedSpec, _L: MhLod, _pos: Float32Array): void {
  // the seat's deformers go here
}
