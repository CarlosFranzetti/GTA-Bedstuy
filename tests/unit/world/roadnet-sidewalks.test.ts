import { describe, expect, it } from 'vitest';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { RoadNet, roadNetFromGrid } from '@/world/roadnet/RoadNet';
import type { RoadNetJson } from '@/world/roadnet/codec';
import { deriveGeometry } from '@/world/roadnet/derive';
import { buildPedCrossingsReal, buildSidewalkGraph, type SidewalkNet } from '@/world/roadnet/sidewalks';
import { CROSSWALK_START, CROSSWALK_WIDTH, STOP_LINE } from '@/world/roadnet/contract';

function components(sw: SidewalkNet): number[] {
  const ids = Object.keys(sw.graph.nodes);
  const par = new Map(ids.map((i) => [i, i]));
  const find = (x: string): string => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x)!)!); x = par.get(x)!; } return x; };
  for (const e of sw.graph.edges) par.set(find(e.from), find(e.to));
  const size = new Map<string, number>();
  for (const i of ids) size.set(find(i), (size.get(find(i)) ?? 0) + 1);
  return [...size.values()].sort((a, b) => b - a);
}

describe('contract constants', () => {
  it('match the shared junction contract', () => {
    expect([CROSSWALK_START, CROSSWALK_WIDTH, STOP_LINE]).toEqual([0.5, 3, 4.5]);
  });
});

describe('sidewalk graph on the grid adapter', () => {
  const grid = buildGrid(loadBedstuyData());
  const net = roadNetFromGrid(grid);
  // the grid has square corners: derive without curb returns so ring corners are comparable
  const d = deriveGeometry(net, { rStreet: 0, rAvenue: 0 });
  const sw = buildSidewalkGraph(net, d);
  it('ring node count within 20 % of the grid graph (the grid rounds face/25, we cap edges at 25 m so ceil; crosswalk ends not counted)', () => {
    const a = Object.keys(sw.graph.nodes).length - sw.crosswalkNodes.size;
    const b = Object.keys(grid.sidewalks.nodes).length;
    console.log(`grid sidewalks: ${a} ring nodes vs ${b}, crosswalks ${sw.crosswalks.length} vs ${grid.crosswalks.length}, skipped ${sw.skipped}`);
    expect(Math.abs(a - b) / b).toBeLessThan(0.2);
  });

  it('crosswalk count matches grid.crosswalks (legs at controlled nodes)', () => {
    const expected = d.legs.filter((l) => net.nodes[l.node].control !== 'none').length;
    expect(sw.crosswalks.length + sw.skipped).toBe(expected);
    // grid.crosswalks has one per segment end; ends whose far side has no block (map edge) cannot be linked and are `skipped`
    expect(sw.crosswalks.length + sw.skipped).toBe(grid.crosswalks.length);
  });

  it('crossing map pairs every crosswalk and spawn nodes exist on the graph', () => {
    const m = buildPedCrossingsReal(sw, net);
    expect(m.size).toBe(sw.crosswalks.length * 2);
    const nodes = Object.values(sw.graph.nodes);
    expect(nodes.length).toBeGreaterThan(100);
    // a spawn node is any node with outgoing edges that is not a crosswalk end
    const spawn = nodes.filter((n) => !sw.crosswalkNodes.has(n.id) && sw.graph.adjacency[n.id].length > 0);
    expect(spawn.length).toBeGreaterThan(nodes.length / 2);
    expect(components(sw)[0] / nodes.length).toBeGreaterThan(0.95);
  });
});

describe('sidewalk graph on the real core', async () => {
  const core = (await import('@/world/data/roadnet-core.json')).default as unknown as RoadNetJson;
  const net = RoadNet.fromJson(core);
  const d = deriveGeometry(net);
  const sw = buildSidewalkGraph(net, d);
  const ids = Object.keys(sw.graph.nodes);

  it('every non-island block with a kerb ring has a walking ring', () => {
    const has = new Set(Object.values(sw.blockOf).filter((b) => b >= 0));
    let want = 0;
    net.blocks.forEach((b, i) => {
      if (b.island || d.curbRings[i].length < 3) return;
      want++;
      expect(has.has(i), `block ${i}`).toBe(true);
    });
    console.log(`real: ${want} walking rings, ${ids.length} nodes, ${sw.graph.edges.length} edges, ${sw.crosswalks.length} crosswalks, skipped ${sw.skipped}`);
    expect(want).toBeGreaterThan(50);
  });

  it('is connected: > 95 % of nodes in the largest component', () => {
    const c = components(sw);
    console.log(`real components: ${c.length}, largest ${c[0]} of ${ids.length}, next ${c.slice(1, 6).join(',')}`);
    expect(c[0] / ids.length).toBeGreaterThan(0.95);
  });

  it('edge lengths are sane', () => {
    const max = Math.max(...sw.graph.edges.map((e) => e.length));
    expect(max).toBeLessThanOrEqual(25 + 1e-6);
    expect(sw.graph.edges.every((e) => e.length > 0)).toBe(true);
  });

  it('crosswalks lie on the road, their ends do not, and none crosses a ribbonless edge', () => {
    expect(sw.crosswalks.length).toBeGreaterThan(50);
    let endsOnRoad = 0;
    for (const cw of sw.crosswalks) {
      const mid = { x: (cw.a.x + cw.b.x) / 2, z: (cw.a.z + cw.b.z) / 2 };
      expect(net.isOnRoad(mid), `crosswalk n${cw.node} e${cw.edge}`).toBe(true);
      if (net.isOnRoad(cw.a) || net.isOnRoad(cw.b)) endsOnRoad++;
      expect(d.cuts[cw.edge].cutA + d.cuts[cw.edge].cutB).toBeLessThan(net.lengths[cw.edge]);
    }
    expect(endsOnRoad).toBeLessThanOrEqual(Math.ceil(sw.crosswalks.length * 0.02));
  });

  it('no crosswalks at stubs or dead ends; every crossing node is a signal/stop cluster member', () => {
    const cl = new Set<number>();
    for (const cw of sw.crosswalks) {
      expect(['stub', 'deadend']).not.toContain(net.nodes[cw.node].control);
      cl.add(cw.node);
    }
    // each crossed leg's own node, or the node at the other end of a ribbonless link, is signal or stop
    for (const v of cl) {
      const near = [v, ...net.incident[v].map((e) => net.otherEnd(e, v))];
      expect(near.some((u) => net.nodes[u].control === 'signal' || net.nodes[u].control === 'stop')).toBe(true);
    }
  });

  it('crossings map carries the crossed street id', () => {
    const m = buildPedCrossingsReal(sw, net);
    expect(m.size).toBe(sw.crosswalks.length * 2);
    for (const [k, v] of m) {
      const [a, b] = k.split('>');
      expect(sw.graph.nodes[a]).toBeDefined();
      expect(sw.graph.nodes[b]).toBeDefined();
      expect(v.crossedStreetId.length).toBeGreaterThan(0);
    }
  });
});
