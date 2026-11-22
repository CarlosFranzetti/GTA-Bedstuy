/** REALFIX4: the streamed ring furniture of a tile is merged per kind and 256 m block, so a tile costs a handful of draws. */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { mergeInstancedPerBlock } from '@/world/roadnet/propsStream';
import type { RealProps } from '@/world/roadnet/propsReal';

const geo = new THREE.BoxGeometry(1, 1, 1);
const matA = new THREE.MeshBasicMaterial();
const matB = new THREE.MeshBasicMaterial();

function inst(g: THREE.BufferGeometry, m: THREE.Material, x: number, z: number, n: number): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(g, m, n);
  for (let i = 0; i < n; i++) im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x + i, 0, z));
  im.computeBoundingSphere();
  im.userData.chunk = `${Math.floor(x / 128)}_${Math.floor(z / 128)}`;
  return im;
}

function props(meshes: THREE.Mesh[]): RealProps {
  const group = new THREE.Group();
  for (const m of meshes) group.add(m);
  return { group, colliders: [], lamps: [], chunkMeshes: meshes, byChunk: new Map(), lampsByChunk: new Map(), stats: { meshes: meshes.length } as RealProps['stats'] };
}

describe('mergeInstancedPerBlock', () => {
  it('merges same geometry and material within a 256 m block, keeps the others, keeps every instance', () => {
    // 16 chunks of a 512 m tile, one mesh of kind A each (3 instances), and one of kind B
    const ms: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) ms.push(inst(geo, matA, i * 128 + 10, j * 128 + 10, 3));
    ms.push(inst(geo, matB, 10, 10, 2));
    const p = props(ms);
    const out = mergeInstancedPerBlock(p);
    expect(out.length).toBe(4 + 1); // 4 blocks of kind A, 1 of kind B
    expect((out as THREE.InstancedMesh[]).reduce((s, m) => s + m.count, 0)).toBe(16 * 3 + 2);
    expect(p.group.children.length).toBe(out.length);
    // positions survive: every merged instance translation is one of the originals
    const xs = new Set<number>();
    for (const m of out as THREE.InstancedMesh[]) for (let i = 0; i < m.count; i++) { const mat = new THREE.Matrix4(); m.getMatrixAt(i, mat); xs.add(Math.round(mat.elements[12])); }
    expect(xs.has(10) && xs.has(3 * 128 + 12)).toBe(true);
  });

  it('leaves signal lamp meshes (recoloured by instance index) and non-instanced meshes alone', () => {
    const lamps = inst(geo, matA, 10, 10, 4);
    lamps.userData.realSignals = { lamps, rigs: [] };
    const lamps2 = inst(geo, matA, 20, 10, 4);
    lamps2.userData.realSignals = { lamps: lamps2, rigs: [] };
    const plain = new THREE.Mesh(geo, matA);
    const out = mergeInstancedPerBlock(props([lamps, lamps2, plain]));
    expect(out.length).toBe(3);
    expect(out).toContain(lamps);
    expect(out).toContain(lamps2);
    expect(out).toContain(plain);
  });
});
