/**
 * WP4: spatial-hash chunk layout of the real map (docs/swarm/plans/realmap.md section 4, "Chunk culling").
 *
 * The grid map anchors cells and chunks on the street pitch (`chunkLayout` in render/Culling.ts). The real map has no pitch:
 * cells are a fixed 64 m square (32 m on the fine tiers) and chunks 128 m, both anchored at the network bounds' minimum corner.
 * The result is an ordinary `ChunkLayout`, so `splitMeshesIntoCells`, `chunkKeyOf`, `chunkKeyOfCell` and `ChunkCuller` work on it
 * unchanged.
 *
 * Road meshes carry `userData.cell` (from splitMeshesIntoCells) and `userData.chunk`. Their chunk keys are prefixed
 * (`ROAD_CHUNK_PREFIX`) so they can never collide with the building cells' keys, which on the fine tiers use the 32 m cell
 * itself as the chunk: one ChunkCuller can hold both and each key keeps one footprint.
 */
import type * as THREE from 'three';
import { chunkKeyOfCell, type ChunkLayout } from '@/render/Culling';
import type { Bounds } from './RoadNet';

export const REAL_CELL_M = 64;
export const REAL_CELL_FINE_M = 32;
export const REAL_CHUNK_M = 128;
export const ROAD_CHUNK_PREFIX = 'r';

/** The minimum corner of the first two rings' bounds: every layout is a whole number of chunks from it, so growing the map keeps the chunks of the old area as they were (MAP7). */
export const CHUNK_ANCHOR = { x: -287, z: -1300.5 };

/** Cell 64 m (32 m fine), chunk 128 m, origin = the minimum corner of `b`, or with `anchor` snapped down onto the lattice of whole chunks from it (the game passes CHUNK_ANCHOR). */
export function chunkLayoutFromBounds(b: Bounds, fine = false, anchor?: { x: number; z: number }): ChunkLayout {
  const cell = fine ? REAL_CELL_FINE_M : REAL_CELL_M;
  const snap = (v: number, a: number): number => a + Math.floor((v - a) / REAL_CHUNK_M + 1e-9) * REAL_CHUNK_M;
  return { cellX: cell, cellZ: cell, chunkX: REAL_CHUNK_M, chunkZ: REAL_CHUNK_M, originX: anchor ? snap(b.minX, anchor.x) : b.minX, originZ: anchor ? snap(b.minZ, anchor.z) : b.minZ };
}

/** Key of the road chunk that holds the render cell `cellKey` (`ix_iz`). */
export function roadChunkKey(l: ChunkLayout, cellKey: string): string {
  return ROAD_CHUNK_PREFIX + chunkKeyOfCell(l, cellKey);
}

/**
 * Sets `userData.chunk` on every mesh below `root` that has a `userData.cell`, in `layout`. Returns the number of distinct
 * chunks. (Meshes without a cell, i.e. those splitMeshesIntoCells could not split, are keyed by their bounding-sphere centre.)
 */
export function tagRoadChunks(root: THREE.Object3D, layout: ChunkLayout): number {
  const keys = new Set<string>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    let cell = m.userData.cell as string | undefined;
    if (cell === undefined) {
      const g = m.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      const c = g.boundingSphere!.center;
      cell = `${Math.floor((c.x - layout.originX) / layout.cellX)}_${Math.floor((c.z - layout.originZ) / layout.cellZ)}`;
      m.userData.cell = cell;
    }
    const k = roadChunkKey(layout, cell);
    m.userData.chunk = k;
    keys.add(k);
  });
  return keys.size;
}
