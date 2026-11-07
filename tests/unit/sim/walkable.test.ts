/**
 * NAV6 / H6 P1: every sidewalk must be walkable end to end. For every face edge of grid.sidewalks a foot-sized body
 * (player foot radius) is swept across the whole sidewalk strip (curb to building line) at every 0.2 m along the edge:
 *  - BLOCKED: no free lateral position at all (the sidewalk is cut) -> the body cannot make progress;
 *  - POCKET:  the only free lane at that point is a slot (< 0.5 m of slack) walled by statics on both sides and at least
 *             1.5 m long: a 0.9 m hoarding gap, say, is a trap a player hugging the wall walks into and wedges in;
 *  - CUT:     the free space does not connect to the previous slice (the body would stop making progress).
 * The centreline (lateral 0) and the lane 1 m toward the building are reported with the same checks as part of the sweep.
 * Each span lists the street, side, from-to metres along the edge and the colliding collider ids. Parked cars must not
 * overlap a sidewalk at all.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/Rng';
import { Vehicle, VEHICLE_SPECS } from '@/entities/Vehicle';
import { TrafficSystem } from '@/game/TrafficSystem';
import type { IVehicle, VehicleType } from '@/world/types';
import type { Vec2 } from '@/core/Math2';
import { World2D } from '@/physics/World2D';
import { proxyMaterials, realPhysics, stubMaterials } from './harness';
import { EventBus } from '@/core/Events';

const FOOT = 0.4;
const STEP = 0.2;
const LAT_STEP = 0.1;
const POCKET_SLACK = 0.5;
const POCKET_MIN_LEN = 1.5;

interface Span { street: string; side: string; kind: 'BLOCKED' | 'POCKET' | 'CUT'; from: number; to: number; at: Vec2; edge: string; }

describe('sidewalks are walkable', () => {
  const { physics, world } = realPhysics();
  const grid = world.grid;

  // bounding boxes of the static colliders (for naming the culprits of a blocked span)
  const boxes = world.colliders.map((c) => {
    const s = c.shape as unknown as { kind: string; r?: number; points?: Vec2[]; a?: Vec2; b?: Vec2 };
    const pts: Vec2[] = s.points ?? (s.a && s.b ? [s.a, s.b] : [{ x: c.pos.x - (s.r ?? 0), z: c.pos.z - (s.r ?? 0) }, { x: c.pos.x + (s.r ?? 0), z: c.pos.z + (s.r ?? 0) }]);
    return { id: c.id ?? '?', shape: c.shape, pos: c.pos,
      minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)),
      minZ: Math.min(...pts.map((p) => p.z)), maxZ: Math.max(...pts.map((p) => p.z)) };
  });
  /** colliders touching a probe circle a little wider than the foot, so the walls of a slot are named too */
  const culprits = (p: Vec2): string[] => {
    const R = FOOT + 0.3;
    const out: string[] = [];
    for (const b of boxes) {
      if (b.maxX < p.x - R || b.minX > p.x + R || b.maxZ < p.z - R || b.minZ > p.z + R) continue;
      const w = new World2D(12);
      w.addStatic(b.shape as never, b.pos, b.id);
      if (w.overlapsStatic(p, R)) out.push(`${b.id}:${(b.shape as { kind: string }).kind}`);
    }
    return out;
  };

  const spans: Span[] = [];
  const seen = new Set<string>();
  for (const e of grid.sidewalks.edges) {
    const key = [e.from, e.to].sort().join('|');
    if (seen.has(key) || !e.streetId) continue;
    seen.add(key);
    const a = grid.sidewalks.nodes[e.from].pos, b = grid.sidewalks.nodes[e.to].pos;
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    if (grid.isOnRoad(mid)) continue; // crosswalk edge
    const street = grid.streetById(e.streetId);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
    // lateral axis points toward the buildings (away from the street centreline)
    let nx = -dz, nz = dx;
    const off = street.axis === 'ns' ? mid.x - street.offset : mid.z - street.offset;
    if ((street.axis === 'ns' ? nx : nz) * off < 0) { nx = -nx; nz = -nz; }
    const side = off < 0 ? (street.axis === 'ns' ? 'W' : 'N') : (street.axis === 'ns' ? 'E' : 'S');
    const half = street.sidewalkWidth / 2;
    const nLat = Math.round((2 * half) / LAT_STEP) + 1;
    const edge = `${e.from}->${e.to}`;

    let prev: boolean[] | null = null;
    const open: Partial<Record<Span['kind'], Span>> = {};
    const mark = (kind: Span['kind'], d: number, at: Vec2, on: boolean, from = d): void => {
      const cur = open[kind];
      if (on) {
        if (!cur) { const s: Span = { street: street.id, side, kind, from, to: d, at, edge }; spans.push(s); open[kind] = s; } else cur.to = d;
      } else open[kind] = undefined;
    };
    const pocketRun = { start: -1 };
    for (let d = 0; d <= len + 1e-6; d += STEP) {
      const cx = a.x + dx * d, cz = a.z + dz * d;
      const free: boolean[] = [];
      for (let i = 0; i < nLat; i++) {
        const u = -half + i * LAT_STEP;
        free.push(!physics.overlapsStatic({ x: cx + nx * u, z: cz + nz * u }, FOOT));
      }
      const any = free.some(Boolean);
      mark('BLOCKED', d, { x: cx, z: cz }, !any);
      // CUT: the free cells here must overlap (in lateral position) a free cell of the previous slice
      if (prev && any && !free.some((f, i) => f && (prev![i] || prev![i - 1] || prev![i + 1]))) mark('CUT', d, { x: cx, z: cz }, true); else mark('CUT', d, { x: cx, z: cz }, false);
      // POCKET: some free interval is a slot narrower than POCKET_SLACK walled by statics on both sides
      let slot = false;
      let slotAt = { x: cx, z: cz };
      let i = 0;
      while (i < nLat) {
        if (!free[i]) { i++; continue; }
        let j = i;
        while (j + 1 < nLat && free[j + 1]) j++;
        const w = (j - i) * LAT_STEP;
        const walled = i > 0 && j < nLat - 1; // statics on both sides inside the strip
        if (walled && w < POCKET_SLACK) { slot = true; const u = -half + ((i + j) / 2) * LAT_STEP; slotAt = { x: cx + nx * u, z: cz + nz * u }; }
        i = j + 1;
      }
      if (slot) { if (pocketRun.start < 0) pocketRun.start = d; if (d - pocketRun.start >= POCKET_MIN_LEN) mark('POCKET', d, slotAt, true, pocketRun.start); }
      else { pocketRun.start = -1; mark('POCKET', d, { x: cx, z: cz }, false); }
      prev = free;
    }
  }

  it('has no blocked, pocketed or cut span on any sidewalk', () => {
    const lines = spans.map((s) => {
      const names = culprits(s.at);
      return `${s.kind.padEnd(7)} ${s.street} ${s.side} ${s.from.toFixed(1)}-${s.to.toFixed(1)} m (${s.edge}, near ${s.at.x.toFixed(1)},${s.at.z.toFixed(1)}): ${names.join(', ') || 'n/a'}`;
    });
    expect(lines, `blocked sidewalk spans:\n${lines.join('\n')}`).toEqual([]);
  });

  it('parked cars never overlap a sidewalk (every corner of every parked car is on the roadway)', () => {
    const events = new EventBus();
    let seq = 0;
    const makeVehicle = (type: VehicleType, pos: Vec2, heading: number, color: string): IVehicle =>
      new Vehicle(`park${seq++}`, { ...VEHICLE_SPECS[type], color }, pos, heading, stubMaterials, events);
    for (const seed of [1, 2, 3]) {
      const traffic = new TrafficSystem(grid, new World2D(12), events, new Rng(seed), new THREE.Scene(), proxyMaterials(), makeVehicle, undefined, undefined, world.lots);
      const bad: string[] = [];
      let parked = 0;
      for (const v of traffic.vehicles) {
        if (v.driver !== null) continue;
        parked++;
        const { halfW, halfL } = v.body.shape as { halfW: number; halfL: number };
        const h = v.body.heading, f = { x: Math.sin(h), z: -Math.cos(h) }; // forwardFromHeading
        const r = { x: -f.z, z: f.x };
        for (const [sl, sw] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 1], [0, -1]]) {
          const c = { x: v.body.pos.x + f.x * halfL * sl + r.x * halfW * sw, z: v.body.pos.z + f.z * halfL * sl + r.z * halfW * sw };
          if (!grid.isOnRoad(c)) { bad.push(`${v.body.id} (${v.spec.type}) at ${v.body.pos.x.toFixed(1)},${v.body.pos.z.toFixed(1)} corner ${c.x.toFixed(1)},${c.z.toFixed(1)} on ${grid.nearestStreet(c).id}`); break; }
        }
      }
      expect(parked).toBeGreaterThan(50);
      expect(bad, `seed ${seed}: parked cars overlapping a sidewalk:\n${bad.join('\n')}`).toEqual([]);
    }
  });
});
