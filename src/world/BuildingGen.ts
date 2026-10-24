/**
 * Turns lots into buildings. Each building is modelled in a lot-local frame (x along the front from frontA to
 * frontB, y up, z toward the street, facade at z <= 0) and moved into world space. All geometry is merged per
 * material, so the whole city is a handful of meshes (plus one awning + one sign mesh per POI storefront).
 */
import * as THREE from 'three';
import type { Vec2 } from '@/core/Math2';
import type { Rng } from '@/core/Rng';
import type { IMaterialLibrary, Lot, StaticCollider } from '@/world/types';
import { LotBatch, loadMats } from '@/world/buildings/facade';
import type { LocalRect, LotCtx, LotOutput } from '@/world/buildings/facade';
import { buildBrownstone } from '@/world/buildings/brownstone';
import { buildMixedUse } from '@/world/buildings/mixeduse';
import { buildChurch } from '@/world/buildings/church';
import { buildApartment } from '@/world/buildings/apartment';
import { buildVacant } from '@/world/buildings/vacant';
import { buildScaffold } from '@/world/buildings/scaffold';

export function buildBuildings(
  lots: Lot[],
  materials: IMaterialLibrary,
  rng: Rng,
): { group: THREE.Group; colliders: StaticCollider[] } {
  const mats = loadMats(materials);
  const batch = new LotBatch();
  const colliders: StaticCollider[] = [];

  // Which end of each corner lot touches the cross street: first corner lot on a face = frontA end.
  const cornerSide = new Map<string, 'left' | 'right'>();
  const seen = new Map<string, number>();
  for (const l of lots) {
    if (!l.corner) continue;
    const key = `${l.blockId}|${l.side}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    cornerSide.set(l.id, n === 0 ? 'left' : 'right');
  }
  const cornersPerFace = seen;

  for (const lot of lots) {
    const lrng = rng.fork(lot.id);
    const dx = lot.frontB.x - lot.frontA.x, dz = lot.frontB.z - lot.frontA.z;
    const dl = Math.hypot(dx, dz) || 1;
    let dir: Vec2 = { x: dx / dl, z: dz / dl };
    let origin: Vec2 = lot.frontA;
    // local +z must equal outward and (x, y, z) must be right-handed: outward = perpRight(dir)
    const perp: Vec2 = { x: -dir.z, z: dir.x };
    if (perp.x * lot.outward.x + perp.z * lot.outward.z < 0) {
      dir = { x: -dir.x, z: -dir.z };
      origin = lot.frontB;
    }
    const mirrored = origin === lot.frontB;
    const m4 = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(dir.x, 0, dir.z),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(lot.outward.x, 0, lot.outward.z),
    );
    m4.setPosition(origin.x, 0, origin.z);
    const toWorld = (x: number, z: number): Vec2 => ({
      x: origin.x + dir.x * x + lot.outward.x * z,
      z: origin.z + dir.z * x + lot.outward.z * z,
    });

    let side: 'left' | 'right' | null = cornerSide.get(lot.id) ?? null;
    if (side && cornersPerFace.get(`${lot.blockId}|${lot.side}`) === 1) side = 'left';
    if (side && mirrored) side = side === 'left' ? 'right' : 'left';

    const ctx: LotCtx = { b: batch, m: mats, rng: lrng, W: lot.width, D: lot.depth, lot, cornerSide: side };
    let out: LotOutput;
    switch (lot.type) {
      case 'brownstone': out = buildBrownstone(ctx, { style: 'brownstone' }); break;
      case 'rowhouse': out = buildBrownstone(ctx, { style: 'rowhouse' }); break;
      case 'mixeduse': out = buildMixedUse(ctx); break;
      case 'church': out = buildChurch(ctx); break;
      case 'apartment': out = buildApartment(ctx); break;
      case 'scaffold': out = buildScaffold(ctx); break;
      case 'vacant': out = buildVacant(ctx); break;
    }
    batch.flush(m4);

    const poly = (r: LocalRect): StaticCollider => {
      const pts = [toWorld(r.x0, r.z0), toWorld(r.x1, r.z0), toWorld(r.x1, r.z1), toWorld(r.x0, r.z1)];
      let area = 0;
      for (let i = 0; i < 4; i++) { const p = pts[i], q = pts[(i + 1) % 4]; area += p.x * q.z - q.x * p.z; }
      if (area < 0) pts.reverse(); // clockwise seen from above (x east, z south)
      return { shape: { kind: 'polygon', points: pts }, pos: { x: 0, z: 0 }, id: `${lot.id}` };
    };
    for (const r of out.body) colliders.push(poly(r));
    out.stoops.forEach((r, i) => { const c = poly(r); c.id = `${lot.id}-stoop${i}`; colliders.push(c); });
    if (out.fence) {
      colliders.push({
        shape: { kind: 'segment', a: toWorld(out.fence.x0, out.fence.z), b: toWorld(out.fence.x1, out.fence.z) },
        pos: { x: 0, z: 0 },
        id: `${lot.id}-fence`,
      });
    }
  }

  const group = new THREE.Group();
  group.name = 'buildings';
  for (const { material, geometry } of batch.merged()) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'buildings:' + (material.name || material.type);
    group.add(mesh);
  }
  return { group, colliders };
}
