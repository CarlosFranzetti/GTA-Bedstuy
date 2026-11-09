/**
 * GEO2: the shipped bedstuy.json still validates, every POI (missions and shops) lands on a lot whose front sits on
 * a sidewalk, and the per-face lot counts match docs/reference/BLOCKS.md section 3.
 */
import { describe, it, expect } from 'vitest';
import { Rng } from '@/core/Rng';
import { dist } from '@/core/Math2';
import { loadBedstuyData, buildGrid } from '@/world/Grid';
import { subdivideLots } from '@/world/LotSubdivider';
import { getBedstuyFaces } from '@/world/data/faces';
import { validateFaces, validateAgainstGrid, lotsForFace } from '@/world/data/schema';
import raw from '@/world/data/bedstuy.json';
import md from '../../../docs/reference/BLOCKS.md?raw';

const data = loadBedstuyData();
const grid = buildGrid(data);
const faces = getBedstuyFaces();

describe('real blocks data', () => {
  it('validates against the schema and the grid', () => {
    expect(validateFaces(raw as unknown)).toEqual([]);
    expect(validateAgainstGrid(grid, faces)).toEqual([]);
  });

  it('keeps every POI on a lot, with its front on a sidewalk strip', () => {
    const lots = subdivideLots(grid, data.pois, new Rng(data.seed).fork('lots'), faces);
    for (const poi of data.pois) {
      const lot = lots.find((l) => l.poi?.id === poi.id);
      expect(lot, `poi ${poi.id} has no lot`).toBeDefined();
      if (!lot) continue;
      expect(lot.width, poi.id).toBeGreaterThanOrEqual(3.5);
      const block = grid.blockById(poi.block);
      const face = block.faces.find((f) => f.side === poi.face)!;
      const mid = { x: (lot.frontA.x + lot.frontB.x) / 2, z: (lot.frontA.z + lot.frontB.z) / 2 };
      // distance from the lot front to the curb line of its face = the sidewalk (plus the areaway): 2 to 8 m
      const ax = face.curbA.x, az = face.curbA.z, bx = face.curbB.x, bz = face.curbB.z;
      const L = Math.hypot(bx - ax, bz - az);
      const t = ((mid.x - ax) * (bx - ax) + (mid.z - az) * (bz - az)) / (L * L);
      expect(t, `${poi.id} along the face`).toBeGreaterThan(-0.02);
      expect(t, `${poi.id} along the face`).toBeLessThan(1.02);
      const d = Math.abs((mid.x - ax) * (bz - az) - (mid.z - az) * (bx - ax)) / L;
      expect(d, `${poi.id} sidewalk depth`).toBeGreaterThan(2);
      expect(d, `${poi.id} sidewalk depth`).toBeLessThan(8);
      expect(dist(face.a, face.b)).toBeGreaterThan(0);
    }
  });

  it('has the per-face lot counts listed in docs/reference/BLOCKS.md', () => {
    const rows = [...md.matchAll(/^\| (r\d+c\d+)-([NSEW]) \| [^|]+ \| (\d+) \|/gm)];
    expect(rows).toHaveLength(40);
    const seen = new Set<string>();
    for (const [, blockId, side, n] of rows) {
      const face = grid.blockById(blockId).faces.find((f) => f.side === side)!;
      expect(face, `${blockId}-${side}`).toBeDefined();
      expect(lotsForFace(grid, face, faces).length, `${blockId}-${side}`).toBe(Number(n));
      seen.add(`${blockId}-${side}`);
    }
    expect(seen.size).toBe(40);
  });
});
