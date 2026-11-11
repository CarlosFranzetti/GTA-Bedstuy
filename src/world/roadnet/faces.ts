/**
 * WP5: block faces of a RoadNet (docs/swarm/plans/briefs/WP5.md). Pure, no THREE.
 *
 *   blockFaces(net, derived) -> RealFace[][]   one entry per block, one face per straight run of the building line
 *
 * A face is a run of `derived.buildingRings[b]` that lies along ONE edge (the edge's centreline offset toward the block by
 * half its width plus its sidewalk). Sides along a curb return (the arcs) belong to the corner, not to a face. An edge with a
 * kinked centreline gives one face per straight stretch (chord deviation < 0.6 m); those internal joins are not corners.
 *
 * Face geometry follows `BlockFace`: `a` -> `b` runs left to right standing on the street facing the block, `outward` points
 * from the block to the street. At a corner the face ends are extended along their lines to the SHARP corner (the point where
 * the two building lines meet, as the stylised grid does), so lots can fill to the corner; `ra`/`rb` keep the true run ends of
 * the ring (the sharp corner lies up to ~0.4 x (curb radius - sidewalk) outside the rounded ring). The extension is refused
 * when the sharp corner is farther than 12 m (very acute Broadway wedges): then a/b are the run ends.
 */
import type { Vec2 } from '@/core/Math2';
import type { BlockFace, Side } from '@/world/types';
import type { Derived } from './derive';
import type { RoadNet } from './RoadNet';
import { closestOnSegment, distance, signedArea } from './geom';

export interface RealFace extends BlockFace {
  /** block index in net.blocks */
  block: number;
  edge: number;
  /** arc length range along the edge covered by this face (s0 < s1) */
  s0: number;
  s1: number;
  /** the s0 / s1 end of the face is a corner of the block (not an internal join of one kinked edge) */
  corner0: boolean;
  corner1: boolean;
  /** true ring run ends (a-side and b-side), before the sharp-corner extension */
  ra: Vec2;
  rb: Vec2;
  /** interior angle of the block (degrees) at the a end and at the b end; 180 where the end is not a corner */
  angleA: number;
  angleB: number;
  /** sidewalk width of the edge (curb line = building line + outward * sidewalk) */
  sidewalk: number;
}

const MIN_FACE = 1;
const CHORD_TOL = 0.6;
const MAX_EXTEND = 12;
const COS_PARALLEL = Math.cos((2 * Math.PI) / 180);
const ON_LINE = 0.06;

const unit = (a: Vec2, b: Vec2): Vec2 => { const l = distance(a, b) || 1; return { x: (b.x - a.x) / l, z: (b.z - a.z) / l }; };

export function sideOf(outward: Vec2): Side {
  return Math.abs(outward.x) > Math.abs(outward.z) ? (outward.x > 0 ? 'E' : 'W') : (outward.z > 0 ? 'S' : 'N');
}

/** arc length along edge e of the point of its centreline closest to p */
function arcOf(net: RoadNet, e: number, p: Vec2): number {
  const pts = net.edges[e].pts;
  let best = Infinity, s = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const c = closestOnSegment(p, pts[k], pts[k + 1]);
    if (c.d2 < best) { best = c.d2; s = net.cum[e][k] + distance(pts[k], pts[k + 1]) * c.t; }
  }
  return s;
}

interface Walk { e: number; segs: Array<{ a: Vec2; b: Vec2; dir: Vec2; n: Vec2 }>; off: number }

function lineHit(p: Vec2, d: Vec2, q: Vec2, e: Vec2): { t: number; u: number } | null {
  const den = d.x * e.z - d.z * e.x;
  if (Math.abs(den) < 1e-6) return null;
  return { t: ((q.x - p.x) * e.z - (q.z - p.z) * e.x) / den, u: ((q.x - p.x) * d.z - (q.z - p.z) * d.x) / den };
}

interface Run { walk: number; verts: Vec2[]; first: number; last: number }

export function blockFaces(net: RoadNet, d: Derived): RealFace[][] {
  return net.blocks.map((_, bi) => facesOfBlock(net, d, bi));
}

function facesOfBlock(net: RoadNet, d: Derived, bi: number): RealFace[] {
  const ring = d.buildingRings[bi];
  if (!ring || ring.length < 3) return [];
  if (signedArea(net.blockRing(bi)) <= 0) return [];
  const walks: Walk[] = net.blocks[bi].edges.map((r) => {
    const ei = Math.abs(r) - 1;
    const ed = net.edges[ei];
    const pts = r > 0 ? ed.pts : ed.pts.slice().reverse();
    const segs: Walk['segs'] = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const l = distance(pts[k], pts[k + 1]);
      if (l < 1e-6) continue;
      const dir = unit(pts[k], pts[k + 1]);
      segs.push({ a: pts[k], b: pts[k + 1], dir, n: { x: -dir.z, z: dir.x } });
    }
    return { e: ei, segs, off: ed.width / 2 + ed.sidewalk };
  });
  const n = ring.length;
  // match every ring segment to the walk entry whose offset line it lies on
  const match: Array<{ w: number } | null> = [];
  for (let i = 0; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n];
    const l = distance(p, q);
    let best: { w: number; score: number } | null = null;
    if (l >= 0.3) {
      const dir = unit(p, q);
      walks.forEach((w, wi) => {
        for (const sg of w.segs) {
          if (dir.x * sg.dir.x + dir.z * sg.dir.z < COS_PARALLEL) continue;
          const dp = (p.x - sg.a.x) * sg.n.x + (p.z - sg.a.z) * sg.n.z - w.off;
          const dq = (q.x - sg.a.x) * sg.n.x + (q.z - sg.a.z) * sg.n.z - w.off;
          if (Math.abs(dp) > ON_LINE || Math.abs(dq) > ON_LINE) continue;
          const len = distance(sg.a, sg.b);
          const tm = ((p.x + q.x) / 2 - sg.a.x) * sg.dir.x + ((p.z + q.z) / 2 - sg.a.z) * sg.dir.z;
          const out = tm < 0 ? -tm : tm > len ? tm - len : 0;
          if (out > 25) continue;
          const score = out + Math.abs(dp) + Math.abs(dq);
          if (!best || score < best.score) best = { w: wi, score };
        }
      });
    }
    match.push(best ? { w: best.w } : null);
  }
  // runs of consecutive matched segments on one walk entry
  const runs: Run[] = [];
  let start = 0;
  while (start < n && match[start] && match[(start - 1 + n) % n]?.w === match[start]!.w) start++; // find a run start
  if (start >= n) start = 0;
  for (let c = 0; c < n; c++) {
    const i = (start + c) % n;
    const m = match[i];
    if (!m) continue;
    const last = runs[runs.length - 1];
    if (last && last.walk === m.w && (last.last + 1) % n === i) { last.verts.push(ring[(i + 1) % n]); last.last = i; }
    else runs.push({ walk: m.w, verts: [ring[i], ring[(i + 1) % n]], first: i, last: i });
  }
  // split runs by chord deviation
  interface Piece { walk: number; p: Vec2; q: Vec2; join0: boolean; join1: boolean; i0: number; i1: number }
  const pieces: Piece[] = [];
  for (const r of runs) {
    let a = 0;
    const v = r.verts;
    const startsAt: number[] = [];
    while (a < v.length - 1) {
      let b = v.length - 1;
      for (; b > a + 1; b--) {
        const dirc = unit(v[a], v[b]);
        let dev = 0;
        for (let k = a + 1; k < b; k++) dev = Math.max(dev, Math.abs((v[k].x - v[a].x) * -dirc.z + (v[k].z - v[a].z) * dirc.x));
        if (dev <= CHORD_TOL) break;
      }
      startsAt.push(a);
      pieces.push({ walk: r.walk, p: v[a], q: v[b], join0: a > 0, join1: b < v.length - 1, i0: r.first + a, i1: r.first + b });
      a = b;
    }
  }
  const kept = pieces.filter((p) => distance(p.p, p.q) >= MIN_FACE);
  const m = kept.length;
  const faces: RealFace[] = [];
  for (let j = 0; j < m; j++) {
    const f = kept[j];
    const w = walks[f.walk];
    const dir = unit(f.p, f.q);
    const prev = kept[(j - 1 + m) % m];
    const next = kept[(j + 1) % m];
    const cornerStart = !(m > 1 && prev.walk === f.walk && prev.i1 % n === f.i0 % n && distance(prev.q, f.p) < 0.05) && !f.join0;
    const cornerEnd = !(m > 1 && next.walk === f.walk && f.i1 % n === next.i0 % n && distance(f.q, next.p) < 0.05) && !f.join1;
    let pStart = f.p, qEnd = f.q;
    let angStart = 180, angEnd = 180;
    if (cornerEnd && m > 1) {
      const nd = unit(next.p, next.q);
      const cross = dir.x * nd.z - dir.z * nd.x;
      angEnd = 180 - (Math.atan2(cross, dir.x * nd.x + dir.z * nd.z) * 180) / Math.PI;
      const h = lineHit(f.p, dir, next.p, nd);
      if (h) {
        const tF = h.t - distance(f.p, f.q); // beyond the run end
        const tG = h.u; // along next from its start (negative = behind)
        if (tF >= -0.6 && tF <= MAX_EXTEND && tG <= 0.6 && tG >= -MAX_EXTEND) qEnd = { x: f.p.x + dir.x * h.t, z: f.p.z + dir.z * h.t };
      }
    }
    if (cornerStart && m > 1) {
      const pd = unit(prev.p, prev.q);
      const cross = pd.x * dir.z - pd.z * dir.x;
      angStart = 180 - (Math.atan2(cross, pd.x * dir.x + pd.z * dir.z) * 180) / Math.PI;
      const h = lineHit(prev.p, pd, f.p, dir);
      if (h) {
        const tF = h.t - distance(prev.p, prev.q);
        const tG = h.u;
        if (tF >= -0.6 && tF <= MAX_EXTEND && tG <= 0.6 && tG >= -MAX_EXTEND) pStart = { x: f.p.x + dir.x * h.u, z: f.p.z + dir.z * h.u };
      }
    }
    const outward = { x: dir.z, z: -dir.x };
    const ed = net.edges[w.e];
    const sw = ed.sidewalk;
    const s1 = arcOf(net, w.e, f.p), s2 = arcOf(net, w.e, f.q);
    const fwdWalk = s1 <= s2;
    // walk order p -> q; the face reads left -> right facing the block, i.e. q -> p
    const a = qEnd, b = pStart;
    faces.push({
      blockId: net.blocks[bi].ref ?? `b${bi}`,
      side: sideOf(outward),
      streetId: net.streetIdOf(w.e),
      a, b,
      curbA: { x: a.x + outward.x * sw, z: a.z + outward.z * sw },
      curbB: { x: b.x + outward.x * sw, z: b.z + outward.z * sw },
      outward,
      block: bi,
      edge: w.e,
      s0: Math.min(s1, s2), s1: Math.max(s1, s2),
      corner0: fwdWalk ? cornerStart : cornerEnd,
      corner1: fwdWalk ? cornerEnd : cornerStart,
      ra: f.q, rb: f.p,
      angleA: angEnd, angleB: angStart,
      sidewalk: sw,
    });
  }
  return faces;
}
