/**
 * REALFIX: a plain fenced lot for the blocks whose building ring leaves the kerb ring (`badBlocks`), so they are not bare ground. The fence
 * stands 2.2 m inside the kerb ring and is left out wherever a piece of it would stand on the roadway (a kerb ring that is degenerate on a
 * thin Broadway wedge can cover the road; `net.isOnRoad` says where the pavement is). Chain-link look: a thin dark panel, one post per 3 m.
 * Pure geometry plus a collider per panel; no textures, one material, one mesh per call (the caller splits it into render cells).
 */
import * as THREE from 'three';
import type { Vec2 } from '@/core/Math2';
import type { StaticCollider } from '@/world/types';
import type { Derived } from './derive';
import { pointInPolygon, signedArea } from './geom';
import type { RoadNet } from './RoadNet';
import { insetRing } from './sidewalks';

export const FENCE_INSET = 2.2;
const FENCE_H = 2.2;
const PANEL_M = 3;
const MIN_LOT_AREA = 150;
const Y0 = 0.15;

export interface FenceLots { group: THREE.Group; colliders: StaticCollider[]; lots: number; panels: number }

export function buildFenceLots(net: RoadNet, d: Derived, bad: Iterable<number>, mat: THREE.Material): FenceLots | null {
  const pos: number[] = [];
  const colliders: StaticCollider[] = [];
  let lots = 0, panels = 0;
  const quad = (a: Vec2, b: Vec2, y0: number, y1: number): void => {
    for (const p of [[a, y0], [b, y0], [b, y1], [a, y0], [b, y1], [a, y1]] as Array<[Vec2, number]>) pos.push(p[0].x, p[1], p[0].z);
    for (const p of [[a, y0], [b, y1], [b, y0], [a, y0], [a, y1], [b, y1]] as Array<[Vec2, number]>) pos.push(p[0].x, p[1], p[0].z); // back face
  };
  const post = (p: Vec2, ux: number, uz: number): void => {
    const hw = 0.06, nx = -uz * hw, nz = ux * hw;
    const a = { x: p.x - ux * hw + nx, z: p.z - uz * hw + nz }, b = { x: p.x + ux * hw + nx, z: p.z + uz * hw + nz };
    quad(a, b, Y0, FENCE_H + 0.1);
  };
  for (const blk of bad) {
    const curb = d.curbRings[blk];
    if (!curb || curb.length < 3) continue;
    const ring = insetRing(curb, FENCE_INSET);
    if (ring.length < 3 || Math.abs(signedArea(ring)) < MIN_LOT_AREA || ring.some((p) => !pointInPolygon(p, curb))) continue;
    let any = false;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.5) continue;
      const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
      const n = Math.max(1, Math.round(len / PANEL_M));
      for (let k = 0; k < n; k++) {
        const p0 = { x: a.x + ux * (len * k) / n, z: a.z + uz * (len * k) / n }, p1 = { x: a.x + ux * (len * (k + 1)) / n, z: a.z + uz * (len * (k + 1)) / n };
        const mid = { x: (p0.x + p1.x) / 2, z: (p0.z + p1.z) / 2 };
        if (net.isOnRoad(p0) || net.isOnRoad(p1) || net.isOnRoad(mid)) continue;
        quad(p0, p1, Y0 + 0.1, FENCE_H);
        post(p0, ux, uz); post(p1, ux, uz);
        const hw = 0.1, nx = -uz * hw, nz = ux * hw;
        colliders.push({ shape: { kind: 'polygon', points: [{ x: p0.x + nx, z: p0.z + nz }, { x: p1.x + nx, z: p1.z + nz }, { x: p1.x - nx, z: p1.z - nz }, { x: p0.x - nx, z: p0.z - nz }] }, pos: { x: 0, z: 0 }, id: `fence-${blk}-${i}-${k}` });
        panels++; any = true;
      }
    }
    if (any) lots++;
  }
  if (!panels) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'fence-lots';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.name = 'fence-lots';
  group.add(mesh);
  return { group, colliders, lots, panels };
}
