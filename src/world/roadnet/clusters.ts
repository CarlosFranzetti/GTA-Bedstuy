/**
 * WP2: junction clusters (docs/swarm/plans/briefs/_realmap-rules.md section 6). Pure and deterministic, no THREE.
 *
 * An edge whose two end cuts overlap (`cuts[e].cutA + cuts[e].cutB >= length`, e.g. the 10 m Myrtle link, the 4 m Wyckoff
 * link) has no ribbon: its two nodes are one junction. Everyone (paved polygon, signal controller, crosswalks, lane
 * connectors) treats such nodes as ONE cluster. Every other node is a singleton cluster.
 */
import type { Derived } from './derive';
import type { RoadNet } from './RoadNet';

/** true when edge e has no plain ribbon (its two nodes are joined into one cluster) */
export function isRibbonless(net: RoadNet, d: Derived, e: number): boolean {
  const c = d.cuts[e];
  return c.cutA + c.cutB >= net.lengths[e];
}

/**
 * Nodes joined by ribbonless edges. Every node appears in exactly one cluster; clusters are sorted by their smallest node
 * and the nodes inside a cluster ascend, so the result is stable.
 */
export function junctionClusters(net: RoadNet, d: Derived): number[][] {
  const parent = net.nodes.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  for (let e = 0; e < net.edges.length; e++) {
    const ed = net.edges[e];
    if (ed.a === ed.b || !isRibbonless(net, d, e)) continue;
    const ra = find(ed.a);
    const rb = find(ed.b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
  const byRoot = new Map<number, number[]>();
  for (let v = 0; v < net.nodes.length; v++) {
    const r = find(v);
    const l = byRoot.get(r);
    if (l) l.push(v); else byRoot.set(r, [v]);
  }
  return Array.from(byRoot.values()).sort((p, q) => p[0] - q[0]);
}

/** stable id of a cluster: `n{smallest node}` (what LaneNode.intersectionId and RealTrafficLights use) */
export function clusterId(cluster: readonly number[]): string {
  return `n${Math.min(...cluster)}`;
}

/** node index -> index of its cluster in the array returned by junctionClusters */
export function clusterIndexOfNode(net: RoadNet, clusters: readonly number[][]): Int32Array {
  const out = new Int32Array(net.nodes.length).fill(-1);
  clusters.forEach((c, i) => { for (const v of c) out[v] = i; });
  return out;
}

/**
 * The legs through which traffic enters or leaves a cluster: legs of its nodes whose edge has a ribbon, is not a
 * pedestrian way and is not a self-loop. Sorted by leg id.
 */
export function outerLegs(net: RoadNet, d: Derived, cluster: readonly number[]): number[] {
  const out: number[] = [];
  for (const v of cluster) {
    for (const id of d.legsAt[v]) {
      const e = d.legs[id].edge;
      const ed = net.edges[e];
      if (ed.cls === 'ped' || ed.a === ed.b || isRibbonless(net, d, e)) continue;
      out.push(id);
    }
  }
  return out.sort((a, b) => a - b);
}
