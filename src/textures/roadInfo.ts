/**
 * Per-vertex street info for the ground shader (ROADS). The asphalt and sidewalk materials draw their wear in metres
 * of road space (wheel paths, gutter grime, utility cuts, stop-line oil, slab tone, kerb dirt), so the shader needs to
 * know a few things the UVs alone do not say. They ride in the standard `color` vertex attribute (itemSize 4), so no new
 * attribute, no new draw and no new triangle exists: a few bytes per road vertex.
 *
 *   asphalt  (hw, classCode + seed, s0, s1)   hw = road half width (m), classCode 0 side street / 1 avenue / 2 arterial,
 *                                             seed 0..0.99 per road, s0 / s1 = along-road range of the ribbon in the
 *                                             v coordinate (m, v * 3). hw = 0 (intersection polygons) keeps only the tone.
 *   sidewalk (kerbT, seed, 0, 0)              kerbT 0 at the kerb ring .. 1 at the building line (interpolated across the
 *                                             slab), seed 0..0.99 per block.
 *
 * A geometry without the attribute is simply not "road" for the shader (USE_COLOR_ALPHA is undefined for it).
 */
import * as THREE from 'three';

export const ROAD_CLASS = { street: 0, avenue: 1, arterial: 2 } as const;
export type RoadClassName = keyof typeof ROAD_CLASS;

/** class code for a street class string of either map ('avenue', 'arterial', 'highway', 'ramp', everything else a street) */
export function roadClassCode(cls: string | undefined): number {
  if (cls === 'avenue') return ROAD_CLASS.avenue;
  if (cls === 'arterial' || cls === 'highway' || cls === 'ramp') return ROAD_CLASS.arterial;
  return ROAD_CLASS.street;
}

/** FNV-1a hash of a string to 0..0.99 (a stable per-road / per-block seed) */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 990) / 1000;
}

/** road-ribbon vertex: (hw, class + seed, s0, s1) */
export function roadVertexInfo(hw: number, cls: number, seed: number, s0: number, s1: number): [number, number, number, number] {
  return [hw, cls + Math.min(0.99, Math.max(0, seed)), s0, s1];
}

/** junction polygon vertex: tone only (hw = 0) */
export function junctionVertexInfo(cls: number, seed: number): [number, number, number, number] {
  return [0, cls + Math.min(0.99, Math.max(0, seed)), 0, 0];
}

/** sidewalk vertex: kerbT 0..1 (kerb ring to building line) and the block seed */
export function sidewalkVertexInfo(kerbT: number, seed: number): [number, number, number, number] {
  return [Math.min(1, Math.max(0, kerbT)), Math.min(0.99, Math.max(0, seed)), 0, 0];
}

/** sets the same info on every vertex of a geometry */
export function setUniformRoadInfo(g: THREE.BufferGeometry, info: readonly [number, number, number, number]): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) a.set(info, i * 4);
  g.setAttribute('color', new THREE.Float32BufferAttribute(a, 4));
  return g;
}
