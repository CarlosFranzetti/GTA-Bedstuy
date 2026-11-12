/**
 * REALPROPS (WP7): street furniture for the real map. REAL PATH ONLY (imported dynamically by realWorld.ts; nothing on the
 * default path may import it).
 *
 *   const pr = buildRealProps({ net, derived, sidewalks, materials, rng, layout, controls?, avoid? });
 *   group.add(pr.group);  colliders.push(...pr.colliders);  chunkMeshes.push(...pr.chunkMeshes);
 *   world.lamps = pr.lamps;  world.furnitureGroup = pr.group;           // night lighting + setLampsLit
 *   each frame: updateRealSignals(pr.group, realTrafficLights);          // flips the signal heads
 *
 * What is placed, all parameterised by arc length s along an edge and a lateral offset from its centreline (the default path's
 * generators are grid-side based and keep their layout in closures, so only their constants, `placeMatrix`, `treeStyleFor`,
 * `LAMP_HEAD_NAME` and the sign-board size are reused; the little geometries are rebuilt here with the same dimensions):
 *   street trees      every ~12 m per side, 0.8 m inside the kerb, 6 m clear of the ribbon ends (junctions), species by the street census
 *   lamps             cobra heads, steady ~30 m per side (the two sides staggered), arm over the roadway; heads named LAMP_HEAD_NAME
 *   corner poles      one lamp + one street-name blade per street at every filleted or sharp kerb return (blades run along their street)
 *   signals           at signalised clusters: one mast pole per approach leg on its right kerb, vehicle head over the lane, ped head
 *                     facing back along the crosswalk; heads recoloured by `updateRealSignals` from RealTrafficLights
 *   stop signs        on every approach leg of an all-way stop cluster (3+ approaches)
 *   hydrants, bins    one hydrant and two bins per edge side (kinds named furniture:hydrant / furniture:trash like the default path)
 * A candidate is kept only when it lies on the sidewalk band of a block (inside the kerb ring, outside the building line, island
 * blocks excluded), is >= 1.2 m from every crosswalk (the crosswalk bands lie on the roadway, so poles stay out of the walking path),
 * clear of the el columns (`avoid`) and of everything already placed. Hence nothing stands on a roadway or inside a building.
 * There is no driveway data in the network; none is modelled.
 *
 * Instancing: one InstancedMesh per prop kind per 128 m chunk (`userData.chunk` = chunkKeyOf(layout, x, z), the same key the
 * building cells use on the coarse tier), geometries and materials shared across chunks, so ChunkCuller / a streamer can show and
 * hide a chunk's furniture with its buildings. The group sits at SIDEWALK_HEIGHT like the default furniture group.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Vec2 } from '@/core/Math2';
import { Rng } from '@/core/Rng';
import type { IMaterialLibrary, StaticCollider } from '@/world/types';
import { chunkKeyOf, type ChunkLayout } from '@/render/Culling';
import type { Quality } from '@/render/Shadows';
import { treePartsFor, treeStyleFor } from '@/world/data/streetTrees';
import { buildCloudGeometry } from '@/world/props/treeCloud';
import { LAMP_HEAD_NAME, placeMatrix, type LampSpot } from '@/world/FurnitureGen';
import { SIGN_LAYOUT } from '@/world/signBlades';
import { alignYaw, box, cyl, frameMatrix, xform } from '@/world/props/common';
import { SIDEWALK_HEIGHT } from '@/world/WorldBuilder';
import { CROSSWALK_START } from './contract';
import { clusterId, junctionClusters, isRibbonless } from './clusters';
import type { Derived } from './derive';
import { pointInPolygon } from './geom';
import type { RoadNet } from './RoadNet';
import { insetRing, type SidewalkNet, FALLBACK_INSET } from './sidewalks';
import { approachLegs, clusterIsSignal, nodeControl, signalGroups, type ControlTruth } from './signalPhases';

// ---------------------------------------------------------------- tunables (metres), mirroring FurnitureGen / props/signals
export const TREE_SPACING = 12;
export const TREE_JUNCTION_CLEARANCE = 6;
export const TREE_CURB_INSET = 0.8;
export const TREE_COLLIDER_R = 0.35;
export const LAMP_SPACING = 30;
export const LAMP_CURB_INSET = 0.6;
export const LAMP_HEIGHT = 8;
export const LAMP_ARM = 1.4;
export const LAMP_HEAD_Y = 7.75;
export const LAMP_COLLIDER_R = 0.2;
export const CORNER_INSET = 0.6;
export const SIGNAL_POLE_HEIGHT = 6.4;
export const SIGNAL_POLE_INSET = 0.45;
export const SIGNAL_POLE_S = CROSSWALK_START + 0.5;
export const STOP_SIGN_S = 3.5;
export const STOP_SIGN_HEIGHT = 2.3;
export const CROSSWALK_CLEAR = 1.2;
const SLOT_CLEARANCE = 1.2;
const TREE_CLEARANCE = 1.5;
const MIN_EDGE_RANGE = 8;
const CELL = 32;

/** Street trees kept per tier: 1 in `n` along each side of an edge (phone 1 in 3, low 1 in 2; medium and high keep every tree). */
export const TREE_THIN: Record<Quality, number> = { phone: 3, low: 2, medium: 1, high: 1 };

const SIGN_BG = '#0a5a2f';
const SIGN_FG = '#ffffff';

type Kind = 'tree' | 'lamp' | 'hydrant' | 'trash' | 'sign' | 'stop';
interface Item { kind: Kind; x: number; y: number; z: number; yaw: number; text?: string; streetId?: string; dir?: Vec2; out?: Vec2 }

export interface RealPropsOptions {
  net: RoadNet;
  derived: Derived;
  sidewalks: SidewalkNet;
  materials: IMaterialLibrary;
  rng: Rng;
  /** chunkLayoutFromBounds(net.bounds, fine): only the origin and the 128 m chunk size are used */
  layout: ChunkLayout;
  /** per node 'signal' | 'stop' (signalPhases.nodeControl(net, controlsJson)); default: the class rule alone */
  controls?: ControlTruth[];
  /** 'phone' leaves out hydrants and bins (two draws per chunk less; the default path hides them there too) */
  tier?: Quality;
  /** points to keep 1.5 m clear of (the el columns: allColumnSpots(...).map(s => s.p)) */
  avoid?: ReadonlyArray<Vec2>;
}

export interface RealPropsStats {
  trees: number; lamps: number; cornerPoles: number; signs: number; hydrants: number; bins: number;
  signalPoles: number; stopSigns: number; colliders: number;
  chunks: number; meshes: number; triangles: number;
  /** over the chunks that hold furniture */
  perChunk: { trianglesMean: number; trianglesMax: number; drawsMean: number; drawsMax: number };
  ms: number;
}

export interface RealProps {
  group: THREE.Group;
  colliders: StaticCollider[];
  /** the form `world.lamps` / NightLights take (lamp head position, head height above the sidewalk) */
  lamps: LampSpot[];
  /** every InstancedMesh and merged mesh, each with userData.chunk, for ChunkCuller.add */
  chunkMeshes: THREE.Mesh[];
  /** chunk key -> its meshes */
  byChunk: Map<string, THREE.Mesh[]>;
  /** chunk key -> lamp heads inside it (for a streamer that feeds the night pool per chunk) */
  lampsByChunk: Map<string, LampSpot[]>;
  stats: RealPropsStats;
}

// ---------------------------------------------------------------- spatial helpers

class Hash<T> {
  private readonly cells = new Map<number, T[]>();
  private key(ix: number, iz: number): number { return (ix + 32768) * 65536 + (iz + 32768); }
  insertBox(v: T, minX: number, maxX: number, minZ: number, maxZ: number): void {
    for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++) {
      for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) {
        const k = this.key(ix, iz);
        const a = this.cells.get(k);
        if (a) a.push(v); else this.cells.set(k, [v]);
      }
    }
  }
  at(x: number, z: number): readonly T[] { return this.cells.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []; }
}

const bbox = (ring: ReadonlyArray<Vec2>): [number, number, number, number] => {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (const p of ring) { a = Math.min(a, p.x); b = Math.max(b, p.x); c = Math.min(c, p.z); d = Math.max(d, p.z); }
  return [a, b, c, d];
};

function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

// ---------------------------------------------------------------- shared geometries (built once, shared by every chunk)

function buildGeometries(): Record<'trunk' | 'leaves' | 'lamp' | 'lampHead' | 'hydrant' | 'trash' | 'signLampDisc' | 'stopPole', THREE.BufferGeometry> {
  const limb = (a: [number, number, number], b: [number, number, number], r0: number, r1: number): THREE.BufferGeometry => {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, len, 4, 1, true).translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    return g.translate(a[0], a[1], a[2]);
  };
  const merge = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry => {
    const g = mergeGeometries(parts, false);
    if (!g) throw new Error('propsReal: could not merge geometry');
    parts.forEach((p) => p.dispose());
    return g;
  };
  const trunk = merge([
    new THREE.CylinderGeometry(0.19, 0.37, 3, 6, 1, true).translate(0, 1.5, 0),
    limb([0, 2.5, 0], [0, 4.0, 0], 0.14, 0.06),
    limb([0, 2.7, 0], [0.7, 3.6, 0.5], 0.1, 0.05),
    limb([0, 2.7, 0], [-0.6, 3.7, -0.6], 0.1, 0.05),
  ]);
  const leaves = buildCloudGeometry(); // 48 triangle leaf cards (same triangles as the old 24 quads), shared with FurnitureGen
  return {
    trunk, leaves,
    lamp: merge([cyl(0.07, 0.09, LAMP_HEIGHT, 6).translate(0, LAMP_HEIGHT / 2, 0), box(LAMP_ARM, 0.08, 0.1).translate(LAMP_ARM / 2, 7.9, 0)]),
    lampHead: box(0.5, 0.16, 0.3).translate(LAMP_ARM, LAMP_HEAD_Y, 0),
    hydrant: merge([cyl(0.16, 0.18, 0.6).translate(0, 0.3, 0), cyl(0.1, 0.16, 0.18).translate(0, 0.69, 0), box(0.22, 0.12, 0.12).translate(0.2, 0.4, 0)]),
    trash: merge([cyl(0.22, 0.17, 0.9).translate(0, 0.45, 0), cyl(0.25, 0.25, 0.06).translate(0, 0.93, 0)]),
    signLampDisc: new THREE.CircleGeometry(1, 14),
    stopPole: cyl(0.04, 0.04, STOP_SIGN_HEIGHT, 6).translate(0, STOP_SIGN_HEIGHT / 2, 0),
  };
}

// ---------------------------------------------------------------- signals: geometry of one rig, lamp colours

const SIG = { headY: 5.15, headW: 0.36, headH: 1.05, headD: 0.3, lampR: 0.125, lampDy: 0.33, pedY: 2.75, pedW: 0.3, pedH: 0.42, pedD: 0.2, pedLampR: 0.09, pedLampDy: 0.1, armY: SIGNAL_POLE_HEIGHT - 0.25 };
const LIT: Record<'red' | 'yellow' | 'green' | 'hand' | 'walk', THREE.Color> = {
  red: new THREE.Color().setRGB(2.4, 0.12, 0.08), yellow: new THREE.Color().setRGB(2.6, 1.7, 0.1), green: new THREE.Color().setRGB(0.12, 2.2, 0.8),
  hand: new THREE.Color().setRGB(2.4, 0.9, 0.05), walk: new THREE.Color().setRGB(2.0, 2.1, 2.2),
};
const DARK: Record<keyof typeof LIT, THREE.Color> = {
  red: new THREE.Color().setRGB(0.1, 0.015, 0.015), yellow: new THREE.Color().setRGB(0.1, 0.075, 0.01), green: new THREE.Color().setRGB(0.01, 0.08, 0.04),
  hand: new THREE.Color().setRGB(0.08, 0.035, 0.005), walk: new THREE.Color().setRGB(0.08, 0.08, 0.09),
};
const VEH_KINDS = ['red', 'yellow', 'green'] as const;
const localM = (m: THREE.Matrix4, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): THREE.Matrix4 =>
  m.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)));

interface Rig { cluster: string; group: number; veh: number; ped: number; key: number }
interface SignalSet { lamps: THREE.InstancedMesh; rigs: Rig[] }
interface SignalPole { x: number; z: number; out: Vec2; roadSide: Vec2; reach: number; cluster: string; group: number }

/** Pole, mast arm, vehicle head and ped head of one approach (merged-geometry parts) and its five lamp matrices (3 vehicle, hand, walk). */
function signalRig(p: SignalPole, solid: THREE.BufferGeometry[]): THREE.Matrix4[] {
  solid.push(xform(cyl(0.08, 0.1, SIGNAL_POLE_HEIGHT, 8), p.x, SIGNAL_POLE_HEIGHT / 2, p.z));
  solid.push(xform(cyl(0.15, 0.15, 0.5, 8), p.x, 0.25, p.z));
  const head = { x: p.x + p.roadSide.x * p.reach, z: p.z + p.roadSide.z * p.reach };
  const arm = alignYaw(p.roadSide);
  solid.push(xform(box(p.reach, 0.1, 0.1), (p.x + head.x) / 2, SIG.armY, (p.z + head.z) / 2, arm));
  const headTop = SIG.headY + SIG.headH / 2 + 0.12;
  solid.push(xform(box(0.07, SIG.armY - headTop, 0.07), head.x, (SIG.armY + headTop) / 2, head.z));
  const f = frameMatrix(head, SIG.headY, p.out); // local +z faces the approaching driver
  solid.push(box(SIG.headW, SIG.headH, SIG.headD).applyMatrix4(localM(f, 0, 0, -SIG.headD / 2 + 0.02)));
  solid.push(box(SIG.headW + 0.28, SIG.headH + 0.24, 0.03).applyMatrix4(localM(f, 0, 0, -SIG.headD + 0.01)));
  const lamps: THREE.Matrix4[] = [];
  for (let i = 0; i < 3; i++) lamps.push(localM(f, 0, SIG.lampDy - i * SIG.lampDy, 0.025, SIG.lampR, SIG.lampR, 1));
  // ped head on the pole, facing across the roadway toward the pedestrians who walk toward this pole
  const pp = { x: p.x + p.roadSide.x * 0.16, z: p.z + p.roadSide.z * 0.16 };
  const g = frameMatrix(pp, SIG.pedY, p.roadSide);
  solid.push(box(SIG.pedW, SIG.pedH, SIG.pedD).applyMatrix4(localM(g, 0, 0, -SIG.pedD / 2 + 0.02)));
  lamps.push(localM(g, 0, SIG.pedLampDy, 0.025, SIG.pedLampR, SIG.pedLampR, 1));
  lamps.push(localM(g, 0, -SIG.pedLampDy, 0.025, SIG.pedLampR, SIG.pedLampR, 1));
  return lamps;
}

const PHASE_CODE = { red: 0, yellow: 1, green: 2 } as const;
const WALK_CODE = { dont: 0, flash: 1, walk: 2 } as const;

/** The two things of RealTrafficLights that the heads need (a Pick, so tests can fake it). */
export interface RealSignalSource {
  readonly clock: number;
  stateOf(id: string): { groups: ReadonlyArray<{ phase: 'red' | 'yellow' | 'green'; walk: 'dont' | 'flash' | 'walk' }> } | undefined;
}

/** Flip the signal heads under `group` to match the controller. Touches only rigs whose phase or walk state changed. */
export function updateRealSignals(group: THREE.Object3D, lights: RealSignalSource): void {
  const blink = Math.floor(lights.clock * 2) & 1;
  group.traverse((o) => {
    const set = o.userData.realSignals as SignalSet | undefined;
    if (!set) return;
    const lamps = set.lamps;
    let dirty = false;
    for (const rig of set.rigs) {
      const g = lights.stateOf(rig.cluster)?.groups[rig.group];
      if (!g) continue;
      const key = PHASE_CODE[g.phase] | (WALK_CODE[g.walk] << 2) | ((g.walk === 'flash' ? blink : 0) << 4);
      if (key === rig.key) continue;
      rig.key = key;
      dirty = true;
      lamps.setColorAt(rig.veh, g.phase === 'red' ? LIT.red : DARK.red);
      lamps.setColorAt(rig.veh + 1, g.phase === 'yellow' ? LIT.yellow : DARK.yellow);
      lamps.setColorAt(rig.veh + 2, g.phase === 'green' ? LIT.green : DARK.green);
      const handOn = g.walk === 'dont' || (g.walk === 'flash' && blink === 1);
      lamps.setColorAt(rig.ped, handOn ? LIT.hand : DARK.hand);
      lamps.setColorAt(rig.ped + 1, g.walk === 'walk' ? LIT.walk : DARK.walk);
    }
    if (dirty && lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
  });
}

// ---------------------------------------------------------------- main

export function buildRealProps(opts: RealPropsOptions): RealProps {
  const t0 = performance.now();
  const { net, derived: d, sidewalks: sw, materials, layout } = opts;
  const rng = opts.rng;
  const controls = opts.controls ?? nodeControl(net, {});
  const avoid = opts.avoid ?? [];

  // ---- sidewalk-band test: inside a kerb ring, outside its building line
  const kerbs = new Hash<number>();
  const inner: Vec2[][] = net.blocks.map((blk, b) => {
    const curb = d.curbRings[b];
    if (blk.island || !curb || curb.length < 3) return [];
    kerbs.insertBox(b, ...bbox(curb));
    const bld = d.buildingRings[b];
    return d.fallbackBuilding.includes(b) || !bld || bld.length < 3 ? insetRing(curb, FALLBACK_INSET) : bld;
  });
  const onSidewalk = (p: Vec2): boolean => {
    for (const b of kerbs.at(p.x, p.z)) {
      if (!pointInPolygon(p, d.curbRings[b])) continue;
      const ring = inner[b];
      if (ring.length >= 3 && pointInPolygon(p, ring)) return false;
      return true;
    }
    return false;
  };
  const cwHash = new Hash<[Vec2, Vec2]>();
  for (const cw of sw.crosswalks) {
    const [x0, x1, z0, z1] = bbox([cw.a, cw.b]);
    cwHash.insertBox([cw.a, cw.b], x0 - 2, x1 + 2, z0 - 2, z1 + 2);
  }
  const clearOfCrosswalks = (p: Vec2, r: number): boolean => {
    for (const [a, b] of cwHash.at(p.x, p.z)) if (segDist(p, a, b) < r) return false;
    return true;
  };
  const taken = new Hash<Vec2>();
  for (const a of avoid) taken.insertBox(a, a.x - 2, a.x + 2, a.z - 2, a.z + 2);
  const avoidSet = new Set(avoid);
  const free = (p: Vec2, r: number): boolean => {
    for (const q of taken.at(p.x, p.z)) {
      if (Math.hypot(p.x - q.x, p.z - q.z) < (avoidSet.has(q) ? Math.max(r, TREE_CLEARANCE) : r)) return false;
    }
    return true;
  };
  const claim = (p: Vec2): void => taken.insertBox(p, p.x - 2, p.x + 2, p.z - 2, p.z + 2);
  const ok = (p: Vec2, clear: number, cwClear = CROSSWALK_CLEAR): boolean => onSidewalk(p) && !net.isOnRoad(p) && clearOfCrosswalks(p, cwClear) && free(p, clear);

  const small = opts.tier !== 'phone';
  const thin = TREE_THIN[opts.tier ?? 'high'] ?? 1;
  const items: Item[] = [];
  const poles: SignalPole[] = [];
  const counts = { trees: 0, lamps: 0, cornerPoles: 0, signs: 0, hydrants: 0, bins: 0, signalPoles: 0, stopSigns: 0 };

  // ---- junction clusters: which are signalised, which are all-way stops
  const clusters = junctionClusters(net, d);
  const rigLegs = new Map<number, { cluster: string; group: number }>();
  const stopLegs = new Set<number>();
  for (const c of clusters) {
    if (clusterIsSignal(net, d, c, controls)) {
      const id = clusterId(c);
      signalGroups(net, d, c).forEach((g, gi) => g.forEach((leg) => rigLegs.set(leg, { cluster: id, group: gi })));
    } else if (c.some((v) => controls[v] === 'stop') || c.some((v) => net.nodes[v].control === 'stop')) {
      const legs = approachLegs(net, d, c);
      if (legs.length >= 3) legs.forEach((l) => stopLegs.add(l));
    }
  }

  // ---- along edges: lamps, trees, hydrants, bins
  const nrmAt = (dir: Vec2): Vec2 => ({ x: -dir.z, z: dir.x });
  net.edges.forEach((E, e) => {
    if (E.level !== 0 || E.cls === 'highway' || E.cls === 'ramp' || E.cls === 'ped' || E.a === E.b) return;
    if (isRibbonless(net, d, e)) return;
    const L = net.lengths[e];
    const cutA = d.cuts[e].cutA, cutB = d.cuts[e].cutB;
    const lo = cutA + 6, hi = L - cutB - 6;
    const hw = E.width / 2;
    const at = (s: number, side: 1 | -1, inset: number): { p: Vec2; toRoad: Vec2; dir: Vec2 } => {
      const { p, dir } = net.pointAt(e, s);
      const n = nrmAt(dir);
      const off = hw + inset;
      return { p: { x: p.x + n.x * side * off, z: p.z + n.z * side * off }, toRoad: { x: -n.x * side, z: -n.z * side }, dir };
    };
    const streetId = net.streetIdOf(e);
    if (hi - lo >= MIN_EDGE_RANGE) {
      // lamps: steady spacing, sides staggered
      const nL = Math.max(1, Math.round((hi - lo) / LAMP_SPACING));
      const step = (hi - lo) / nL;
      for (const side of [1, -1] as const) {
        for (let i = 0; i < nL; i++) {
          const s = lo + (i + (side === 1 ? 0.25 : 0.75)) * step;
          const a = at(s, side, LAMP_CURB_INSET);
          if (!ok(a.p, 6)) continue;
          claim(a.p);
          items.push({ kind: 'lamp', x: a.p.x, y: 0, z: a.p.z, yaw: alignYaw(a.toRoad), dir: a.toRoad });
        }
      }
      // trees
      if (E.sidewalk >= 2.8) {
        for (const side of [1, -1] as const) {
          let ti = 0;
          for (let s = lo; s <= hi + 1e-6; s += TREE_SPACING) {
            const sj = Math.min(hi, Math.max(lo, s + rng.range(-0.5, 0.5)));
            if (ti++ % thin !== 0) continue; // thinned tiers keep every `thin`-th tree of the row (the random draw above is spent either way)
            const a = at(sj, side, TREE_CURB_INSET);
            if (!ok(a.p, TREE_CLEARANCE, 1.5)) continue;
            claim(a.p);
            items.push({ kind: 'tree', x: a.p.x, y: 0, z: a.p.z, yaw: rng.range(0, Math.PI * 2), streetId });
          }
        }
      }
      // hydrant and two bins per side
      for (const side of small ? [1, -1] as const : []) {
        const h = at(lo + 2, side, 0.5);
        if (ok(h.p, SLOT_CLEARANCE) && rng.chance(0.6)) { claim(h.p); items.push({ kind: 'hydrant', x: h.p.x, y: 0, z: h.p.z, yaw: alignYaw(h.dir) }); }
        for (const f of [0.3, 0.7]) {
          const b = at(lo + (hi - lo) * f + rng.range(-0.4, 0.4), side, 0.5);
          if (ok(b.p, SLOT_CLEARANCE)) { claim(b.p); items.push({ kind: 'trash', x: b.p.x, y: 0, z: b.p.z, yaw: alignYaw(b.dir) }); }
        }
      }
    }
  });

  // ---- corners: one lamp pole with one name blade per street at every filleted or sharp kerb return
  for (const r of d.returns) {
    if (r.kind === 'bevel' || r.pts.length === 0) continue;
    const A = d.legs[r.legA], B = d.legs[r.legB];
    const mid = r.pts[Math.floor(r.pts.length / 2)];
    const bis = { x: A.dir.x + B.dir.x, z: A.dir.z + B.dir.z };
    const bl = Math.hypot(bis.x, bis.z);
    if (bl < 0.2) continue;
    const base = { x: mid.x + (bis.x / bl) * CORNER_INSET, z: mid.z + (bis.z / bl) * CORNER_INSET };
    if (!ok(base, 3)) continue;
    claim(base);
    counts.cornerPoles++;
    items.push({ kind: 'lamp', x: base.x, y: 0, z: base.z, yaw: alignYaw({ x: -bis.x / bl, z: -bis.z / bl }), dir: { x: -bis.x / bl, z: -bis.z / bl } });
    const seen = new Set<string>();
    let level = 0;
    for (const leg of [A, B]) {
      const E = net.edges[leg.edge];
      const sid = net.streetIdOf(leg.edge);
      if (!E.name || E.cls === 'ramp' || E.cls === 'highway' || seen.has(sid)) continue;
      seen.add(sid);
      const reach = SIGN_LAYOUT.width / 2 + 0.08;
      items.push({
        kind: 'sign', text: E.name, yaw: alignYaw(leg.dir),
        x: base.x + leg.dir.x * reach, z: base.z + leg.dir.z * reach, y: SIGN_LAYOUT.mountY - level * (SIGN_LAYOUT.height + SIGN_LAYOUT.gap),
      });
      level++;
      counts.signs++;
    }
  }

  // ---- approach poles: signal masts and stop signs (leg.dir points away from the node; drivers approach facing +dir)
  const approachSpot = (legId: number, s: number): { p: Vec2; out: Vec2; roadSide: Vec2; hw: number } => {
    const leg = d.legs[legId];
    const E = net.edges[leg.edge];
    const L = net.lengths[leg.edge];
    const cut = leg.end === 'a' ? d.cuts[leg.edge].cutA : d.cuts[leg.edge].cutB;
    const { p, dir } = net.pointAt(leg.edge, leg.end === 'a' ? cut + s : L - (cut + s));
    const out = leg.end === 'a' ? dir : { x: -dir.x, z: -dir.z };
    const right = { x: out.z, z: -out.x }; // right-hand side of a driver travelling toward the node
    const hw = E.width / 2;
    const off = hw + SIGNAL_POLE_INSET;
    return { p: { x: p.x + right.x * off, z: p.z + right.z * off }, out, roadSide: { x: -right.x, z: -right.z }, hw };
  };
  for (const [legId, info] of rigLegs) {
    for (const extra of [0, 1.5, 3]) {
      const a = approachSpot(legId, SIGNAL_POLE_S + extra);
      if (!ok(a.p, 2.5)) continue;
      claim(a.p);
      poles.push({ x: a.p.x, z: a.p.z, out: a.out, roadSide: a.roadSide, reach: a.hw * 0.5 + SIGNAL_POLE_INSET, cluster: info.cluster, group: info.group });
      break;
    }
  }
  for (const legId of stopLegs) {
    const a = approachSpot(legId, STOP_SIGN_S);
    if (!ok(a.p, 2)) continue;
    claim(a.p);
    items.push({ kind: 'stop', x: a.p.x, y: 0, z: a.p.z, yaw: 0, out: a.out });
    counts.stopSigns++;
  }
  counts.signalPoles = poles.length;

  // ---- bucket by 128 m chunk and build the meshes
  const geo = buildGeometries();
  const M = {
    trunk: materials.get('treeTrunk'), leaves: materials.get('treeLeaves'), metal: materials.get('metalDark'),
    hydrant: materials.get('hydrant'), trash: materials.get('trash'),
    lampHead: new THREE.MeshStandardMaterial({ name: LAMP_HEAD_NAME, color: '#3b3b3b', roughness: 0.5, metalness: 0.2, emissive: '#ffd9a0', emissiveIntensity: 0 }),
    signalLamp: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    stop: materials.sign('STOP', '#b01020', '#ffffff'),
  };
  interface Bucket { tree: Item[]; lamp: Item[]; hydrant: Item[]; trash: Item[]; sign: Item[]; stop: Item[]; poles: SignalPole[] }
  const buckets = new Map<string, Bucket>();
  const bucketOf = (x: number, z: number): Bucket => {
    const k = chunkKeyOf(layout, x, z);
    let b = buckets.get(k);
    if (!b) { b = { tree: [], lamp: [], hydrant: [], trash: [], sign: [], stop: [], poles: [] }; buckets.set(k, b); }
    return b;
  };
  for (const it of items) bucketOf(it.x, it.z)[it.kind].push(it);
  for (const p of poles) bucketOf(p.x, p.z).poles.push(p);

  const group = new THREE.Group();
  group.name = 'furniture-real';
  group.position.y = SIDEWALK_HEIGHT;
  const colliders: StaticCollider[] = [];
  const lamps: LampSpot[] = [];
  const lampsByChunk = new Map<string, LampSpot[]>();
  const chunkMeshes: THREE.Mesh[] = [];
  const byChunk = new Map<string, THREE.Mesh[]>();
  let cid = 0;
  const circle = (x: number, z: number, r: number, kind: string): void => {
    colliders.push({ shape: { kind: 'circle', r }, pos: { x, z }, id: `rp:${kind}-${cid++}` });
  };
  const trisOf = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  let triangles = 0;
  const perChunk: Array<{ tris: number; draws: number }> = [];
  const mat = new THREE.Matrix4(), tmp = new THREE.Matrix4(), cloud = new THREE.Matrix4();
  const sc = new THREE.Vector3(), id4 = new THREE.Quaternion();

  for (const [key, b] of [...buckets].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    const meshes: THREE.Mesh[] = [];
    let chunkTris = 0;
    const add = (m: THREE.Mesh, name: string, tris: number): void => {
      m.name = name;
      m.userData.chunk = key;
      group.add(m);
      meshes.push(m);
      chunkMeshes.push(m);
      chunkTris += tris;
    };
    const instanced = (name: string, g: THREE.BufferGeometry, material: THREE.Material, ms: number[]): THREE.InstancedMesh | null => {
      const n = ms.length / 16;
      if (n === 0) return null;
      const im = new THREE.InstancedMesh(g, material, n);
      (im.instanceMatrix.array as Float32Array).set(ms);
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      add(im, name, trisOf(g) * n);
      return im;
    };
    const push = (out: number[], m: THREE.Matrix4): void => { for (let i = 0; i < 16; i++) out.push(m.elements[i]); };

    // trees: trunk + two or three leaf clouds each
    const trunkM: number[] = [], leafM: number[] = [];
    for (const t of b.tree) {
      const tr = new Rng(Rng.hash(`tree:${t.streetId}:${t.x.toFixed(1)}:${t.z.toFixed(1)}`));
      const style = treeStyleFor(t.streetId ?? '', tr.next(), tr.next(), tr.next());
      const R = (1.2 + 0.4 * tr.next()) * style.canopy;
      placeMatrix(mat, t.x, 0, t.z, t.yaw, [(tr.next() - 0.5) * 0.1, (tr.next() - 0.5) * 0.1]).scale(sc.set(style.scale, style.scale, style.scale));
      const parts = treePartsFor(style, R, tr.next(), tr.next());
      push(trunkM, tmp.makeScale(parts.trunk[0], parts.trunk[1], parts.trunk[2]).premultiply(mat));
      for (const [ox, oy, oz, r, sq] of parts.clouds) {
        tmp.compose(new THREE.Vector3(ox, oy, oz), id4, sc.set(r, r * sq, r));
        push(leafM, cloud.multiplyMatrices(mat, tmp));
      }
      circle(t.x, t.z, TREE_COLLIDER_R, 'tree');
    }
    instanced('furniture:treeTrunk', geo.trunk, M.trunk, trunkM);
    instanced('furniture:treeLeaves', geo.leaves, M.leaves, leafM);

    // lamps (street and corner)
    const lampM: number[] = [];
    const spots: LampSpot[] = [];
    for (const l of b.lamp) {
      push(lampM, placeMatrix(mat, l.x, 0, l.z, l.yaw));
      spots.push({ pos: { x: l.x + l.dir!.x * LAMP_ARM, z: l.z + l.dir!.z * LAMP_ARM }, height: LAMP_HEAD_Y });
      circle(l.x, l.z, LAMP_COLLIDER_R, 'lamp');
    }
    instanced('furniture:lamp', geo.lamp, M.metal, lampM);
    instanced(LAMP_HEAD_NAME, geo.lampHead, M.lampHead, lampM);
    if (spots.length) { lamps.push(...spots); lampsByChunk.set(key, spots); }
    counts.lamps += b.lamp.length;

    const hydM: number[] = [], binM: number[] = [];
    for (const h of b.hydrant) { push(hydM, placeMatrix(mat, h.x, 0, h.z, h.yaw)); circle(h.x, h.z, 0.3, 'hydrant'); }
    for (const t of b.trash) { push(binM, placeMatrix(mat, t.x, 0, t.z, t.yaw)); circle(t.x, t.z, 0.3, 'soft-bin'); }
    instanced('furniture:hydrant', geo.hydrant, M.hydrant, hydM);
    instanced('furniture:trash', geo.trash, M.trash, binM);
    counts.hydrants += b.hydrant.length;
    counts.bins += b.trash.length;
    counts.trees += b.tree.length;

    // street-name blades: one merged two-sided mesh per street text in the chunk (yaw differs per blade)
    const byText = new Map<string, THREE.BufferGeometry[]>();
    for (const sgn of b.sign) {
      const front = new THREE.PlaneGeometry(SIGN_LAYOUT.width, SIGN_LAYOUT.height).translate(0, 0, 0.01);
      const back = new THREE.PlaneGeometry(SIGN_LAYOUT.width, SIGN_LAYOUT.height).rotateY(Math.PI).translate(0, 0, -0.01);
      const list = byText.get(sgn.text!) ?? [];
      const m4 = placeMatrix(new THREE.Matrix4(), sgn.x, sgn.y, sgn.z, sgn.yaw);
      list.push(front.applyMatrix4(m4), back.applyMatrix4(m4));
      byText.set(sgn.text!, list);
    }
    for (const [text, parts] of byText) {
      const g = mergeGeometries(parts, false);
      parts.forEach((p) => p.dispose());
      if (g) add(new THREE.Mesh(g, materials.sign(text, SIGN_BG, SIGN_FG)), `props:sign:${text}`, trisOf(g));
    }

    // stop signs: pole + two-sided octagon-sized plane; the poles join the signal masts below (one metal mesh per chunk), the boards are one mesh
    const metalG: THREE.BufferGeometry[] = [];
    if (b.stop.length) {
      const polesG: THREE.BufferGeometry[] = [], boards: THREE.BufferGeometry[] = [];
      for (const s of b.stop) {
        const m4 = placeMatrix(new THREE.Matrix4(), s.x, 0, s.z);
        polesG.push(geo.stopPole.clone().applyMatrix4(m4));
        const fm = frameMatrix({ x: s.x, z: s.z }, STOP_SIGN_HEIGHT - 0.3, s.out!);
        boards.push(new THREE.PlaneGeometry(0.62, 0.62).translate(0, 0, 0.05).applyMatrix4(fm));
        boards.push(new THREE.PlaneGeometry(0.62, 0.62).rotateY(Math.PI).translate(0, 0, 0.04).applyMatrix4(fm));
        circle(s.x, s.z, 0.1, 'stopsign');
      }
      const bg = mergeGeometries(boards, false);
      boards.forEach((g) => g.dispose());
      metalG.push(...polesG);
      if (bg) add(new THREE.Mesh(bg, M.stop), 'props:stopsigns', trisOf(bg));
    }

    // signals: one merged metal mesh (masts and stop-sign poles) and one instanced lamp mesh per chunk
    if (b.poles.length || metalG.length) {
      const solid: THREE.BufferGeometry[] = metalG;
      const lampMats: THREE.Matrix4[] = [];
      const rigs: Rig[] = [];
      for (const p of b.poles) {
        const lm = signalRig(p, solid);
        rigs.push({ cluster: p.cluster, group: p.group, veh: lampMats.length, ped: lampMats.length + 3, key: -1 });
        lampMats.push(...lm);
        circle(p.x, p.z, 0.12, 'signal');
      }
      const merged = mergeGeometries(solid, false);
      solid.forEach((g) => g.dispose());
      if (merged) { const m = new THREE.Mesh(merged, M.metal); m.castShadow = true; add(m, 'props:signal-poles', trisOf(merged)); }
      if (lampMats.length) {
      const lm = new THREE.InstancedMesh(geo.signLampDisc, M.signalLamp, lampMats.length);
      lampMats.forEach((m4, i) => { lm.setMatrixAt(i, m4); lm.setColorAt(i, i % 5 < 3 ? DARK[VEH_KINDS[i % 5]] : (i % 5 === 3 ? DARK.hand : DARK.walk)); });
      lm.instanceMatrix.needsUpdate = true;
      if (lm.instanceColor) lm.instanceColor.needsUpdate = true;
      lm.computeBoundingSphere();
      lm.userData.realSignals = { lamps: lm, rigs } satisfies SignalSet;
      lm.userData.noInstanceCull = true; // the signal controller recolours lamps by instance index: the InstanceCuller's compaction would shift them
      add(lm, 'props:signal-lamps', trisOf(geo.signLampDisc) * lampMats.length);
      }
    }
    byChunk.set(key, meshes);
    triangles += chunkTris;
    perChunk.push({ tris: chunkTris, draws: meshes.length });
  }

  const n = Math.max(1, perChunk.length);
  const stats: RealPropsStats = {
    ...counts, colliders: colliders.length, chunks: perChunk.length, meshes: chunkMeshes.length, triangles,
    perChunk: {
      trianglesMean: Math.round(triangles / n), trianglesMax: Math.max(0, ...perChunk.map((c) => c.tris)),
      drawsMean: Math.round((chunkMeshes.length / n) * 10) / 10, drawsMax: Math.max(0, ...perChunk.map((c) => c.draws)),
    },
    ms: Math.round(performance.now() - t0),
  };
  return { group, colliders, lamps, chunkMeshes, byChunk, lampsByChunk, stats };
}
