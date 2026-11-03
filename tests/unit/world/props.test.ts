import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildProps, BILLBOARD_TEXTS } from '@/world/PropsGen';
import { Rng } from '@/core/Rng';
import type {
  Block, BlockFace, Circle, GridModel, IMaterialLibrary, Intersection, Lot, PoiDef, Polygon, Segment, Side,
  StaticCollider, StreetDef,
} from '@/world/types';
import type { Vec2 } from '@/core/Math2';

// ---------------------------------------------------------------- fake one-block grid (same layout as furniture.test.ts)
// Block r0c0 spans x 0..60, z 0..100 (north = -z). Sidewalk strip 3 m wide.

const SIDEWALK = 3;
const v = (x: number, z: number): Vec2 => ({ x, z });

const streets: StreetDef[] = [
  { id: 'hart', name: 'Hart St', signName: 'Hart St', axis: 'ns', offset: -20, class: 'street', roadWidth: 12, sidewalkWidth: SIDEWALK, oneWay: 0 },
  { id: 'throop', name: 'Throop Ave', signName: 'Throop Av', axis: 'ns', offset: 80, class: 'avenue', roadWidth: 14, sidewalkWidth: SIDEWALK, oneWay: 0 },
  { id: 'kos', name: 'Kosciuszko St', signName: 'Kosciusko St', axis: 'ew', offset: -10, class: 'street', roadWidth: 12, sidewalkWidth: SIDEWALK, oneWay: 0 },
  { id: 'lewis', name: 'Lewis Ave', signName: 'Lewis Av', axis: 'ew', offset: 110, class: 'avenue', roadWidth: 14, sidewalkWidth: SIDEWALK, oneWay: 0 },
];

const faces: BlockFace[] = [
  { blockId: 'r0c0', side: 'N', streetId: 'kos', a: v(57, 3), b: v(3, 3), curbA: v(60, 0), curbB: v(0, 0), outward: v(0, -1) },
  { blockId: 'r0c0', side: 'E', streetId: 'throop', a: v(57, 97), b: v(57, 3), curbA: v(60, 100), curbB: v(60, 0), outward: v(1, 0) },
  { blockId: 'r0c0', side: 'S', streetId: 'lewis', a: v(3, 97), b: v(57, 97), curbA: v(0, 100), curbB: v(60, 100), outward: v(0, 1) },
  { blockId: 'r0c0', side: 'W', streetId: 'hart', a: v(3, 3), b: v(3, 97), curbA: v(0, 0), curbB: v(0, 100), outward: v(-1, 0) },
];

const curb: Vec2[] = [v(0, 0), v(60, 0), v(60, 100), v(0, 100)];
const buildingLine: Vec2[] = [v(3, 3), v(57, 3), v(57, 97), v(3, 97)];
const block: Block = { id: 'r0c0', row: 0, col: 0, curb, buildingLine, faces };

const bodegaPoi: PoiDef = {
  id: 'p-deli', block: 'r0c0', face: 'N', t: 0.3, archetype: 'bodega', sign: 'Corner Deli', awningColor: '#d62828',
};

function mkLot(id: string, side: Side, fa: Vec2, fb: Vec2, type: Lot['type'], extra: Partial<Lot> = {}): Lot {
  const face = faces.find((f) => f.side === side)!;
  return {
    id, blockId: 'r0c0', side, frontA: fa, frontB: fb,
    width: Math.hypot(fb.x - fa.x, fb.z - fa.z), depth: 14, outward: face.outward,
    type, corner: false, ...extra,
  };
}

const LOTS: Lot[] = [
  // N face (Kosciuszko, a street): apartment corner lot at the Throop end, then mixed-use, brownstones, a scaffold
  mkLot('n-corner', 'N', v(57, 3), v(49, 3), 'apartment', { corner: true }),
  mkLot('n-bodega', 'N', v(49, 3), v(39, 3), 'mixeduse', { poi: bodegaPoi }),
  mkLot('n-b1', 'N', v(39, 3), v(33, 3), 'brownstone'),
  mkLot('n-b2', 'N', v(33, 3), v(27, 3), 'brownstone'),
  mkLot('n-scaf', 'N', v(27, 3), v(20, 3), 'scaffold'),
  mkLot('n-b3', 'N', v(20, 3), v(3, 3), 'brownstone'),
  // S face (Lewis, an avenue)
  mkLot('s-mixed', 'S', v(3, 97), v(15, 97), 'mixeduse'),
  mkLot('s-b1', 'S', v(15, 97), v(57, 97), 'brownstone'),
  // E face (Throop, an avenue)
  mkLot('e1', 'E', v(57, 97), v(57, 3), 'brownstone'),
  // W face (Hart, a street): a vacant lot between two brownstones
  mkLot('w-b1', 'W', v(3, 3), v(3, 20), 'brownstone'),
  mkLot('w-vac', 'W', v(3, 20), v(3, 35), 'vacant'),
  mkLot('w-b2', 'W', v(3, 35), v(3, 97), 'rowhouse'),
];

// A few mixed-use lots so the 15% dumpster roll comes up for at least one seed.
const MANY_MIXED: Lot[] = Array.from({ length: 8 }, (_, i) =>
  mkLot(`m${i}`, 'S', v(3 + i * 7, 97), v(10 + i * 7, 97), 'mixeduse'));

const intersections: Intersection[] = [
  { id: 'throop|lewis', center: v(80, 110), nsStreetId: 'throop', ewStreetId: 'lewis', halfX: 7, halfZ: 7 },
  { id: 'throop|kos', center: v(80, -10), nsStreetId: 'throop', ewStreetId: 'kos', halfX: 7, halfZ: 6 },
  { id: 'hart|lewis', center: v(-20, 110), nsStreetId: 'hart', ewStreetId: 'lewis', halfX: 6, halfZ: 7 },
];

const grid = {
  seed: 1,
  bounds: { minX: -100, maxX: 200, minZ: -100, maxZ: 200 },
  streets,
  intersections,
  segments: [],
  crosswalks: [],
  blocks: [block],
  streetById: (id: string): StreetDef => {
    const s = streets.find((x) => x.id === id);
    if (!s) throw new Error(`no street ${id}`);
    return s;
  },
} as unknown as GridModel;

// ---------------------------------------------------------------- stub materials

function fakeMaterials() {
  const cache = new Map<string, THREE.Material>();
  const requested: string[] = [];
  const signCalls: [string, string | undefined, string | undefined][] = [];
  const named = (name: string): THREE.Material => {
    let m = cache.get(name);
    if (!m) { m = new THREE.MeshBasicMaterial({ name }); cache.set(name, m); }
    return m;
  };
  const lib: IMaterialLibrary = {
    get: (key) => { requested.push(key); return named(key); },
    awning: (color, text) => named(`awning:${color}:${text}`),
    sign: (text, bg, fg) => { signCalls.push([text, bg, fg]); return named(text); },
    carPaint: (color) => named(`car:${color}`),
    setNight: () => {},
  };
  return { lib, requested, signCalls };
}

function build(seed = 42, lots: Lot[] = LOTS, g: GridModel = grid) {
  const mats = fakeMaterials();
  const out = buildProps(g, lots, mats.lib, new Rng(seed));
  return { ...out, ...mats };
}

// ---------------------------------------------------------------- helpers

const circles = (cs: StaticCollider[]) => cs.filter((c) => c.shape.kind === 'circle');
const polygons = (cs: StaticCollider[]) => cs.filter((c) => c.shape.kind === 'polygon');
const segments = (cs: StaticCollider[]) => cs.filter((c) => c.shape.kind === 'segment');
const poles = (cs: StaticCollider[]) => circles(cs).filter((c) => (c.shape as Circle).r === 0.25);

/** Block curb is an axis-aligned rectangle, so inside-or-on is a simple range test. */
const onOrInsideCurb = (p: Vec2, eps = 1e-6): boolean => p.x >= -eps && p.x <= 60 + eps && p.z >= -eps && p.z <= 100 + eps;

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

function faceOfPole(p: Vec2): BlockFace {
  let best = faces[0], bd = Infinity;
  for (const f of faces) {
    const d = distToSegment(p, f.curbA, f.curbB);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

const meshes = (g: THREE.Group): THREE.Mesh[] => g.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];

// ---------------------------------------------------------------- tests

describe('buildProps', () => {
  it('returns a group and colliders', () => {
    const { group, colliders } = build();
    expect(group).toBeInstanceOf(THREE.Group);
    expect(colliders.length).toBeGreaterThan(0);
  });

  it('puts at least two poles on each street-class face and none on avenue faces', () => {
    const { colliders } = build();
    const byFace: Record<string, number> = { N: 0, E: 0, S: 0, W: 0 };
    for (const c of poles(colliders)) {
      const f = faceOfPole(c.pos);
      byFace[f.side]++;
      // 0.5 m in from the curb line
      expect(distToSegment(c.pos, f.curbA, f.curbB)).toBeCloseTo(0.5, 1);
    }
    expect(byFace.N).toBeGreaterThanOrEqual(2); // Kosciuszko St
    expect(byFace.W).toBeGreaterThanOrEqual(2); // Hart St
    expect(byFace.E).toBe(0);                   // Throop Ave
    expect(byFace.S).toBe(0);                   // Lewis Ave
  });

  it('has a wire mesh with vertices, sagging below the crossarm height', () => {
    const { group } = build();
    const wires = group.children.find((c) => c.name === 'props:wires') as THREE.Mesh | undefined;
    expect(wires).toBeDefined();
    const pos = wires!.geometry.getAttribute('position');
    expect(pos.count).toBeGreaterThan(0);
    wires!.geometry.computeBoundingBox();
    const bb = wires!.geometry.boundingBox!;
    expect(bb.max.y).toBeLessThan(9);
    expect(bb.max.y).toBeGreaterThan(7.5);
    expect(bb.min.y).toBeGreaterThan(5); // service drops end at ~6 m
  });

  it('every collider lies inside or on the block curb polygon', () => {
    const { colliders } = build();
    for (const c of colliders) {
      const s = c.shape;
      if (s.kind === 'circle') expect(onOrInsideCurb(c.pos)).toBe(true);
      else if (s.kind === 'polygon') for (const p of (s as Polygon).points) expect(onOrInsideCurb(p)).toBe(true);
      else if (s.kind === 'segment') { expect(onOrInsideCurb((s as Segment).a)).toBe(true); expect(onOrInsideCurb((s as Segment).b)).toBe(true); }
    }
  });

  it('keeps all colliders inside the grid bounds with finite numbers', () => {
    const { colliders } = build();
    const b = grid.bounds;
    const chk = (p: Vec2) => {
      expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(b.minX); expect(p.x).toBeLessThanOrEqual(b.maxX);
      expect(p.z).toBeGreaterThanOrEqual(b.minZ); expect(p.z).toBeLessThanOrEqual(b.maxZ);
    };
    for (const c of colliders) {
      chk(c.pos);
      if (c.shape.kind === 'polygon') c.shape.points.forEach(chk);
      if (c.shape.kind === 'segment') { chk(c.shape.a); chk(c.shape.b); }
    }
  });

  it('has no NaN in any mesh position attribute', () => {
    const { group } = build();
    for (const m of meshes(group)) {
      const arr = m.geometry.getAttribute('position').array;
      expect(arr.length).toBeGreaterThan(0);
      for (let i = 0; i < arr.length; i++) if (Number.isNaN(arr[i])) throw new Error(`NaN in ${m.name} at ${i}`);
    }
  });

  it('merges to at most 15 meshes (plus at most 10 street-clutter buckets)', () => {
    const { group } = build();
    const all = meshes(group);
    expect(all.filter((m) => !/^props:(clutter-|wiresClutter)/.test(m.name)).length).toBeLessThanOrEqual(15);
    expect(all.filter((m) => /^props:(clutter-|wiresClutter)/.test(m.name)).length).toBeLessThanOrEqual(10);
    expect(meshes(group).length).toBeGreaterThan(0);
  });

  it('puts a billboard (frame legs + parody sign mesh) on the avenue-facing end wall of the corner apartment', () => {
    const { group, colliders, signCalls } = build();
    expect(signCalls.length).toBeGreaterThanOrEqual(1);
    const texts = BILLBOARD_TEXTS.map((t) => t.text);
    for (const [text] of signCalls) expect(texts).toContain(text);
    const signMesh = group.children.find((c) => c.name.startsWith('props:sign:')) as THREE.Mesh;
    expect(signMesh).toBeDefined();
    signMesh.geometry.computeBoundingBox();
    const bb = signMesh.geometry.boundingBox!;
    expect(bb.max.x - bb.min.x).toBeLessThan(0.5);  // wall parallel to Throop (north-south) so the board is thin in x
    expect(bb.max.z - bb.min.z).toBeCloseTo(6, 1);
    expect(bb.max.y - bb.min.y).toBeCloseTo(3, 1);
    expect(bb.min.y).toBeCloseTo(4, 1);
    const legs = polygons(colliders).filter((c) => (c.id ?? '').startsWith('billboard-'));
    expect(legs.length).toBe(2 * (group.userData.counts.billboards as number));
  });

  it('fences the sides and rear of the vacant lot and hoards the scaffold lot', () => {
    const { colliders, group } = build();
    const seg = segments(colliders);
    expect(seg.filter((c) => (c.id ?? '').startsWith('w-vac-fence')).length).toBe(3);
    expect(seg.filter((c) => c.id === 'n-scaf-hoarding').length).toBe(1);
    expect(group.children.some((c) => c.name === 'props:chainlink')).toBe(true);
    expect(group.children.some((c) => c.name === 'props:scaffold')).toBe(true);
  });

  it('drops traffic cones near an intersection of each avenue', () => {
    const { group } = build();
    expect(group.userData.counts.cones).toBeGreaterThanOrEqual(4);
    expect(group.children.some((c) => c.name === 'props:cone')).toBe(true);
  });

  it('piles trash bags in front of brownstones on some seeds', () => {
    let seen = 0;
    for (let seed = 1; seed <= 10; seed++) seen += (build(seed).group.userData.counts.bagPiles as number) ?? 0;
    expect(seen).toBeGreaterThan(0);
  });

  it('places dumpsters (1.8 x 1.2 footprint) in front of mixed-use lots on some seeds', () => {
    let found: Polygon | null = null;
    for (let seed = 1; seed <= 40 && !found; seed++) {
      const { colliders } = build(seed, [...LOTS, ...MANY_MIXED]);
      const d = polygons(colliders).find((c) => (c.id ?? '').startsWith('dumpster-'));
      if (d) found = d.shape as Polygon;
    }
    expect(found).not.toBeNull();
    const pts = found!.points;
    expect(pts.length).toBe(4);
    const e0 = Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z);
    const e1 = Math.hypot(pts[2].x - pts[1].x, pts[2].z - pts[1].z);
    expect([e0, e1].sort((a, b) => a - b)[0]).toBeCloseTo(1.2, 5);
    expect([e0, e1].sort((a, b) => a - b)[1]).toBeCloseTo(1.8, 5);
    // clockwise as seen from above (x east, z south): positive shoelace area
    let area = 0;
    for (let i = 0; i < 4; i++) { const p = pts[i], q = pts[(i + 1) % 4]; area += p.x * q.z - q.x * p.z; }
    expect(area).toBeGreaterThan(0);
  });

  it('draws graffiti decals (library `graffiti` key, one quad per tag) on the wall beside the vacant lot', () => {
    let tags = 0;
    for (let seed = 1; seed <= 10; seed++) tags += (build(seed).group.userData.counts.graffiti as number) ?? 0;
    expect(tags).toBeGreaterThan(0);
    const { group } = build();
    const decals = meshes(group).filter((x) => x.name.startsWith('props:graffiti'));
    expect(decals.length).toBeGreaterThan(0);
    expect(decals.length).toBeLessThanOrEqual(5); // merged per texture variant
    expect(build().requested).toContain('graffiti');
  });

  it('is deterministic for a given seed', () => {
    const sig = (seed: number) => {
      const { group, colliders } = build(seed);
      const sums = meshes(group).map((m) => {
        const a = m.geometry.getAttribute('position').array;
        let t = 0;
        for (let i = 0; i < a.length; i++) t += a[i] * ((i % 7) + 1);
        return `${m.name}:${a.length}:${t.toFixed(4)}`;
      });
      return JSON.stringify([colliders, sums]);
    };
    expect(sig(7)).toBe(sig(7));
    expect(sig(7)).not.toBe(sig(8));
  });

  it('uses the expected material keys', () => {
    const { requested } = build();
    for (const key of ['treeTrunk', 'metalDark', 'metalGreen', 'chainlink', 'scaffold']) expect(requested).toContain(key);
  });
});
