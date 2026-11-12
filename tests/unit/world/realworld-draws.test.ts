/**
 * REAL MAP, GAME PATH, no GPU: builds the real world (stub materials), then does what the game does each frame (streamer around
 * the player, ChunkCuller on the chunk meshes, InstanceCuller on the furniture) and counts what three.js would draw in the
 * COLOUR pass at the three review frames: meshes that are visible, in the camera frustum and non-empty. This is an estimate of
 * `renderer.info` (no shadow pass, no post, stub materials): scripts/perf-real.mjs is the render-side number. It exists so the
 * merge / culling logic cannot regress without a browser.
 *
 * Set PERF3_LOG=<file> to append the table to a file (vitest swallows console output).
 */
import { describe, it, expect } from 'vitest';
import { appendFileSync } from 'node:fs';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import type { IMaterialLibrary } from '@/world/types';
import { buildRealWorld, type RealWorld } from '@/world/roadnet/realWorld';
import { reviewFrames } from '@/world/roadnet/reviewFrames';
import { ChunkCuller, InstanceCuller, chunkRangeFor } from '@/render/Culling';
import { setCarPaintTier } from '@/render/CarPaintFx';
import { tierConfig } from '@/render/QualityTier';
import type { Quality } from '@/render/Shadows';

function stubLib(): IMaterialLibrary {
  const cache = new Map<string, THREE.Material>();
  const mk = (): THREE.Material => new THREE.MeshBasicMaterial();
  return {
    get(key, variant = 0) { const k = `${key}:${variant}`; let m = cache.get(k); if (!m) { m = mk(); m.name = k; cache.set(k, m); } return m; },
    awning: mk, sign: mk, carPaint: mk, setNight: () => undefined,
  } as IMaterialLibrary;
}

export interface Drawn { draws: number; triangles: number; byKind: Record<string, number> }

/** What the colour pass would draw from `cam`: visible chain, in frustum, non-empty. */
export function countDrawn(root: THREE.Object3D, cam: THREE.PerspectiveCamera): Drawn {
  cam.updateMatrixWorld(true);
  const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const out: Drawn = { draws: 0, triangles: 0, byKind: {} };
  const sph = new THREE.Sphere();
  const walk = (o: THREE.Object3D): void => {
    if (!o.visible) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh) : null;
      const g = m.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      let ok = !inst || inst.count > 0;
      if (ok && m.frustumCulled) {
        if (inst) { inst.boundingSphere = null; inst.computeBoundingSphere(); sph.copy(inst.boundingSphere!); } else sph.copy(g.boundingSphere!);
        ok = fr.intersectsSphere(sph.applyMatrix4(m.matrixWorld));
      }
      if (ok) {
        const n = (g.index ? g.index.count : g.getAttribute('position').count) / 3 * (inst ? inst.count : 1);
        out.draws++; out.triangles += n;
        const kind = m.name.split(':').slice(0, 2).join(':').replace(/:[A-Za-z0-9 .'-]*$/, (s) => (/^(props|furniture|buildings)/.test(m.name) ? s : ''));
        out.byKind[kind] = (out.byKind[kind] ?? 0) + 1;
      }
    }
    for (const c of o.children) walk(c);
  };
  root.updateMatrixWorld(true);
  walk(root);
  return out;
}

/** The game's per-frame culling for a real world, at one camera pose. */
export function frame(rw: RealWorld, tier: Quality, cullers: { chunk: ChunkCuller; inst: InstanceCuller }, f: { pos: number[]; look: number[] }): Drawn {
  const cam = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 1500);
  cam.position.set(f.pos[0], f.pos[1], f.pos[2]); cam.lookAt(f.look[0], f.look[1], f.look[2]);
  rw.streamer!.settle(f.pos[0], f.pos[2], f.pos[1]);
  cullers.chunk.update(f.pos[0], f.pos[2], f.pos[1]);
  cullers.inst.update(f.pos[0], f.pos[2]);
  rw.streamer!.update(f.pos[0], f.pos[2], f.pos[1]);
  void tier;
  return countDrawn(rw.group, cam);
}

const LOG = !!process.env.PERF3_LOG;
// frame-by-frame numbers: [tier] -> view -> {draws, triangles}
const results: Record<string, Record<string, Drawn>> = {};

describe.each(['phone', 'low', 'medium'] as Quality[])('real map, game-path culling, tier %s', (tier) => {
  it('draws a bounded number of meshes at the review frames', async () => {
    setCarPaintTier(tier);
    const rw = await buildRealWorld({ materials: stubLib(), rng: new Rng(7), tier, warmMs: 0 });
    const chunk = new ChunkCuller(chunkRangeFor(tier));
    ChunkCuller.buildsPerUpdate = 1e9;
    for (const m of rw.chunkMeshes) chunk.add(m);
    const inst = new InstanceCuller();
    for (const o of rw.furnitureGroup.children) if ((o as THREE.InstancedMesh).isInstancedMesh) inst.add(o as THREE.InstancedMesh);
    inst.setRange(tierConfig(tier).instanceDistance);
    const frames = reviewFrames(rw);
    expect(frames.length).toBe(3);
    results[tier] = {};
    for (const f of frames) {
      const r = frame(rw, tier, { chunk, inst }, f);
      results[tier][f.name] = r;
      if (LOG) appendFileSync(process.env.PERF3_LOG!, `${tier} ${f.name} draws ${r.draws} tris ${Math.round(r.triangles / 1000)}k ${JSON.stringify(r.byKind)}\n`);
    }
    // budget: the colour pass alone must stay under the tier's whole-frame draw budget minus what shadows and post add (estimate)
    for (const [name, r] of Object.entries(results[tier])) {
      const cap = tier === 'phone' ? 120 : tier === 'low' ? 200 : 320;
      if (!process.env.PERF3_LOG) expect(r.draws, `${tier} ${name}`).toBeLessThanOrEqual(cap);
    }
  }, 900000);
});
