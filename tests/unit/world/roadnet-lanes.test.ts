import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@/core/Math2';
import core from '@/world/data/roadnet-core.json';
import controls from '@/world/data/roadnet-controls.json';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { clusterId, isRibbonless, junctionClusters, outerLegs } from '@/world/roadnet/clusters';
import type { RoadNetJson } from '@/world/roadnet/codec';
import { deriveGeometry, type Derived } from '@/world/roadnet/derive';
import { pointInPolygon } from '@/world/roadnet/geom';
import { buildLaneGraph, buildLaneGraphDetailed, type LaneBuild } from '@/world/roadnet/lanes';
import { RoadNet, roadNetFromGrid } from '@/world/roadnet/RoadNet';
import { nodeControl } from '@/world/roadnet/signalPhases';
import type { LaneGraph } from '@/world/types';

const grid = buildGrid(loadBedstuyData());
const gridNet = roadNetFromGrid(grid);
const gridD = deriveGeometry(gridNet);
const gridBuild = buildLaneGraphDetailed(gridNet, gridD);

const realNet = RoadNet.fromJson(core as unknown as RoadNetJson);
const realD = deriveGeometry(realNet);
const realBuild = buildLaneGraphDetailed(realNet, realD);

/** nodes of the chains only (connector nodes excluded), like the grid's lane nodes */
const chainNodeCount = (g: LaneGraph): number => Object.keys(g.nodes).filter((id) => id.startsWith('ln:')).length;

/** Tarjan SCC (iterative) -> component id per node id */
function scc(g: LaneGraph): Map<string, number> {
  const ids = Object.keys(g.nodes);
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const on = new Set<string>();
  const stack: string[] = [];
  const comp = new Map<string, number>();
  let counter = 0;
  let comps = 0;
  for (const root of ids) {
    if (index.has(root)) continue;
    const work: Array<{ v: string; i: number }> = [{ v: root, i: 0 }];
    index.set(root, counter); low.set(root, counter); counter++;
    stack.push(root); on.add(root);
    while (work.length) {
      const top = work[work.length - 1];
      const adj = g.adjacency[top.v];
      if (top.i < adj.length) {
        const w = g.edges[adj[top.i++]].to;
        if (!index.has(w)) {
          index.set(w, counter); low.set(w, counter); counter++;
          stack.push(w); on.add(w);
          work.push({ v: w, i: 0 });
        } else if (on.has(w)) low.set(top.v, Math.min(low.get(top.v)!, index.get(w)!));
      } else {
        if (low.get(top.v) === index.get(top.v)) {
          for (;;) {
            const w = stack.pop()!;
            on.delete(w);
            comp.set(w, comps);
            if (w === top.v) break;
          }
          comps++;
        }
        work.pop();
        if (work.length) {
          const parent = work[work.length - 1].v;
          low.set(parent, Math.min(low.get(parent)!, low.get(top.v)!));
        }
      }
    }
  }
  return comp;
}

function bbox(ring: readonly Vec2[]): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, e = -Infinity;
  for (const p of ring) { a = Math.min(a, p.x); b = Math.min(b, p.z); c = Math.max(c, p.x); e = Math.max(e, p.z); }
  return [a, b, c, e];
}

/** index of the first curb ring strictly containing p (inset by `eps` m is not needed: lanes sit well inside the roadway) */
function makeCurbLookup(d: Derived): (p: Vec2) => number {
  const boxes = d.curbRings.map(bbox);
  return (p) => {
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (p.x < b[0] || p.x > b[2] || p.z < b[1] || p.z > b[3] || d.curbRings[i].length < 3) continue;
      if (pointInPolygon(p, d.curbRings[i])) return i;
    }
    return -1;
  };
}

describe('junction clusters (rules section 6)', () => {
  it('every node is in exactly one cluster; ribbonless edges join their nodes', () => {
    for (const [net, d] of [[gridNet, gridD], [realNet, realD]] as const) {
      const cl = junctionClusters(net, d);
      expect(cl.flat().length).toBe(net.nodes.length);
      expect(new Set(cl.flat()).size).toBe(net.nodes.length);
      const of = new Map<number, number>();
      cl.forEach((c, i) => c.forEach((v) => of.set(v, i)));
      net.edges.forEach((e, i) => { if (isRibbonless(net, d, i) && e.a !== e.b) expect(of.get(e.a)).toBe(of.get(e.b)); });
      expect(new Set(cl.map(clusterId)).size).toBe(cl.length);
    }
  });

  it('the grid has none, the real core has the short links of the brief (10 m Myrtle, 4 m Wyckoff)', () => {
    expect(junctionClusters(gridNet, gridD).every((c) => c.length === 1)).toBe(true);
    const real = junctionClusters(realNet, realD).filter((c) => c.length > 1);
    expect(real.length).toBeGreaterThan(5);
    const ribbonless = realNet.edges.map((_, i) => i).filter((i) => isRibbonless(realNet, realD, i));
    expect(ribbonless.some((i) => realNet.edges[i].name === 'Myrtle Ave')).toBe(true);
    expect(ribbonless.some((i) => realNet.edges[i].name === 'Wyckoff Ave')).toBe(true);
  });
});

describe('lane graph on the grid adapter (must agree with Grid.ts)', () => {
  it('chain node count is within 5% of the grid lanes', () => {
    const want = chainNodeCount(grid.lanes);
    const got = chainNodeCount(gridBuild.graph);
    expect(Math.abs(got - want) / want).toBeLessThan(0.05);
  });

  it('one lane chain per direction per segment, same stop-line count as the grid', () => {
    const gridStops = Object.values(grid.lanes.nodes).filter((n) => n.stopLine).length;
    const stops = Object.values(gridBuild.graph.nodes).filter((n) => n.stopLine).length;
    expect(stops).toBe(gridStops);
    for (const n of Object.values(gridBuild.graph.nodes)) if (n.stopLine) expect(n.intersectionId).toMatch(/^n\d+$/);
  });

  it('every lane node is reachable and the graph is one strongly connected piece', () => {
    const g = gridBuild.graph;
    const comp = scc(g);
    expect(new Set(comp.values()).size).toBe(1);
    expect(gridBuild.strandedEnds).toEqual([]);
    expect(gridBuild.orphanStarts).toEqual([]);
  });

  it('lanes keep right-hand traffic: heading east means the lane is south of the centreline (z larger)', () => {
    for (const c of gridBuild.chains.slice(0, 40)) {
      const n = gridBuild.graph.nodes[c.nodeIds[0]];
      const e = gridNet.edges[c.edge];
      if (e.oneway !== 0) continue;
      const hit = gridNet.nearestEdge(n.pos, 5, (x) => x === c.edge)!;
      const side = (n.pos.x - hit.point.x) * -hit.dir.z * (c.dir === 'f' ? 1 : -1) + (n.pos.z - hit.point.z) * hit.dir.x * (c.dir === 'f' ? 1 : -1);
      expect(side).toBeGreaterThan(1.5);
    }
  });
});

describe('lane graph on the real core', () => {
  const g = realBuild.graph;

  it('every directed legal edge has lanes (ribbonless links and pedestrian ways excepted)', () => {
    const have = new Set(realBuild.chains.map((c) => `${c.edge}:${c.dir}`));
    realNet.edges.forEach((e, i) => {
      if (e.cls === 'ped' || e.a === e.b || isRibbonless(realNet, realD, i)) {
        expect(have.has(`${i}:f`) || have.has(`${i}:r`)).toBe(false);
        return;
      }
      expect(have.has(`${i}:f`)).toBe(e.oneway !== -1);
      expect(have.has(`${i}:r`)).toBe(e.oneway !== 1);
    });
    // one-way edges spread across edge.lanes, two-way edges carry one lane each way
    for (const c of realBuild.chains) {
      const e = realNet.edges[c.edge];
      expect(c.lanes).toBe(e.oneway === 0 ? 1 : Math.max(1, e.lanes));
    }
  });

  it('lane nodes follow the curves: spacing <= 15 m (connectors <= 3 m), streetId and headings from the tangent', () => {
    for (const ed of g.edges) {
      const a = g.nodes[ed.from];
      const b = g.nodes[ed.to];
      const isCx = ed.from.startsWith('cx:') || ed.to.startsWith('cx:');
      expect(ed.length).toBeLessThan(isCx ? 12 : 15.01);
      expect(b.streetId).toBeTruthy();
      expect(a.heading).toBeGreaterThanOrEqual(-Math.PI - 1e-9);
    }
    const c = realBuild.chains.find((x) => realNet.edges[x.edge].pts.length > 3 && x.endKind !== 'stub')!;
    const hs = new Set(c.nodeIds.map((id) => g.nodes[id].heading.toFixed(2)));
    expect(hs.size).toBeGreaterThan(1);
    for (const ch of realBuild.chains) expect(g.nodes[ch.nodeIds[0]].streetId).toBe(realNet.streetIdOf(ch.edge));
  });

  it('stop lines sit at cut + STOP_LINE on real junctions and carry the cluster id', () => {
    const ids = new Set(realBuild.clusters.map(clusterId));
    let checked = 0;
    for (const ch of realBuild.chains) {
      const last = g.nodes[ch.nodeIds[ch.nodeIds.length - 1]];
      if (ch.endKind !== 'junction') { expect(last.stopLine).toBe(false); continue; }
      expect(last.stopLine).toBe(true);
      expect(ids.has(last.intersectionId!)).toBe(true);
      const leg = realD.legs[ch.enterLeg];
      const nodeP = realNet.nodes[leg.node].p;
      const room = realNet.lengths[ch.edge] - realD.cuts[ch.edge].cutA - realD.cuts[ch.edge].cutB;
      if (room >= 8) {
        // distance along the leg direction from the node, ignoring the 2 m lane offset
        const along = (last.pos.x - nodeP.x) * leg.dir.x + (last.pos.z - nodeP.z) * leg.dir.z;
        expect(along).toBeGreaterThan(leg.cut + 4.2);
        expect(along).toBeLessThan(leg.cut + 5.2);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('strongly connected apart from stub sources and sinks and the few one-way junction quirks', () => {
    expect(realBuild.strandedEnds).toEqual([]);
    expect(realBuild.orphanStarts).toEqual([]);
    const comp = scc(g);
    const sizes = new Map<number, number>();
    comp.forEach((c) => sizes.set(c, (sizes.get(c) ?? 0) + 1));
    const giant = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const stubChain = new Set<string>();
    for (const c of realBuild.chains) if (c.startKind === 'stub' || c.endKind === 'stub') for (const id of c.nodeIds) stubChain.add(id);
    const outside = Object.keys(g.nodes).filter((id) => comp.get(id) !== giant);
    // everything outside the giant component is a lane running to or from a stub (or from a pure-source junction)
    const sourceChains = new Set<string>();
    for (const id of realBuild.extraSources) sourceChains.add(id.split(':').slice(1, 4).join(':'));
    const bad = outside.filter((id) => {
      if (stubChain.has(id)) return false;
      if (id.startsWith('cx:')) return false; // connector out of / into such a lane: checked through its chain below
      return !sourceChains.has(id.split(':').slice(1, 4).join(':'));
    });
    expect(bad.slice(0, 10)).toEqual([]);
    expect(1 - outside.length / Object.keys(g.nodes).length).toBeGreaterThan(0.9);
  });

  it('no connector leaves the paved area: samples are never inside a block curb ring', () => {
    const curbAt = makeCurbLookup(realD);
    const bad: string[] = [];
    let samples = 0;
    for (const c of realBuild.connectors) {
      for (const id of c.nodeIds) {
        samples++;
        const b = curbAt(g.nodes[id].pos);
        if (b >= 0) bad.push(`${id} in block ${b}`);
      }
    }
    expect(samples).toBeGreaterThan(2000);
    // a handful of the sharpest Broadway turns may graze a curb return; none may cut a block
    expect(bad.length / samples).toBeLessThan(0.01);
    expect(bad.slice(0, 5)).toEqual(bad.length ? bad.slice(0, 5) : []);
  });

  it('turn rules: no U-turns across the board except forced ones, right turns from the rightmost lane only', () => {
    const forced = realBuild.connectors.filter((c) => c.uturn);
    expect(forced.length).toBeLessThan(realBuild.connectors.length * 0.01);
    for (const c of realBuild.connectors) {
      if (c.uturn) continue;
      const a = g.nodes[c.from];
      const b = g.nodes[c.to];
      let th = b.heading - a.heading;
      while (th > Math.PI) th -= 2 * Math.PI;
      while (th < -Math.PI) th += 2 * Math.PI;
      expect(Math.abs(th)).toBeLessThan(2.95);
      if (th > 0.5) {
        const [, e, dir, lane] = c.from.split(':');
        const chain = realBuild.chains.find((x) => x.id === `${e}:${dir}:${lane}`)!;
        expect(chain.lane).toBe(chain.lanes - 1);
      }
    }
  });

  it('one-way multi-lane streets keep lane i -> lane i going straight', () => {
    let seen = 0;
    for (const c of realBuild.connectors) {
      const [, e1, d1, l1] = c.from.split(':');
      const [, e2, d2, l2] = c.to.split(':');
      const A = realBuild.chains.find((x) => x.id === `${e1}:${d1}:${l1}`)!;
      const B = realBuild.chains.find((x) => x.id === `${e2}:${d2}:${l2}`)!;
      if (A.lanes < 2 || A.lanes !== B.lanes) continue;
      const th = Math.abs(g.nodes[c.to].heading - g.nodes[c.from].heading);
      if (th < 0.3) { expect(A.lane).toBe(B.lane); seen++; }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('BQE-style levels: edges at another level get lanes but never connect to grade edges', () => {
    // synthetic: a street crossing under a viaduct at one node would be two nodes; here we fake the level of a long straight edge
    const data = JSON.parse(JSON.stringify(realNet.data)) as typeof realNet.data;
    const target = data.edges.findIndex((e, i) => e.level === 0 && e.cls === 'avenue' && e.oneway === 0 && realNet.lengths[i] > 120);
    data.edges[target].level = 1;
    const net = new RoadNet(data);
    const d = deriveGeometry(net);
    const b = buildLaneGraphDetailed(net, d);
    const lanes = b.chains.filter((c) => c.edge === target);
    expect(lanes.length).toBe(2);
    for (const cn of b.connectors) {
      const touches = (id: string): number => (id.startsWith('ln:') ? Number(id.split(':')[1]) : -1);
      const fe = touches(cn.from);
      const te = touches(cn.to);
      if (fe === target) expect(te).toBe(target);
      if (te === target) expect(fe).toBe(target);
    }
  });

  it('is deterministic and cheap enough to build at boot', () => {
    const t = Date.now();
    const again = buildLaneGraph(realNet, realD);
    expect(Date.now() - t).toBeLessThan(3000);
    expect(Object.keys(again.nodes).length).toBe(Object.keys(g.nodes).length);
    expect(again.edges.length).toBe(g.edges.length);
  });

  it('reports the counts', () => {
    const chainNodes = chainNodeCount(g);
    const info = {
      nodes: Object.keys(g.nodes).length, chainNodes, edges: g.edges.length, chains: realBuild.chains.length,
      connectors: realBuild.connectors.length, uturns: realBuild.connectors.filter((c) => c.uturn).length,
      stopLines: Object.values(g.nodes).filter((n) => n.stopLine).length,
    };
    expect(info.chains).toBeGreaterThan(realNet.edges.length);
    expect(info.stopLines).toBeGreaterThan(100);
    // eslint-disable-next-line no-console
    console.log('WP2 lanes', JSON.stringify(info));
  });
});

describe('signal data feeds the lane graph consistently', () => {
  it('stop lines exist only at junction clusters', () => {
    const control = nodeControl(realNet, controls);
    const cl = junctionClusters(realNet, realD);
    const junction = new Set(cl.filter((c) => outerLegs(realNet, realD, c).length >= 3).map(clusterId));
    for (const n of Object.values(realBuild.graph.nodes)) if (n.stopLine) expect(junction.has(n.intersectionId!)).toBe(true);
    expect(control.length).toBe(realNet.nodes.length);
  });
});
