/**
 * Turns lots into buildings. Each building is modelled in a lot-local frame (x along the front from frontA to
 * frontB, y up, z toward the street, facade at z <= 0) and moved into world space. All geometry is merged per
 * material, so the whole city is a handful of meshes (plus one awning + one sign mesh per POI storefront).
 */
import * as THREE from 'three';
import type { Vec2 } from '@/core/Math2';
import { Rng } from '@/core/Rng';
import type { IMaterialLibrary, Lot, StaticCollider } from '@/world/types';
import type { LotSpec } from '@/world/buildings/facade';
import { LotBatch, loadMats } from '@/world/buildings/facade';
import { applyFacadeTexture } from '@/world/buildings/facadeTexture';
import { lotColourway } from '@/world/buildings/colourway';
import type { LocalRect, LotCtx, LotOutput } from '@/world/buildings/facade';
import { buildBrownstone } from '@/world/buildings/brownstone';
import { buildMixedUse } from '@/world/buildings/mixeduse';
import { buildWarehouse } from '@/world/buildings/warehouse';
import { buildChurch } from '@/world/buildings/church';
import { buildApartment } from '@/world/buildings/apartment';
import { buildVacant } from '@/world/buildings/vacant';
import { buildScaffold } from '@/world/buildings/scaffold';

/** A lot as produced by `subdivideLots`: data-driven lots carry the `spec` their facade is generated from. */
export type SpecLot = Lot & { spec?: LotSpec };

/**
 * Per-lot random seeds exactly as `rng.fork(lot.id)` would draw them, in lot order (fork consumes one draw of its parent). Keeping them lets
 * a subset of lots be built again later, on its own, and come out identical (phone tier: cells of buildings are built on demand).
 */
export function lotSeeds(lots: readonly SpecLot[], rng: Rng): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lots) out.set(l.id, Math.floor(rng.next() * 0xffffffff));
  return out;
}

export function buildBuildings(
  lots: SpecLot[],
  materials: IMaterialLibrary,
  rng: Rng,
  /** build only these lots (corner sides still come from the whole of `lots`); with `seeds` the per-lot generators match a full build */
  only?: ReadonlySet<string>,
  seeds?: ReadonlyMap<string, number>,
): { group: THREE.Group; colliders: StaticCollider[] } {
  const g = buildBuildingsSteps(lots, materials, rng, only, seeds);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

/** The same build as `buildBuildings`, one lot per `next()` (so a caller can spread it over frames); the final value is the result. */
export function* buildBuildingsSteps(
  lots: SpecLot[],
  materials: IMaterialLibrary,
  rng: Rng,
  only?: ReadonlySet<string>,
  seeds?: ReadonlyMap<string, number>,
): Generator<void, { group: THREE.Group; colliders: StaticCollider[] }, void> {
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
    const seed = seeds?.get(lot.id);
    const lrng = seed !== undefined ? new Rng((Rng.hash(lot.id) ^ seed) >>> 0) : rng.fork(lot.id);
    if (only && !only.has(lot.id)) continue;
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

    // TEXVAR: per-lot colourway baked into the vertex attributes the shared wall materials read (no extra draw calls)
    const lotMats = applyFacadeTexture(mats, lot.spec, lot.width, batch);
    const fam = lot.spec?.family;
    const frontMats = fam ? new Set<THREE.Material>(fam === 'brownstone' ? [lotMats.brownstone, lotMats.brownstoneAlt] : fam === 'brick' ? [lotMats.brickRed] : fam === 'tanBrick' ? [lotMats.brickAlt] : fam === 'paintedBrick' ? [lotMats.brickPainted] : [lotMats.limestone]) : null;
    batch.setColourway(lotColourway(lot), frontMats, !!lot.corner, fam === 'limestone' || fam === undefined);
    const ctx: LotCtx = { b: batch, m: lotMats, rng: lrng, W: lot.width, D: lot.depth, lot, cornerSide: side, spec: lot.spec };
    let out: LotOutput;
    switch (lot.type) {
      case 'brownstone': out = buildBrownstone(ctx, { style: 'brownstone' }); break;
      case 'rowhouse': out = buildBrownstone(ctx, { style: 'rowhouse' }); break;
      case 'mixeduse': out = (lot.spec as { storefront?: string } | undefined)?.storefront === 'warehouse' ? buildWarehouse(ctx) : buildMixedUse(ctx); break;
      case 'church': out = buildChurch(ctx); break;
      case 'apartment': out = buildApartment(ctx); break;
      case 'scaffold': out = buildScaffold(ctx); break;
      case 'vacant': out = buildVacant(ctx); break;
    }
    batch.flush(m4);
    batch.clearUV();
    batch.setColourway(null);

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
    // areaway iron fences: thin segments along the building line, open at the stoop foot and basement entry
    out.fences?.forEach((f, i) => {
      colliders.push({
        shape: { kind: 'segment', a: toWorld(f.x0, f.z), b: toWorld(f.x1, f.z) },
        pos: { x: 0, z: 0 },
        id: `${lot.id}-areaway${i}`,
      });
    });
    yield;
  }

  const group = new THREE.Group();
  group.name = 'buildings';
  for (const { material, geometry } of batch.merged()) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'buildings:' + (material.name || material.type);
    mesh.castShadow = mesh.name !== 'buildings:party-wall-decal'; // a painted decal on a party wall: the wall already casts, the shadow pass would draw it twice
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return { group, colliders };
}
