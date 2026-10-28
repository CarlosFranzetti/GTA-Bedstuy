/**
 * Graffiti on the exposed party wall beside a vacant lot: one quad per tag carrying a variant of the library's
 * `graffiti` decal texture (512 x 256, abstract glyphs, no words), 0.03 m off the wall. Shop roll gates carry their own
 * decal in mixeduse.ts (S4), so no tags are laid there.
 */
import * as THREE from 'three';
import type { IMaterialLibrary, Lot } from '@/world/types';
import type { Rng } from '@/core/Rng';
import { PropsBuilder, frameMatrix, norm2 } from './common';

const WALL_DECAL_OFFSET = 0.03;
const TALL_NEIGHBOURS = new Set(['brownstone', 'rowhouse', 'mixeduse', 'apartment', 'scaffold']);
/** graffiti variants 0-4 are tags / throw-ups / pieces / stickers / runs; variant 5 is a roller 'buff' patch (kept for gates) */
const WALL_VARIANTS = 5;
const DECAL_ASPECT = 2; // texture is 512 x 256

/** Variants are merged per variant: at most WALL_VARIANTS draw calls for every wall tag in the city. */
export function buildGraffiti(pb: PropsBuilder, lots: Lot[], rng: Rng, materials: IMaterialLibrary): void {
  for (const lot of lots) {
    if (lot.type !== 'vacant') continue;
    for (const end of ['A', 'B'] as const) {
      const e = end === 'A' ? lot.frontA : lot.frontB;
      const o = end === 'A' ? lot.frontB : lot.frontA;
      const neighbour = lots.find((l) => l !== lot && l.blockId === lot.blockId && l.side === lot.side
        && TALL_NEIGHBOURS.has(l.type)
        && (Math.hypot(l.frontA.x - e.x, l.frontA.z - e.z) < 0.7 || Math.hypot(l.frontB.x - e.x, l.frontB.z - e.z) < 0.7));
      if (!neighbour || !rng.chance(0.75)) continue;
      const n = norm2(o.x - e.x, o.z - e.z); // from the wall into the vacant lot
      const zc = rng.range(3, Math.max(3.5, Math.min(lot.depth, neighbour.depth) - 3));
      const centre = {
        x: e.x + n.x * WALL_DECAL_OFFSET - lot.outward.x * zc,
        z: e.z + n.z * WALL_DECAL_OFFSET - lot.outward.z * zc,
      };
      const variant = rng.int(0, WALL_VARIANTS - 1);
      const width = rng.range(1.8, 2.8);
      const g = new THREE.PlaneGeometry(width, width / DECAL_ASPECT)
        .translate(0, rng.range(2.2, 3.4), 0)
        .applyMatrix4(frameMatrix(centre, 0, n));
      pb.put(`graffiti:${variant}`, materials.get('graffiti', variant), g);
      pb.count('graffiti');
    }
  }
}
