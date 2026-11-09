/**
 * GRID9 B1: the built world is split into 250 x 200 m render cells grouped into 2 x 2 block chunks, and a ChunkCuller hides
 * whole chunks beyond the per-tier range.
 */
import * as THREE from 'three';
import { describe, it, expect } from 'vitest';
import { ChunkCuller, chunkKeyOfCell, chunkLayout, chunkRangeFor } from '@/render/Culling';
import { realWorld } from '../sim/harness';

const world = realWorld();
const layout = chunkLayout(world.grid.streets);

describe('B1 chunked world build', () => {
  it('every split building and furniture mesh carries its cell and chunk key; a chunk holds at most two cells', () => {
    expect(world.chunkMeshes.length).toBeGreaterThan(20);
    const cellsOfChunk = new Map<string, Set<string>>();
    for (const m of world.chunkMeshes) {
      const cell = m.userData.cell as string, chunk = m.userData.chunk as string;
      expect(typeof cell).toBe('string');
      expect(chunk).toBe(chunkKeyOfCell(layout, cell));
      (cellsOfChunk.get(chunk) ?? cellsOfChunk.set(chunk, new Set()).get(chunk)!).add(cell);
    }
    for (const cells of cellsOfChunk.values()) expect(cells.size).toBeLessThanOrEqual(2);
    expect(cellsOfChunk.size).toBeGreaterThanOrEqual(5); // 9 chunks on the 5 x 5 blocks, minus empty ones
    expect(world.chunks).toEqual(layout);
  });

  it('the cell lattice of the original blocks is the old one (250 x 200 m, edges on street centrelines)', () => {
    expect(layout.cellX).toBe(250);
    expect(layout.cellZ).toBe(200);
    expect(Math.abs(layout.originX % 250)).toBe(0);
    expect(Math.abs(layout.originZ % 200)).toBe(0);
  });
});

describe('ChunkCuller', () => {
  const cell = (x: number, z: number, chunk: string): THREE.Mesh => {
    const g = new THREE.BoxGeometry(200, 10, 180);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
    m.position.set(x, 5, z);
    m.updateMatrixWorld(true);
    m.userData.chunk = chunk;
    return m;
  };

  it('hides a chunk as a unit beyond its range and shows it again with hysteresis', () => {
    const a1 = cell(0, 0, '0_0'), a2 = cell(250, 0, '0_0'), b = cell(1000, 0, '2_0');
    const cc = new ChunkCuller(300);
    for (const m of [a1, a2, b]) cc.add(m);
    expect(cc.count).toBe(2);
    cc.update(0, 0);
    expect([a1.visible, a2.visible, b.visible]).toEqual([true, true, false]); // chunk 2_0 is 1000 m east, radius ~130
    cc.update(900, 0);
    expect([a1.visible, a2.visible, b.visible]).toEqual([false, false, true]);
    // chunk a: circle centre x = 125, radius 125 + |half box diagonal|; hidden beyond range + radius, back only 6 m inside it
    const limit = 300 + 125 + Math.hypot(100, 5, 90);
    cc.update(125 + limit - 3, 0); // just inside the range but not inside the 6 m hysteresis margin
    expect(a1.visible).toBe(false);
    cc.update(125 + limit - 10, 0);
    expect(a1.visible && a2.visible).toBe(true);
    cc.clear();
    expect(b.visible).toBe(true);
    expect(cc.count).toBe(0);
  });

  it('ignores meshes without a chunk key and a non-positive range', () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const cc = new ChunkCuller(100);
    cc.add(m);
    expect(cc.count).toBe(0);
    cc.setMaxDist(-5);
    expect(cc.maxDist).toBe(100);
  });

  it('tier ranges: phone fog far + 1 block, low 2 blocks beyond the prop range, medium 3', () => {
    expect([chunkRangeFor('phone'), chunkRangeFor('low'), chunkRangeFor('medium'), chunkRangeFor('high')]).toEqual([200, 420, 520, 520]);
  });
});
