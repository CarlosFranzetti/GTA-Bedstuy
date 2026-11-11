/**
 * Compact on-disk form of RoadNetData (src/world/data/roadnet-core.json). Coordinates are quantised to 0.1 m integers and
 * edge interiors are delta-coded from the previous vertex; names are interned. About 40 bytes per edge before gzip.
 *
 *   { v: 1, f: [lat0, lon0, rotDeg], x: [extent dm...], names: [...],
 *     n: [x, z, ...] (dm), c: "control char per node",
 *     e: [[a, b, name, cls, width dm, sidewalk dm, lanes, oneway, level, flags, speed, dx, dz, ...], ...],
 *     b: [[area, island, ref, ref, ...], ...] }
 */
import type { NodeControl, RoadClass, RoadNetData } from './types';

export interface RoadNetJson {
  v: 1;
  f: [number, number, number];
  x: number[];
  names: string[];
  n: number[];
  c: string;
  e: number[][];
  b: number[][];
}

const CLS: RoadClass[] = ['street', 'avenue', 'arterial', 'highway', 'ramp', 'ped'];
const CTRL: Record<NodeControl, string> = { none: 'n', signal: 's', stop: 't', stub: 'x', deadend: 'd' };
const CTRL_BACK: Record<string, NodeControl> = { n: 'none', s: 'signal', t: 'stop', x: 'stub', d: 'deadend' };
const Q = 10;
const q = (v: number): number => Math.round(v * Q);

export function encodeRoadNet(d: RoadNetData): RoadNetJson {
  const names: string[] = [];
  const nameIx = new Map<string, number>();
  const intern = (s: string): number => {
    let i = nameIx.get(s);
    if (i === undefined) { i = names.length; names.push(s); nameIx.set(s, i); }
    return i;
  };
  return {
    v: 1,
    f: [d.frame.lat0, d.frame.lon0, d.frame.rotDeg],
    x: d.extent.flatMap((p) => [q(p.x), q(p.z)]),
    names: (d.edges.forEach((e) => intern(e.name)), names),
    n: d.nodes.flatMap((nd) => [q(nd.p.x), q(nd.p.z)]),
    c: d.nodes.map((nd) => CTRL[nd.control]).join(''),
    e: d.edges.map((e) => {
      const row = [e.a, e.b, nameIx.get(e.name)!, CLS.indexOf(e.cls), q(e.width), q(e.sidewalk), e.lanes, e.oneway, e.level, e.truck ? 1 : 0, e.speed ?? 25];
      let px = q(e.pts[0].x);
      let pz = q(e.pts[0].z);
      for (let k = 1; k < e.pts.length - 1; k++) {
        const x = q(e.pts[k].x);
        const z = q(e.pts[k].z);
        row.push(x - px, z - pz);
        px = x; pz = z;
      }
      return row;
    }),
    b: d.blocks.map((b) => [b.area, b.island ? 1 : 0, ...b.edges]),
  };
}

export function decodeRoadNet(j: RoadNetJson): RoadNetData {
  if (j.v !== 1) throw new Error(`roadnet: unsupported version ${String(j.v)}`);
  const pt = (arr: number[], i: number) => ({ x: arr[2 * i] / Q, z: arr[2 * i + 1] / Q });
  const nodes = Array.from({ length: j.n.length / 2 }, (_, i) => ({ p: pt(j.n, i), control: CTRL_BACK[j.c[i]] ?? 'none' }));
  const edges = j.e.map((r) => {
    const [a, b, name, cls, width, sidewalk, lanes, oneway, level, flags, speed] = r;
    const pts = [nodes[a].p];
    let x = Math.round(nodes[a].p.x * Q);
    let z = Math.round(nodes[a].p.z * Q);
    for (let k = 11; k + 1 < r.length; k += 2) { x += r[k]; z += r[k + 1]; pts.push({ x: x / Q, z: z / Q }); }
    pts.push(nodes[b].p);
    return {
      a, b, pts, name: j.names[name], cls: CLS[cls] ?? 'street', width: width / Q, sidewalk: sidewalk / Q, lanes,
      oneway: oneway as -1 | 0 | 1, level, truck: flags === 1, speed,
    };
  });
  const blocks = j.b.map(([area, island, ...refs]) => ({ edges: refs, area, island: island === 1 }));
  return {
    version: 1,
    frame: { lat0: j.f[0], lon0: j.f[1], rotDeg: j.f[2] },
    extent: Array.from({ length: j.x.length / 2 }, (_, i) => pt(j.x, i)),
    nodes, edges, blocks,
  };
}
