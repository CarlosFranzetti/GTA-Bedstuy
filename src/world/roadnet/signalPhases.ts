/**
 * WP2: which junctions are signalised and how their approaches share the green. Pure, deterministic, no THREE.
 *
 * Ruling (Imani): DATA CONFIRMS, CLASS INFERS. A node is `signal` when roadnet-controls.json matched it, or when it is a real
 * junction (3+ at-grade legs) with at least one avenue/arterial leg; every other node is an all-way `stop`. A matched node
 * is never demoted. (There is no stop-sign inventory in NYC Open Data, so `stop` is an inference by elimination.)
 *
 * Phases: the approach legs of a cluster are grouped by direction (legs within 30 deg of opposite share a group), 2 groups
 * normally, 3 for clusters of 5 or more legs (Broadway x Myrtle). Groups come back in phase order, main street first.
 */
import type { Derived } from './derive';
import { clusterId, outerLegs } from './clusters';
import type { RoadNet } from './RoadNet';
import type { RoadClass } from './types';

export type ControlTruth = 'signal' | 'stop';

const OPPOSITE_TOL = (30 * Math.PI) / 180;

const isAve = (c: RoadClass): boolean => c === 'avenue' || c === 'arterial';

/** minimum number of at-grade, non-pedestrian legs for a node to be a junction that can carry a signal by class */
const MIN_JUNCTION_LEGS = 3;

/** angle difference folded into [0, PI] */
const absDiff = (a: number, b: number): number => {
  let x = Math.abs(a - b) % (Math.PI * 2);
  if (x > Math.PI) x = Math.PI * 2 - x;
  return x;
};

/**
 * Per node: 'signal' or 'stop'. `controlsJson` is roadnet-controls.json (`{ nodes: { "<node>": { control } } }`) or anything
 * else (e.g. `{}` on the grid adapter), in which case only the class rule applies.
 */
export function nodeControl(net: RoadNet, controlsJson: unknown): ControlTruth[] {
  const nodes = (controlsJson as { nodes?: Record<string, { control?: string } | undefined> } | null | undefined)?.nodes ?? {};
  return net.nodes.map((_, v) => {
    if (nodes[String(v)]?.control === 'signal') return 'signal';
    let legs = 0;
    let ave = false;
    for (const e of net.incident[v]) {
      const ed = net.edges[e];
      if (ed.level !== 0 || ed.cls === 'ped') continue;
      legs += ed.a === ed.b ? 2 : 1;
      if (isAve(ed.cls)) ave = true;
    }
    return legs >= MIN_JUNCTION_LEGS && ave ? 'signal' : 'stop';
  });
}

/** axis angle of a leg folded to [0, PI) */
const axisOf = (angle: number): number => ((angle % Math.PI) + Math.PI) % Math.PI;

/** the at-grade approach legs of a cluster (ids into Derived.legs) */
export function approachLegs(net: RoadNet, d: Derived, cluster: readonly number[]): number[] {
  return outerLegs(net, d, cluster).filter((id) => net.edges[d.legs[id].edge].level === 0);
}

/**
 * Approach legs of a cluster per signal phase (ids into Derived.legs), in phase order: group 0 is the main street (an
 * avenue/arterial group first; between equals the one closer to the north-south axis), then the cross street(s).
 */
export function signalGroups(net: RoadNet, d: Derived, cluster: number[]): number[][] {
  const legs = approachLegs(net, d, cluster);
  if (legs.length === 0) return [];
  // union legs that oppose each other (one partner each, the closest to 180 deg)
  const parent = legs.map((_, i) => i);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const pairs: Array<[number, number, number]> = [];
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      const dev = Math.abs(absDiff(d.legs[legs[i]].angle, d.legs[legs[j]].angle) - Math.PI);
      if (dev <= OPPOSITE_TOL) pairs.push([dev, i, j]);
    }
  }
  pairs.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  const mated = new Set<number>();
  for (const [, i, j] of pairs) {
    if (mated.has(i) || mated.has(j)) continue;
    mated.add(i); mated.add(j);
    parent[find(j)] = find(i);
  }
  const buckets = new Map<number, number[]>();
  legs.forEach((id, i) => {
    const r = find(i);
    const l = buckets.get(r);
    if (l) l.push(id); else buckets.set(r, [id]);
  });
  let groups = Array.from(buckets.values());
  const axisOfGroup = (g: number[]): number => {
    // circular mean of the doubled angle (axis, not direction)
    let sx = 0, sz = 0;
    for (const id of g) { sx += Math.cos(2 * d.legs[id].angle); sz += Math.sin(2 * d.legs[id].angle); }
    return axisOf(Math.atan2(sz, sx) / 2);
  };
  const streetsOf = (g: number[]): Set<string> => new Set(g.map((id) => net.streetIdOf(d.legs[id].edge)));
  // one street never sits in two phases (a car on it is identified by street id): groups that share a street merge first
  for (let again = true; again;) {
    again = false;
    outer: for (let i = 0; i < groups.length; i++) {
      const si = streetsOf(groups[i]);
      for (let j = i + 1; j < groups.length; j++) {
        if ([...streetsOf(groups[j])].some((s) => si.has(s))) {
          groups[i] = groups[i].concat(groups[j]);
          groups.splice(j, 1);
          again = true;
          break outer;
        }
      }
    }
  }
  const target = legs.length >= 5 ? 3 : 2;
  // then merge the two groups with the closest axes until the target count is reached
  while (groups.length > target) {
    let bi = 0, bj = 1, best = Infinity;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const dev = absDiff(axisOfGroup(groups[i]) * 2, axisOfGroup(groups[j]) * 2);
        if (dev < best) { best = dev; bi = i; bj = j; }
      }
    }
    groups[bi] = groups[bi].concat(groups[bj]);
    groups.splice(bj, 1);
  }
  const rank = (g: number[]): number => (g.some((id) => isAve(net.edges[d.legs[id].edge].cls)) ? 0 : 1);
  // closeness of the group's axis to north-south (+z): 0 = vertical
  const vertical = (g: number[]): number => Math.abs(Math.cos(axisOfGroup(g)));
  groups = groups.map((g) => g.slice().sort((a, b) => a - b));
  groups.sort((p, q) => rank(p) - rank(q) || vertical(p) - vertical(q) || p[0] - q[0]);
  return groups;
}

/**
 * is this cluster a signal? (a node is 'signal', it is a real junction with 3+ approach legs, and its legs form at least two
 * phase groups to alternate; a street meeting only itself has one group and works as an all-way stop)
 */
export function clusterIsSignal(net: RoadNet, d: Derived, cluster: number[], control: readonly ControlTruth[]): boolean {
  if (!cluster.some((v) => control[v] === 'signal')) return false;
  if (approachLegs(net, d, cluster).length < MIN_JUNCTION_LEGS) return false;
  return signalGroups(net, d, cluster).length >= 2;
}

export { clusterId };
