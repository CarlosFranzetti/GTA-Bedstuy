/**
 * REALFIX: the grown real map made releasable. Short links behind a wide junction box (the agent's six-node look-ahead), the road core
 * cell, fenced lots for blocks without buildings.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import r4 from '@/world/data/roadnet-r4.json';
import type { RoadNetJson } from '@/world/roadnet/codec';
import { deriveGeometry } from '@/world/roadnet/derive';
import { R3_EXTENT } from '@/world/roadnet/extents';
import { buildFenceLots } from '@/world/roadnet/fenceLots';
import { buildLaneGraphDetailed } from '@/world/roadnet/lanes';
import { buildRoadMeshes } from '@/world/roadnet/meshRoads';
import { RoadNet } from '@/world/roadnet/RoadNet';
import { signedArea } from '@/world/roadnet/geom';
import { badBlocks } from '@/world/roadnet/realWorld';
import { proxyMaterials } from '../sim/harness';

const net = RoadNet.fromJson(r4 as unknown as RoadNetJson);
const d = deriveGeometry(net);

describe('lane connectors that feed a stop line', () => {
  const build = buildLaneGraphDetailed(net, d);
  const chainOf = new Map(build.chains.map((c) => [c.nodeIds[0], c]));
  // REALFIX4: this replaces the skipped "stop line inside the look-ahead distance" test. Distance from a connector to a stop line behind a short lane is no
  // longer what keeps a car able to stop there (127 m on skewed boxes): the line cap below does (the connector is slow enough to brake inside the link), and
  // the look-ahead distance only serves stuck detection and overtaking. What the steering now relies on is tested here instead.
  it('cap the second half of EVERY connector (straight ones too) at the exit-crosswalk speed', () => {
    const g = build.graph;
    let checked = 0;
    for (const cn of build.connectors) {
      if (cn.nodeIds.length < 4) continue;
      const half = cn.nodeIds.slice(Math.ceil((cn.nodeIds.length - 1) / 2));
      checked++;
      for (const id of half) expect(g.nodes[id].maxSpeed ?? Infinity).toBeLessThanOrEqual(6);
    }
    expect(checked).toBeGreaterThan(100);
  });
  it('build no connector that runs backwards from the heading at its start (the old two-signal Broadway links)', () => {
    const g = build.graph;
    let short = 0, back = 0;
    for (const cn of build.connectors) {
      if (cn.uturn) continue;
      const from = g.nodes[cn.from], to = g.nodes[cn.to];
      const cx = to.pos.x - from.pos.x, cz = to.pos.z - from.pos.z, cl = Math.hypot(cx, cz);
      if (cl > 0.5 && cl < 40) {
        short++;
        const dot = (cx * Math.sin(from.heading) - cz * Math.cos(from.heading)) / cl;
        if (dot < -0.1) back++;
      }
    }
    expect(short).toBeGreaterThan(100);
    expect(back).toBe(0); // measured 0 of 6,243 short links
  });
  it('cap the speed of the connector nodes next to a close stop line', () => {
    let capped = 0;
    for (const cn of build.connectors) {
      const ch = chainOf.get(cn.to);
      if (!ch || ch.nodeIds.length > 1 || !build.graph.nodes[ch.nodeIds[0]].stopLine) continue;
      const nd = build.graph.nodes[cn.nodeIds[cn.nodeIds.length - 1]];
      if (nd && nd.maxSpeed !== undefined) capped++;
    }
    expect(capped).toBeGreaterThan(20);
  });
});

describe('road core cell', () => {
  const mats = proxyMaterials();
  const withCore = buildRoadMeshes(net, d, mats, { tier: 'low', core: R3_EXTENT });
  const without = buildRoadMeshes(net, d, mats, { tier: 'low' });
  const near = (g: THREE.Object3D, x: number, z: number, r: number): number => {
    let n = 0;
    const s = new THREE.Sphere();
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      s.copy(m.geometry.boundingSphere!);
      if (Math.hypot(s.center.x - x, s.center.z - z) <= r + s.radius) n++;
    });
    return n;
  };
  const tris = (g: THREE.Object3D): number => { let t = 0; g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) t += (m.geometry.index?.count ?? 0) / 3; }); return t; };
  it('keeps every road triangle exactly once', () => {
    expect(tris(withCore)).toBe(tris(without));
  });
  it('draws fewer road meshes at the spawn than 1,024 m cells everywhere', () => {
    expect(near(withCore, 0, 0, 250)).toBeLessThan(near(without, 0, 0, 250));
    expect(near(withCore, 0, 0, 250)).toBeLessThanOrEqual(14);
  });
});

describe('fenced lots for blocks without buildings', () => {
  const bad = badBlocks(net, d);
  const fl = buildFenceLots(net, d, bad, new THREE.MeshBasicMaterial());
  it('there are bad blocks and most of them get a fence', () => {
    expect(bad.size).toBeGreaterThan(5);
    expect(fl).not.toBeNull();
    // the slivers (curb ring under 150 m2) get none; every block over 1,000 m2 does
    const big = [...bad].filter((b) => Math.abs(signedArea(d.curbRings[b])) > 1000);
    expect(big.length).toBeGreaterThanOrEqual(5);
    expect(fl!.lots).toBeGreaterThanOrEqual(big.length);
  });
  it('no fence panel stands on the roadway', () => {
    for (const c of fl!.colliders) {
      if (c.shape.kind !== 'polygon') continue;
      const pts = c.shape.points;
      const mid = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, z: pts.reduce((s, p) => s + p.z, 0) / pts.length };
      expect(net.isOnRoad(mid)).toBe(false);
    }
  });
});

describe('kerb rings that cover a roadway', () => {
  it('are rare: one bad block and three buildable ones on the R4 net (known, see REALFIX.md)', async () => {
    const { kerbCoversRoad } = await import('@/world/roadnet/realWorld');
    const bad = badBlocks(net, d);
    const all = kerbCoversRoad(net, d, net.blocks.map((_, i) => i));
    expect(all.size).toBeLessThanOrEqual(6);
    expect([...all].filter((b) => !bad.has(b)).length).toBeLessThanOrEqual(4);
    expect(kerbCoversRoad(net, d, bad).size).toBeGreaterThanOrEqual(1);
  });
});

describe('REALFIX2: compact graphs and repaired rings', () => {
  it('repairBadBlocks keeps only rings inside the kerb that cover no driven centreline, and fewer blocks stay bad', async () => {
    const { repairBadBlocks, kerbCoversRoad } = await import('@/world/roadnet/realWorld');
    const d2 = deriveGeometry(net);
    const before = badBlocks(net, d2).size;
    const done = repairBadBlocks(net, d2);
    expect(done.length).toBeGreaterThan(0);
    expect(badBlocks(net, d2).size).toBe(before - done.length);
    expect(kerbCoversRoad(net, d2, done).size).toBe(0);
  });

  it('compact traffic: the sidewalk graph is the walking graph, one adjacency table, no per-node block table', async () => {
    const { buildSidewalkGraph } = await import('@/world/roadnet/sidewalks');
    const { makeRealTraffic } = await import('@/world/roadnet/trafficReal');
    const controls = (await import('@/world/data/roadnet-controls-r4.json')).default as unknown;
    const sw = buildSidewalkGraph(net, d);
    const full = Object.keys(sw.graph.nodes).length;
    const rt = makeRealTraffic(net, d, sw, controls, 0, true);
    expect(rt.sidewalks.graph).toBe(rt.walk);
    expect(Object.keys(rt.walk.nodes).length).toBeLessThanOrEqual(full);
    expect(Object.keys(sw.blockOf).length).toBe(0);
    expect(rt.laneBuild.chains.length).toBe(0);
    expect(Object.keys(rt.lanes.nodes).length).toBeGreaterThan(1000);
  }, 60000);
});
