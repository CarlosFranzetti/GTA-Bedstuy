/**
 * WP10: the el on real Broadway (J/Z) and Myrtle Ave (M): paths, stations, columns, timetable on arc length, instanced mesh.
 * Run on the real net (counts from the data) and on the grid net (no Broadway: no el, nothing breaks).
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import core from '@/world/data/roadnet-core.json';
import { RoadNet, roadNetFromGrid } from '@/world/roadnet/RoadNet';
import type { RoadNetJson } from '@/world/roadnet/codec';
import { deriveGeometry } from '@/world/roadnet/derive';
import {
  COLUMN_STEP, ELBOW_R, allColumnSpots, buildElPaths, carArcLengths, columnSpots, periodOf, pointOnPath, projectOnPath, schedulePath, sharedPrefix, trainStateReal,
} from '@/world/roadnet/elReal';
import { buildElStructureReal } from '@/world/roadnet/elStructureReal';
import { TRAIN_LENGTH, V_CRUISE } from '@/transit/ElLine';
import { buildGrid, loadBedstuyData } from '@/world/Grid';

const net = RoadNet.fromJson(core as unknown as RoadNetJson);
const derived = deriveGeometry(net);
const { paths, stations } = buildElPaths(net);
const jz = paths.find((p) => p.id === 'JZ')!;
const m = paths.find((p) => p.id === 'M')!;

const nodeNear = (a: string, b: string): { x: number; z: number } => {
  const hit = net.nodes.filter((_, i) => {
    const names = net.incident[i].map((e) => net.edges[e].name);
    return names.includes(a) && names.includes(b);
  });
  return { x: hit.reduce((s, n) => s + n.p.x, 0) / hit.length, z: hit.reduce((s, n) => s + n.p.z, 0) / hit.length };
};

describe('el paths on the real net', () => {
  it('builds a J/Z and an M path', () => {
    expect(paths.map((p) => p.id)).toEqual(['JZ', 'M']);
    expect(jz.length).toBeGreaterThan(1500);
    expect(m.length).toBeGreaterThan(jz.length * 0.8);
  });

  it('are continuous (no gap > 0.5 m between sampled points) and cum matches the polyline', () => {
    for (const p of paths) {
      let prev = pointOnPath(p, 0).p;
      for (let s = 0.25; s <= p.length; s += 0.25) {
        const q = pointOnPath(p, s).p;
        expect(Math.hypot(q.x - prev.x, q.z - prev.z)).toBeLessThanOrEqual(0.5 + 1e-6);
        prev = q;
      }
      let sum = 0;
      for (let k = 1; k < p.pts.length; k++) sum += Math.hypot(p.pts[k].x - p.pts[k - 1].x, p.pts[k].z - p.pts[k - 1].z);
      expect(sum).toBeCloseTo(p.length, 6);
    }
  });

  it('keep a bend radius of at least 55 m everywhere', () => {
    for (const p of paths) {
      let worst = Infinity;
      for (let k = 1; k < p.pts.length - 1; k++) {
        const a = p.pts[k - 1], b = p.pts[k], c = p.pts[k + 1];
        const l0 = Math.hypot(b.x - a.x, b.z - a.z), l1 = Math.hypot(c.x - b.x, c.z - b.z);
        const turn = Math.abs(Math.atan2((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x), (b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z)));
        if (turn < 1e-6) continue;
        worst = Math.min(worst, (l0 + l1) / 2 / turn);
      }
      expect(worst).toBeGreaterThanOrEqual(55);
    }
  });

  it('follow the Broadway centreline within 2 m, and M turns onto Myrtle with the 60 m curve', () => {
    for (const p of paths) {
      for (let s = 0; s <= p.length; s += 5) {
        const q = pointOnPath(p, s).p;
        const h = net.nearestEdge(q, 40, (e) => net.edges[e].name === 'Broadway' || net.edges[e].name === 'Myrtle Ave')!;
        expect(h.dist).toBeLessThan(6); // the curve cuts the Broadway x Myrtle corner by up to R(1/cos(a/2)-1) ~ 4.6 m
      }
    }
    // away from the one big bend both paths stay within 2 m of a street centreline
    const myrtle = nodeNear('Broadway', 'Myrtle Ave');
    for (const p of paths) {
      for (let s = 0; s <= p.length; s += 5) {
        const q = pointOnPath(p, s).p;
        if (Math.hypot(q.x - myrtle.x, q.z - myrtle.z) < 40) continue;
        const h = net.nearestEdge(q, 40, (e) => net.edges[e].name === 'Broadway' || net.edges[e].name === 'Myrtle Ave')!;
        expect(h.dist).toBeLessThan(2);
      }
    }
    expect(m.pts.some((q) => net.nearestEdge(q, 10, (e) => net.edges[e].name === 'Myrtle Ave' && Math.abs(q.z - myrtle.z) < 30 && q.x > myrtle.x + 100) !== null)).toBe(true);
    const mEnd = m.pts[m.pts.length - 1], jzEnd = jz.pts[jz.pts.length - 1];
    expect(mEnd.x).toBeGreaterThan(2100); // past Knickerbocker
    const gates = nodeNear('Broadway', 'Gates Ave');
    expect(Math.hypot(jzEnd.x - gates.x, jzEnd.z - gates.z)).toBeLessThan(80); // ends at the R2 stub just past Gates
    const fl = nodeNear('Broadway', 'Flushing Ave');
    expect(Math.hypot(jz.pts[0].x - fl.x, jz.pts[0].z - fl.z)).toBeLessThan(110); // starts at the R1 stub at Flushing
  });

  it('M shares the J/Z geometry up to the curve at Myrtle', () => {
    const shared = sharedPrefix(jz, m);
    const myrtle = nodeNear('Broadway', 'Myrtle Ave');
    const q = pointOnPath(jz, shared).p;
    expect(Math.hypot(q.x - myrtle.x, q.z - myrtle.z)).toBeLessThan(ELBOW_R); // curve starts a tangent length before the node
    expect(shared).toBeGreaterThan(300);
  });
});

describe('stations', () => {
  const at = (id: string, path: 'JZ' | 'M') => stations.find((s) => s.id === id && s.path === path);

  it('are the real set on each line', () => {
    expect(stations.filter((s) => s.path === 'JZ').map((s) => s.id)).toEqual(['flushing', 'myrtle', 'kosciuszko', 'gates']);
    const mm = stations.filter((s) => s.path === 'M').map((s) => s.id);
    expect(mm.slice(0, 4)).toEqual(['flushing', 'myrtle', 'central', 'knickerbocker']);
    for (const s of stations) expect(s.line === 'JMZ' || s.line === s.path || (s.line === 'JZ' && s.path === 'JZ')).toBe(true);
  });

  it('sit within 20 m of the named intersection', () => {
    const want: Array<[string, 'JZ' | 'M', string, string]> = [
      ['flushing', 'JZ', 'Broadway', 'Flushing Ave'], ['flushing', 'M', 'Broadway', 'Flushing Ave'],
      ['myrtle', 'JZ', 'Broadway', 'Myrtle Ave'], ['myrtle', 'M', 'Broadway', 'Myrtle Ave'],
      ['kosciuszko', 'JZ', 'Broadway', 'Kosciuszko St'], ['gates', 'JZ', 'Broadway', 'Gates Ave'],
      ['central', 'M', 'Myrtle Ave', 'Central Ave'], ['knickerbocker', 'M', 'Myrtle Ave', 'Knickerbocker Ave'],
    ];
    for (const [id, pid, a, b] of want) {
      const st = at(id, pid)!;
      expect(st).toBeDefined();
      const path = pid === 'JZ' ? jz : m;
      const p = pointOnPath(path, st.s).p;
      const x = nodeNear(a, b);
      expect(Math.hypot(p.x - x.x, p.z - x.z), `${id}/${pid}`).toBeLessThanOrEqual(20);
      expect(st.s - st.length / 2).toBeGreaterThanOrEqual(0);
      expect(st.s + st.length / 2).toBeLessThanOrEqual(path.length);
    }
  });

  it('are ordered along each path and the platforms do not overlap', () => {
    for (const pid of ['JZ', 'M'] as const) {
      const l = stations.filter((s) => s.path === pid);
      for (let i = 1; i < l.length; i++) expect(l[i].s - l[i - 1].s).toBeGreaterThan(l[i].length);
    }
  });
});

describe('columns', () => {
  it('stand every 18 m on both curb lines, outside the roadway, and keep out of node polygons and crosswalk bands', () => {
    for (const p of paths) {
      const spots = columnSpots(p, derived, net);
      expect(spots.length).toBeGreaterThan(1.2 * (p.length / COLUMN_STEP)); // two kerbs, less the junction gaps
      expect(spots.length).toBeLessThanOrEqual(4 * Math.ceil(p.length / COLUMN_STEP));
      for (const sp of spots) {
        const h = net.nearestEdge(sp.p, 40, (e) => net.edges[e].name === 'Broadway' || net.edges[e].name === 'Myrtle Ave')!;
        // curb line is hw from the centreline; the column centre is just outside it
        const hw = net.edges[h.edge].width / 2;
        if (net.isOnRoad(sp.p)) expect(Math.abs(h.dist - hw)).toBeLessThanOrEqual(1.2);
        else expect(h.dist).toBeGreaterThanOrEqual(hw - 1.2);
        for (const poly of derived.nodePolys) {
          if (!poly.length) continue;
          let inside = false;
          for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            if ((poly[i].z > sp.p.z) !== (poly[j].z > sp.p.z) && sp.p.x < ((poly[j].x - poly[i].x) * (sp.p.z - poly[i].z)) / (poly[j].z - poly[i].z) + poly[i].x) inside = !inside;
          }
          expect(inside).toBe(false);
        }
        for (const leg of derived.legs) {
          const n = net.nodes[leg.node].p;
          const rx = sp.p.x - n.x, rz = sp.p.z - n.z;
          const along = rx * leg.dir.x + rz * leg.dir.z, lat = rx * leg.nrm.x + rz * leg.nrm.z;
          const inBand = along >= leg.cut + 0.5 && along <= leg.cut + 3.5 && Math.abs(lat) <= leg.hw + leg.sidewalk;
          expect(inBand).toBe(false);
        }
      }
    }
  });

  it('never leave a kerb unsupported for more than a junction (and never space them wider than 18 m on open street)', () => {
    for (const p of paths) {
      for (const side of [1, -1]) {
        const l = columnSpots(p, derived, net).filter((sp) => {
          const c = pointOnPath(p, projectOnPath(p, sp.p).s);
          return Math.sign((sp.p.x - c.p.x) * -c.dir.z + (sp.p.z - c.p.z) * c.dir.x) === side;
        }).map((sp) => projectOnPath(p, sp.p).s);
        const gaps = l.slice(1).map((s, i) => s - l[i]);
        const over = gaps.filter((g) => g > COLUMN_STEP + 0.6);
        console.log(`[el-real] ${p.id} side ${side}: ${l.length} columns, ${over.length} spans over junctions, longest ${Math.max(...gaps).toFixed(0)} m`);
        expect(Math.max(...gaps)).toBeLessThan(110);
        expect(over.length).toBeLessThan(l.length / 2);
      }
    }
  });
});

describe('timetable on arc length', () => {
  const stOf = (id: 'JZ' | 'M') => stations.filter((s) => s.path === id);

  it('is deterministic, covers the path, and the period holds a whole run', () => {
    for (const p of paths) {
      const sts = stOf(p.id);
      const period = periodOf(p, sts);
      expect(period).toBeGreaterThanOrEqual(240);
      for (const dir of [1, -1] as const) {
        const sch = schedulePath(p, sts, dir);
        expect(sch.phases[sch.phases.length - 1].t1).toBeLessThan(period);
        for (let t = 0; t < period; t += 7.3) {
          const a = trainStateReal(p, sts, dir, 0, t), b = trainStateReal(p, sts, dir, 0, t), c = trainStateReal(p, sts, dir, 0, t + period);
          expect(b).toEqual(a);
          expect(c.s).toBeCloseTo(a.s, 6);
          expect(a.speed).toBeLessThanOrEqual(V_CRUISE + 1e-9);
        }
      }
    }
  });

  it('stops at each station of its path with doors open, centred on the platform', () => {
    for (const p of paths) {
      const sts = stOf(p.id);
      for (const dir of [1, -1] as const) {
        const seen = new Set<number>();
        for (let t = 0; t < periodOf(p, sts); t += 0.5) {
          const st = trainStateReal(p, sts, dir, 0, t);
          if (st.phase === 'dwell' && st.doors > 0.99) {
            seen.add(st.station);
            expect(Math.abs(st.s - sts[st.station].s)).toBeLessThan(0.05);
            expect(st.speed).toBe(0);
          }
        }
        expect(seen.size).toBe(sts.length);
      }
    }
  });

  it('enters and leaves beyond the ends so trains are never seen popping in', () => {
    for (const p of paths) {
      const sts = stOf(p.id);
      const a = trainStateReal(p, sts, 1, 0, 0);
      expect(a.s).toBeCloseTo(-TRAIN_LENGTH / 2, 6);
      const b = trainStateReal(p, sts, -1, 0, 0);
      expect(b.s).toBeCloseTo(p.length + TRAIN_LENGTH / 2, 6);
      const cars = carArcLengths(100, 1);
      expect(cars.length).toBe(4);
      expect(cars[0]).toBeGreaterThan(cars[3]);
    }
  });
});

describe('structure mesh', () => {
  const lib = { sign: () => new THREE.MeshBasicMaterial() };
  const allSpots = allColumnSpots(paths, derived, net);
  const group = buildElStructureReal(paths, allSpots, lib, stations);

  it('draws the columns and the bents as two instanced meshes, one material for the steel', () => {
    const inst = group.children.filter((c): c is THREE.InstancedMesh => (c as THREE.InstancedMesh).isInstancedMesh === true);
    expect(inst.length).toBe(2);
    expect(inst[0].count).toBe(allSpots.length);
    expect(inst[1].count).toBeGreaterThan(allSpots.length / 4); // bents where both kerbs have a column at the same place
    expect(inst[1].count).toBeLessThanOrEqual(allSpots.length / 2);
    const mats = new Set<THREE.Material>();
    group.traverse((o) => { const mm = (o as THREE.Mesh).material; if (mm && (o as THREE.Mesh).name.startsWith('el:') && !(o.name === 'el:sign')) mats.add(mm as THREE.Material); });
    expect(mats.size).toBeLessThanOrEqual(2);
  });

  it('keeps sections culling-sized and the triangle count sane', () => {
    const sections = group.children.filter((c) => c.name.startsWith('el:section'));
    expect(sections.length).toBeGreaterThan(10);
    let tris = 0;
    for (const s of sections) {
      const g = (s as THREE.Mesh).geometry;
      g.computeBoundingSphere();
      expect(g.boundingSphere!.radius).toBeLessThan(110);
      tris += g.getAttribute('position').count / 3;
    }
    expect(tris).toBeLessThan(250000);
  });
});

describe('grid map', () => {
  it('has no Broadway, so no real el, and building from it does not throw', () => {
    const grid = roadNetFromGrid(buildGrid(loadBedstuyData()));
    const r = buildElPaths(grid);
    expect(r.paths).toEqual([]);
    expect(r.stations).toEqual([]);
  });
});
