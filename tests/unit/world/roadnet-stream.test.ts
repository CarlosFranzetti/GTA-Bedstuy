import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { Rng } from '@/core/Rng';
import type { IMaterialLibrary, MaterialKey, StaticCollider } from '@/world/types';
import type { Quality } from '@/render/Shadows';
import { TIER_BUDGET } from '@/render/QualityTier';
import { RoadNet } from '@/world/roadnet/RoadNet';
import { deriveGeometry } from '@/world/roadnet/derive';
import { blockFaces } from '@/world/roadnet/faces';
import { placeLotsDetailed, type RealLot } from '@/world/roadnet/lotsReal';
import { chunkLayoutFromBounds } from '@/world/roadnet/chunksReal';
import { RealBuildingStreamer, STREAM_RANGES, buildFarGeometry } from '@/world/roadnet/buildingStream';
import { chunkKeyOf } from '@/render/Culling';

class StubMaterials implements IMaterialLibrary {
  private cache = new Map<string, THREE.Material>();
  private mk(k: string): THREE.Material { let m = this.cache.get(k); if (!m) { m = new THREE.MeshBasicMaterial(); m.name = k; this.cache.set(k, m); } return m; }
  get(key: MaterialKey, variant = 0): THREE.Material { return this.mk(`${key}:${variant}`); }
  awning(color: string, text: string): THREE.Material { return this.mk(`awning:${color}:${text}`); }
  sign(text: string, bg = '', fg = ''): THREE.Material { return this.mk(`sign:${text}:${bg}:${fg}`); }
  carPaint(color: string): THREE.Material { return this.mk(`car:${color}`); }
  setNight(): void { /* noop */ }
}

const core = (await import('@/world/data/roadnet-core.json')).default as unknown as import('@/world/roadnet/codec').RoadNetJson;
const lotsJson = (await import('@/world/data/raw/lots-real-r1r2a.json')).default as unknown as { lots: unknown[] };
const net = RoadNet.fromJson(core);
const d = deriveGeometry(net);
const r1: RealLot[] = placeLotsDetailed(net, d, blockFaces(net, d), lotsJson).lots.filter((l) => l.ph === 'R1');
const layout = chunkLayoutFromBounds(net.bounds);
const mats = new StubMaterials();

class Host {
  ids = new Set<string>();
  add(cs: StaticCollider[]): void { for (const c of cs) { expect(this.ids.has(c.id!)).toBe(false); this.ids.add(c.id!); } }
  remove(ids: string[]): void { for (const i of ids) expect(this.ids.delete(i)).toBe(true); }
}

function make(tier: Quality, host?: Host, lots: ReadonlyArray<RealLot> = r1): RealBuildingStreamer {
  return new RealBuildingStreamer({ lots, materials: mats, rng: new Rng(7), layout, tier, colliders: host });
}

const triOf = (g: THREE.BufferGeometry): number => (g.index ? g.index.count / 3 : g.getAttribute('position').count / 3);
function liveGeometries(root: THREE.Object3D): number {
  const s = new Set<THREE.BufferGeometry>();
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) s.add(m.geometry); });
  return s.size;
}

/** chunk key -> lots, the densest first */
const byChunk = new Map<string, RealLot[]>();
for (const l of r1) { const k = chunkKeyOf(layout, (l.frontA.x + l.frontB.x) / 2, (l.frontA.z + l.frontB.z) / 2); (byChunk.get(k) ?? byChunk.set(k, []).get(k)!).push(l); }
const chunkList = [...byChunk.entries()].sort((a, b) => b[1].length - a[1].length);
const centreOf = (key: string): { x: number; z: number } => { const [ix, iz] = key.split('_').map(Number); return { x: layout.originX + (ix + 0.5) * layout.chunkX, z: layout.originZ + (iz + 0.5) * layout.chunkZ }; };

describe('far boxes', () => {
  it('are one merged mesh per chunk with outward normals and ten triangles per building', () => {
    const [, lots] = chunkList[0];
    const g = buildFarGeometry(lots)!;
    expect(g).toBeTruthy();
    const boxes = triOf(g) / 10;
    expect(Number.isInteger(boxes)).toBe(true);
    expect(boxes).toBeGreaterThan(lots.length * 0.8);
    const pos = g.getAttribute('position'), nrm = g.getAttribute('normal');
    let bad = 0;
    for (let t = 0; t < triOf(g); t++) {
      const a = new THREE.Vector3().fromBufferAttribute(pos, t * 3), b = new THREE.Vector3().fromBufferAttribute(pos, t * 3 + 1), c = new THREE.Vector3().fromBufferAttribute(pos, t * 3 + 2);
      const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      const stored = new THREE.Vector3().fromBufferAttribute(nrm, t * 3);
      if (n.dot(stored) < 0.99) bad++;
    }
    expect(bad).toBe(0);
  });
  it('sit inside the chunk neighbourhood of their lots', () => {
    const [key, lots] = chunkList[3];
    const g = buildFarGeometry(lots)!;
    g.computeBoundingBox();
    const c = centreOf(key);
    expect(g.boundingBox!.min.x).toBeGreaterThan(c.x - 64 - 40);
    expect(g.boundingBox!.max.x).toBeLessThan(c.x + 64 + 40);
    expect(g.boundingBox!.max.y).toBeGreaterThan(5);
  });
});

describe('streaming one chunk', () => {
  const [key, lots] = chunkList[0];
  const c = centreOf(key);

  it('builds incrementally: a zero budget does one step, never the whole chunk', () => {
    const host = new Host();
    const s = make('medium', host, lots);
    s.update(c.x, c.z, 2, 0);
    expect(s.stats().building).toBe(1);
    expect(s.stats().near).toBe(0);
    expect(host.ids.size).toBe(0);
    let calls = 1;
    while (s.stats().near === 0 && calls < 2000) { s.update(c.x, c.z, 2, 0); calls++; }
    expect(s.stats().near).toBeGreaterThanOrEqual(1);
    expect(calls).toBeGreaterThan(lots.length);
    s.dispose();
    expect(host.ids.size).toBe(0);
  }, 300000);

  it('merges a chunk into one mesh per material and gives every collider an id', () => {
    const host = new Host();
    const s = make('medium', host, lots);
    s.settle(c.x, c.z, 2);
    const group = s.root.children.find((o) => o.name === `buildings:${key}`) as THREE.Group;
    expect(group).toBeTruthy();
    const names = group.children.map((m) => `${m.name}|${((m as THREE.Mesh).material as THREE.Material).uuid}`);
    expect(new Set(names).size).toBe(names.length);
    expect(group.children.length).toBeLessThanOrEqual(40);
    expect(group.children.length).toBeGreaterThan(5);
    expect(host.ids.size).toBeGreaterThan(lots.length);
    for (const m of group.children) expect(m.userData.chunk).toBe(key);
    s.dispose();
  }, 300000);

  it('rebuilds identically after a dispose (fixed lot-by-lot slicing)', () => {
    const sum = (root: THREE.Object3D): string => {
      const parts: string[] = [];
      root.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh || m.userData.far) return; const p = m.geometry.getAttribute('position'); let x = 0, z = 0; for (let i = 0; i < p.count; i++) { x += p.getX(i); z += p.getZ(i); } parts.push(`${m.name}:${p.count}:${x.toFixed(2)}:${z.toFixed(2)}`); });
      return parts.sort().join('|');
    };
    const s = make('low', undefined, lots);
    s.settle(c.x, c.z, 2);
    const a = sum(s.root);
    s.update(c.x + 5000, c.z + 5000, 2, 0);
    expect(s.stats().near).toBe(0);
    s.settle(c.x, c.z, 2);
    expect(sum(s.root)).toBe(a);
    s.dispose();
  }, 300000);
});

describe('leaks', () => {
  it('a walk across the map and back returns geometry, colliders and chunk sets to where they were', () => {
    const host = new Host();
    const s = make('phone', host);
    const A = centreOf(chunkList[0][0]);
    // far corner of the lot set
    let B = A, best = 0;
    for (const [k] of chunkList) { const q = centreOf(k); const dd = Math.hypot(q.x - A.x, q.z - A.z); if (dd > best) { best = dd; B = q; } }
    s.settle(A.x, A.z, 2);
    const fresh = s.held();
    const snap = (): { st: ReturnType<typeof s.stats>; held: ReturnType<typeof s.held>; ids: number; live: number } => ({ st: s.stats(), held: s.held(), ids: host.ids.size, live: liveGeometries(s.root) });
    expect(s.stats().near).toBeGreaterThan(0);
    const steps = Math.ceil(best / 40);
    const at = (t: number): { x: number; z: number } => ({ x: A.x + (B.x - A.x) * t, z: A.z + (B.z - A.z) * t });
    let peakGeoms = 0;
    const trip = (): void => {
      for (let i = 1; i <= steps; i++) { const p = at(i / steps); s.settle(p.x, p.z, 2); peakGeoms = Math.max(peakGeoms, s.stats().geometries); }
      for (let i = steps - 1; i >= 0; i--) { const p = at(i / steps); s.settle(p.x, p.z, 2); peakGeoms = Math.max(peakGeoms, s.stats().geometries); }
    };
    // A chunk granted on the way keeps its level STREAM_MARGIN m past `near` (hysteresis), so coming back holds that ring on top of a fresh
    // start. The leak check is therefore the second round trip against the first: nothing may accumulate; the first only has to hold what a fresh start does.
    trip();
    const before = snap();
    for (const k of fresh.near) expect(before.held.near).toContain(k);
    expect(before.st.near).toBeGreaterThan(0);
    trip();
    const after = snap();
    expect(after.held).toEqual(before.held);
    expect(after.st.geometries).toBe(before.st.geometries);
    expect(after.st.colliders).toBe(before.st.colliders);
    expect(after.ids).toBe(before.ids);
    expect(after.live).toBe(before.live);
    expect(after.st.geometries).toBe(after.live);
    expect(s.stats().disposedChunks).toBeGreaterThan(5);
    expect(peakGeoms).toBeLessThan(before.st.geometries * 6);
    s.dispose();
    expect(host.ids.size).toBe(0);
    expect(s.stats().geometries).toBe(0);
    expect(s.root.children.length).toBe(0);
  }, 900000);
});

// ---------------------------------------------------------------- numbers (run with STREAM_NUMBERS=<output path>)

const out = process.env.STREAM_NUMBERS;

function route(kind: 'broadway' | 'street'): { name: string; pts: Array<{ x: number; z: number }> } {
  const inR1 = (e: number): boolean => { const p = net.pointAt(e, net.lengths[e] / 2).p; return r1.some((l) => Math.hypot(l.frontA.x - p.x, l.frontA.z - p.z) < 40); };
  const byName = new Map<string, number[]>();
  net.edges.forEach((E, e) => { if (E.level === 0 && inR1(e) && (kind === 'broadway' ? E.name === 'Broadway' : E.cls === 'street')) (byName.get(E.name) ?? byName.set(E.name, []).get(E.name)!).push(e); });
  let name = '', edges: number[] = [], len = 0;
  for (const [n, l] of byName) { const t = l.reduce((a, e) => a + net.lengths[e], 0); if (t > len) { len = t; name = n; edges = l; } }
  // order by projection on the principal direction of the street
  const mids = edges.map((e) => net.pointAt(e, net.lengths[e] / 2).p);
  const a = mids.reduce((m, p) => (p.x + p.z < m.x + m.z ? p : m)), b = mids.reduce((m, p) => (p.x + p.z > m.x + m.z ? p : m));
  const dir = { x: b.x - a.x, z: b.z - a.z }; const dl = Math.hypot(dir.x, dir.z) || 1;
  const order = edges.map((e, i) => ({ e, t: ((mids[i].x - a.x) * dir.x + (mids[i].z - a.z) * dir.z) / dl })).sort((p, q) => p.t - q.t).map((o) => o.e);
  const pts: Array<{ x: number; z: number }> = [];
  for (const e of order) {
    const L = net.lengths[e];
    const p0 = net.pointAt(e, 0).p, p1 = net.pointAt(e, L).p;
    const last = pts[pts.length - 1];
    const rev = last ? Math.hypot(p1.x - last.x, p1.z - last.z) < Math.hypot(p0.x - last.x, p0.z - last.z) : false;
    for (let t = 0; t <= L; t += 30) pts.push(net.pointAt(e, rev ? L - t : t).p);
  }
  return { name, pts };
}

describe.skipIf(!out)('walk numbers', () => {
  it('triangles and draws in view along Broadway and a residential street, per tier', () => {
    const rows: string[] = [];
    for (const kind of ['broadway', 'street'] as const) {
      const rt = route(kind);
      const pts = rt.pts.slice(0, 22);
      for (const tier of ['phone', 'low', 'medium', 'high'] as const) {
        const s = make(tier);
        const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, STREAM_RANGES[tier].far);
        const frustum = new THREE.Frustum(), mtx = new THREE.Matrix4();
        let maxTri = 0, maxDraw = 0, sumTri = 0, sumDraw = 0, farTri = 0, n = 0, maxNearTri = 0, maxHeld = 0;
        for (let i = 0; i < pts.length - 1; i++) {
          const p = pts[i], q = pts[i + 1];
          s.settle(p.x, p.z, 5);
          cam.position.set(p.x, 5, p.z);
          cam.lookAt(q.x, 5, q.z);
          cam.updateMatrixWorld(true);
          mtx.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
          frustum.setFromProjectionMatrix(mtx);
          s.root.updateMatrixWorld(true);
          let tri = 0, draw = 0, ftri = 0;
          s.root.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            let vis = true;
            for (let a: THREE.Object3D | null = m; a; a = a.parent) if (!a.visible) { vis = false; break; }
            if (!vis || !frustum.intersectsObject(m)) return;
            const t = triOf(m.geometry);
            tri += t; draw++;
            if (m.userData.far) ftri += t;
          });
          maxTri = Math.max(maxTri, tri); maxDraw = Math.max(maxDraw, draw); sumTri += tri; sumDraw += draw; farTri += ftri; n++;
          maxNearTri = Math.max(maxNearTri, tri - ftri);
          maxHeld = Math.max(maxHeld, s.stats().triangles);
        }
        rows.push(JSON.stringify({ route: rt.name, kind, tier, samples: n, ranges: s.ranges, maxTri, meanTri: Math.round(sumTri / n), maxDraw, meanDraw: Math.round(sumDraw / n), meanFarTri: Math.round(farTri / n), maxNearTri, heldTrisPeak: maxHeld, budget: TIER_BUDGET[tier], builtChunks: s.stats().builtChunks, nearHeld: s.stats().near, farHeld: s.stats().far }));
        s.dispose();
      }
    }
    writeFileSync(out!, rows.join('\n'));
    expect(rows.length).toBe(8);
  }, 3_000_000);
});
