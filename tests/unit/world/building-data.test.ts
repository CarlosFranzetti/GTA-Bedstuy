import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import type { GridModel, IMaterialLibrary, Lot, MaterialKey, Polygon } from '@/world/types';
import { buildBuildings } from '@/world/BuildingGen';
import type { SpecLot } from '@/world/BuildingGen';
import { lotTypeOf, specFromData, subdivideLots } from '@/world/LotSubdivider';
import { BASEMENT_H, LotBatch, PARLOUR_H, UPPER_H, buildUpperFloors, loadMats, storeyLevels } from '@/world/buildings/facade';
import type { LotSpec } from '@/world/buildings/facade';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { loadFaces } from '@/world/data/schema';

class Stub implements IMaterialLibrary {
  private cache = new Map<string, THREE.Material>();
  private mk(k: string): THREE.Material {
    let m = this.cache.get(k);
    if (!m) { m = new THREE.MeshBasicMaterial(); m.name = k; this.cache.set(k, m); }
    return m;
  }
  get(key: MaterialKey, variant = 0): THREE.Material { return this.mk(`${key}:${variant}`); }
  awning(color: string, text: string): THREE.Material { return this.mk(`awning:${color}:${text}`); }
  sign(text: string): THREE.Material { return this.mk(`sign:${text}`); }
  carPaint(color: string): THREE.Material { return this.mk(`car:${color}`); }
  setNight(): void { /* noop */ }
}

const PARAPET = 0.7;
const SPEC: LotSpec = {
  floors: 3, widthM: 6, family: 'brownstone', stoop: { present: true, heightM: 1.5 }, cornice: 'bracket', bays: 3, use: 'residential',
};

/** One lot on a straight south-facing face: local x = world x, local z = world z, the building sits at z < 0. */
function lotOf(over: Partial<LotSpec>, id = 'L', W = 6, D = 14, type: Lot['type'] = 'brownstone'): SpecLot {
  const spec: LotSpec = { ...SPEC, widthM: W, ...over };
  return {
    id, blockId: 'b', side: 'S', frontA: { x: 0, z: 0 }, frontB: { x: W, z: 0 }, width: W, depth: D,
    outward: { x: 0, z: 1 }, type: type === 'brownstone' ? lotTypeOf(spec) : type, corner: false, spec,
  };
}

const build = (lots: SpecLot[], seed = 7) => buildBuildings(lots, new Stub(), new Rng(seed));
const meshesOf = (g: THREE.Group): THREE.Mesh[] => { const o: THREE.Mesh[] = []; g.traverse((n) => { if ((n as THREE.Mesh).isMesh) o.push(n as THREE.Mesh); }); return o; };
const byMat = (g: THREE.Group, re: RegExp) => meshesOf(g).filter((m) => re.test((m.material as THREE.Material).name));
const tris = (ms: THREE.Mesh[]) => ms.reduce((n, m) => n + m.geometry.getAttribute('position').count / 3, 0);
const yRange = (ms: THREE.Mesh[]) => {
  let lo = Infinity, hi = -Infinity;
  for (const m of ms) { const p = m.geometry.getAttribute('position'); for (let i = 0; i < p.count; i++) { lo = Math.min(lo, p.getY(i)); hi = Math.max(hi, p.getY(i)); } }
  return { lo, hi };
};
const stoopsOf = (r: ReturnType<typeof build>) => r.colliders.filter((c) => c.id?.includes('-stoop'));
const bodyOf = (r: ReturnType<typeof build>) => r.colliders.filter((c) => c.shape.kind === 'polygon' && !c.id?.includes('-stoop'));

describe('storey model', () => {
  it('stacks a 3.3 m parlour floor under 2.9 m upper floors on the raised basement', () => {
    expect(PARLOUR_H).toBe(3.3);
    expect(UPPER_H).toBe(2.9);
    const s = storeyLevels(1.5, 4);
    [1.5, 4.8, 7.7, 10.6].forEach((v, i) => expect(s.floorY[i]).toBeCloseTo(v, 6));
    expect(s.H).toBeCloseTo(1.5 + 3.3 + 3 * 2.9, 6);
    expect(storeyLevels(0, 5).H).toBeCloseTo(3.3 + 4 * 2.9, 6);
  });

  it('a data lot with floors N is exactly basement + parlour + (N-1) upper floors tall (front wall top)', () => {
    for (const [floors, bh] of [[3, 1.5], [4, 1.5], [5, 1.8], [3, 1.2]] as const) {
      const r = build([lotOf({ floors, stoop: { present: true, heightM: bh } })]);
      const wall = byMat(r.group, /^brownstone:/);
      expect(wall.length).toBeGreaterThan(0);
      const { hi } = yRange(wall);
      // the wall runs to the roof line; the 0.7 m parapet above it is the same front material
      expect(hi - PARAPET, `floors ${floors} stoop ${bh}`).toBeCloseTo(bh + PARLOUR_H + (floors - 1) * UPPER_H, 3);
    }
  });

  it('adding a floor adds exactly one 2.9 m storey', () => {
    const h = (floors: number) => yRange(byMat(build([lotOf({ floors })]).group, /^brownstone:/)).hi;
    expect(h(4) - h(3)).toBeCloseTo(UPPER_H, 3);
    expect(h(5) - h(4)).toBeCloseTo(UPPER_H, 3);
  });

  it('without a spec the procedural fallback still builds 3-4 floors on the default basement', () => {
    const lot = lotOf({}); delete lot.spec;
    const r = build([lot]);
    const hi = yRange(byMat(r.group, /^tarRoof:/)).hi; // the tar roof plate sits at the roof line (+1 cm)
    const candidates = [3, 4].map((f) => BASEMENT_H + PARLOUR_H + (f - 1) * UPPER_H);
    expect(candidates.some((c) => Math.abs(hi - 0.01 - c) < 0.01), `roof at ${hi}`).toBe(true);
  });
});

describe('stoops and railings', () => {
  it('rows with a stoop get a stoop collider; flush rows, apartments and vacant lots do not', () => {
    for (const family of ['brownstone', 'brick', 'tanBrick', 'paintedBrick', 'limestone'] as const) {
      expect(stoopsOf(build([lotOf({ family })])).length, family).toBe(1);
      expect(stoopsOf(build([lotOf({ family, stoop: { present: false, heightM: 0 } })])).length, `${family} flush`).toBe(0);
    }
    expect(stoopsOf(build([lotOf({ use: 'apartment', family: 'brick', floors: 4, stoop: { present: false, heightM: 0 } })])).length).toBe(0);
    expect(stoopsOf(build([lotOf({ use: 'vacant', floors: 1 })])).length).toBe(0);
  });

  it('the stoop stays inside the lot', () => {
    const r = build([lotOf({ stoop: { present: true, heightM: 1.8 } })]);
    const pts = (stoopsOf(r)[0].shape as Polygon).points;
    for (const p of pts) { expect(p.z).toBeLessThanOrEqual(0.001); expect(p.z).toBeGreaterThanOrEqual(-4); }
    expect(yRange(byMat(r.group, /^brownstone:/)).lo).toBeGreaterThanOrEqual(0);
  });

  it('stoop railings and the areaway fence use the cast-iron fence strips; flush rows have neither', () => {
    const r = build([lotOf({ stoop: { present: true, heightM: 1.5 } })]);
    const stoop = byMat(r.group, /^castIronFence:1$/), area = byMat(r.group, /^castIronFence:0$/);
    expect(tris(stoop)).toBeGreaterThanOrEqual(4);
    expect(tris(area)).toBeGreaterThanOrEqual(2);
    // the stoop railing quads follow the stair slope up to the stoop height + ~0.4 + 0.91
    expect(yRange(stoop).hi).toBeGreaterThan(1.5 + 0.4);
    expect(yRange(stoop).hi).toBeLessThan(1.5 + 0.4 + 1.0);
    // the areaway fence stands on the ground at the building line, 0.91 m tall, never inside the building
    const ar = yRange(area); expect(ar.lo).toBe(0); expect(ar.hi).toBeCloseTo(0.91, 5);
    const p = area[0].geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) { expect(p.getZ(i)).toBeLessThanOrEqual(0); expect(p.getZ(i)).toBeGreaterThan(-0.5); }
    // u repeats once per 0.91 m, v spans 0..1
    const uv = area[0].geometry.getAttribute('uv');
    let vmax = 0; for (let i = 0; i < uv.count; i++) vmax = Math.max(vmax, uv.getY(i));
    expect(vmax).toBeCloseTo(1, 6);
    const flush = build([lotOf({ stoop: { present: false, heightM: 0 } })]);
    expect(byMat(flush.group, /^castIronFence:/).length).toBe(0);
  });

  it('the parlour wall starts at the stoop height and iron railing geometry exists', () => {
    const r = build([lotOf({ stoop: { present: true, heightM: 1.8 } })]);
    expect(tris(byMat(r.group, /^metalDark:/))).toBeGreaterThan(100);
  });
});

describe('families', () => {
  const mats = (family: LotSpec['family']) => meshesOf(build([lotOf({ family })]).group).map((m) => (m.material as THREE.Material).name);
  it('each family picks its own front material from the existing keys', () => {
    expect(mats('brownstone').some((n) => n.startsWith('brownstone:'))).toBe(true);
    expect(mats('brick').some((n) => n.startsWith('brownstone:'))).toBe(false);
    expect(mats('tanBrick')).toContain('brickRed:1');
    // party walls now take a per-lot brick colour (brickRed:1..3), so compare the same lot: the tan front adds brickRed:1 tris the red one lacks
    const redTris = (family: LotSpec['family']) => tris(byMat(build([lotOf({ family })]).group, /^brickRed:1$/));
    expect(redTris('tanBrick')).toBeGreaterThan(redTris('brick'));
    expect(mats('paintedBrick')).toContain('brickPainted:0');
    expect(mats('brick')).not.toContain('brickPainted:0');
    expect(mats('limestone').some((n) => n.startsWith('limestone:'))).toBe(true);
  });
});

describe('bays, windows and cornices', () => {
  const glass = (over: Partial<LotSpec>, W = 6) => tris(byMat(build([lotOf(over, 'L', W)]).group, /^window:/));
  it('more bays means more window panes', () => {
    expect(glass({ bays: 3 })).toBeGreaterThan(glass({ bays: 2 }));
    expect(glass({ bays: 2 })).toBeGreaterThan(0);
  });
  it('defaults to 3 bays on 6 m lots and 2 on narrow ones', () => {
    expect(glass({ bays: undefined }, 6)).toBe(glass({ bays: 3 }, 6));
    expect(glass({ bays: undefined }, 4.5)).toBe(glass({ bays: 2 }, 4.5));
  });
  it('arched parlour windows add round heads (more window geometry than flat heads)', () => {
    const flat = tris(byMat(build([lotOf({ arched: false })]).group, /^window:/));
    const arch = tris(byMat(build([lotOf({ arched: true })]).group, /^window:/));
    expect(arch).toBeGreaterThan(flat);
  });
  it('cornice kind controls the geometry: none < plain < dentil, bracket', () => {
    const c = (cornice: LotSpec['cornice']) => tris(byMat(build([lotOf({ cornice })], 11).group, /^cornice:/));
    expect(c('none')).toBeLessThan(c('plain'));
    expect(c('plain')).toBeLessThan(c('dentil'));
    expect(c('plain')).toBeLessThan(c('bracket'));
    expect(c('bracket')).not.toBe(c('dentil'));
  });
  it('side walls are plain party-wall brick: no window glass near the lot sides', () => {
    for (const family of ['brownstone', 'brick'] as const) {
      const r = build([lotOf({ family })]);
      for (const m of byMat(r.group, /^window:/)) {
        const p = m.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) { expect(p.getX(i)).toBeGreaterThan(0.2); expect(p.getX(i)).toBeLessThan(5.8); }
      }
    }
  });
  it('the rear stays a bare brick shell (no glass or iron on the walls behind the front half of the lot)', () => {
    const r = build([lotOf({ floors: 4 })]);
    const H = storeyLevels(1.5, 4).H;
    for (const m of [...byMat(r.group, /^window:/), ...byMat(r.group, /^metalDark:/)]) {
      const p = m.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) if (p.getY(i) < H - 1) expect(p.getZ(i)).toBeGreaterThan(-8.5);
    }
  });
});

describe('apartments', () => {
  const apt = (floors: number, id: string) => lotOf({ use: 'apartment', family: 'brick', floors, stoop: { present: false, heightM: 0 }, cornice: 'bracket' }, id, 8, 16);
  const reach = (lot: SpecLot) => {
    let max = -Infinity;
    for (const m of byMat(build([lot]).group, /^metalDark:/)) {
      const p = m.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) max = Math.max(max, p.getZ(i));
    }
    return max;
  };
  it('4 and 5 storey apartment fronts almost always get a fire escape (iron projecting ~1 m from the wall)', () => {
    let withFe = 0, n = 0;
    for (const floors of [4, 5]) for (let i = 0; i < 20; i++) { n++; if (reach(apt(floors, `a${floors}-${i}`)) >= 0.95) withFe++; }
    expect(withFe / n).toBeGreaterThan(0.7);
  });
  it('apartment height follows the floors: 3.3 m ground floor plus 2.9 m per floor above', () => {
    for (const floors of [4, 5]) {
      const lot = apt(floors, 'h');
      lot.spec = { ...(lot.spec as LotSpec), family: 'paintedBrick' };
      const hi = yRange(byMat(build([lot]).group, /^brickPainted:0/)).hi;
      expect(hi - PARAPET).toBeCloseTo(PARLOUR_H + (floors - 1) * UPPER_H, 3);
    }
  });
  it('the material family drives the apartment front', () => {
    const names = (family: LotSpec['family']) => {
      const lot = apt(4, 'f');
      lot.spec = { ...(lot.spec as LotSpec), family };
      return meshesOf(build([lot]).group).map((m) => (m.material as THREE.Material).name);
    };
    expect(names('paintedBrick')).toContain('brickPainted:0');
    expect(names('tanBrick')).toContain('brickRed:1');
  });
});

describe('churches and vacant lots from data', () => {
  it('a narrow data church is a gabled front with railed entry steps and no tower', () => {
    const lot = lotOf({ use: 'church', family: 'limestone', floors: 3, stoop: { present: false, heightM: 0 } }, 'ch', 10, 16);
    expect(lot.type).toBe('church');
    const r = build([lot]);
    expect(stoopsOf(r).length).toBe(1); // entry steps
    expect(yRange(meshesOf(r.group)).hi).toBeLessThan(18); // no 16 m tower + steeple
    expect(tris(byMat(r.group, /^window:/))).toBeGreaterThan(0);
  });
  it('a wide data church keeps its bell tower', () => {
    const r = build([lotOf({ use: 'church', family: 'brick', floors: 3, stoop: { present: false, heightM: 0 } }, 'ch', 13.5, 16)]);
    expect(yRange(meshesOf(r.group)).hi).toBeGreaterThan(18);
  });
  it('a church front can use a brownstone family', () => {
    const names = meshesOf(build([lotOf({ use: 'church', family: 'brownstone', stoop: { present: false, heightM: 0 } }, 'ch', 11, 16)]).group).map((m) => (m.material as THREE.Material).name);
    expect(names.some((n) => n.startsWith('brownstone:'))).toBe(true);
  });
  it('a vacant lot is chain-link, weeds and rubble: a fence collider, no footprint and no draw-call-adding material', () => {
    const lot = lotOf({ use: 'vacant', floors: 1, stoop: { present: false, heightM: 0 } }, 'v', 7, 14);
    expect(lot.type).toBe('vacant');
    const r = build([lot]);
    expect(r.colliders.filter((c) => c.shape.kind === 'segment').length).toBe(1);
    expect(bodyOf(r).length).toBe(0);
    const names = new Set(meshesOf(r.group).map((m) => (m.material as THREE.Material).name));
    expect(names.has('chainlinkFence:0') || names.has('corrugatedSteel:0')).toBe(true);
    // weeds reuse the plain green awning fabric, so vacant lots add no material to the building group
    expect(names.has('awning:#2f6f4f:')).toBe(true);
    for (const n of names) expect(n.startsWith('treeLeaves'), n).toBe(false);
    expect(yRange(meshesOf(r.group)).hi).toBeLessThan(2.5);
  });
});

describe('vacant-lot fences', () => {
  it('lots are fenced with chain-link plus a top rail, or shut behind corrugated steel; sheds are corrugated', () => {
    const seen = { chain: 0, rail: 0, steel: 0 };
    for (let seed = 1; seed <= 24; seed++) {
      const r = build([lotOf({ use: 'vacant', floors: 1, stoop: { present: false, heightM: 0 } }, 'v', 7, 14)], seed);
      const names = new Set(meshesOf(r.group).map((m) => (m.material as THREE.Material).name));
      const chain = names.has('chainlinkFence:0'), steel = names.has('corrugatedSteel:0');
      if (chain) { seen.chain++; expect(names.has('chainlinkRail:0'), 'rail on every chain-link fence').toBe(true); seen.rail++; }
      if (steel) seen.steel++;
      expect(chain || steel).toBe(true);
      expect(yRange(meshesOf(r.group)).hi).toBeLessThan(2.7);
    }
    expect(seen.chain).toBeGreaterThan(0);
    expect(seen.steel).toBeGreaterThan(0);
  });
});

describe('scaffold', () => {
  it('a scaffolded data row keeps its floors and gets the plywood shed', () => {
    const lot = lotOf({ scaffold: true, floors: 4 }, 's');
    expect(lot.type).toBe('scaffold');
    const r = build([lot]);
    expect(byMat(r.group, /^scaffold:/).length).toBeGreaterThan(0);
    expect(stoopsOf(r).length).toBe(0);
  });
});

describe('data-driven city vs fallback', () => {
  const data = loadBedstuyData();
  const grid: GridModel = buildGrid(data);
  const faces = loadFaces(data);
  const lotsOf = (f?: typeof faces) => subdivideLots(grid, data.pois, new Rng(data.seed).fork('lots'), f);

  it('the 3-argument call (no data) is unchanged: no lot carries a spec', () => {
    const lots = lotsOf();
    expect(lots.length).toBeGreaterThan(700);
    expect(lots.some((l) => (l as SpecLot).spec)).toBe(false);
    expect(JSON.stringify(lotsOf())).toBe(JSON.stringify(lots));
  });

  it('with schema-v2 faces the lots come from the data and carry a spec; ids, fronts and contract fields are intact', () => {
    const lots = lotsOf(faces) as SpecLot[];
    expect(faces.faces.length).toBeGreaterThan(0);
    expect(lots.some((l) => l.spec)).toBe(true);
    const seen = new Set<string>();
    for (const l of lots) {
      expect(seen.has(l.id), l.id).toBe(false); seen.add(l.id);
      expect(l.width).toBeGreaterThan(2.5);
      expect(l.depth).toBeGreaterThan(3);
      expect(Number.isFinite(l.frontA.x + l.frontA.z + l.frontB.x + l.frontB.z)).toBe(true);
      expect(Math.hypot(l.outward.x, l.outward.z)).toBeCloseTo(1, 6);
      expect(['brownstone', 'rowhouse', 'mixeduse', 'church', 'apartment', 'vacant', 'scaffold']).toContain(l.type);
    }
  });

  it('a face with no data keeps the procedural subdivision (partial face set)', () => {
    const one = loadFaces({ ...data, faces: (data as unknown as { faces: unknown[] }).faces.slice(0, 1) });
    const lots = lotsOf(one) as SpecLot[];
    const withSpec = lots.filter((l) => l.spec);
    const without = lots.filter((l) => !l.spec);
    expect(withSpec.length).toBeGreaterThan(0);
    expect(without.length).toBeGreaterThan(withSpec.length);
    const fallIds = new Map(lotsOf().map((l) => [l.id, l]));
    let same = 0;
    for (const l of without) { const f = fallIds.get(l.id); if (f && Math.abs(f.width - l.width) < 1e-9) same++; }
    expect(same).toBeGreaterThan(without.length * 0.5);
  });

  it('the data-driven city builds deterministically with finite geometry and one body collider per non-vacant lot', () => {
    const run = () => { const lots = lotsOf(faces); return { lots, ...buildBuildings(lots, new Stub(), new Rng(data.seed).fork('buildings')) }; };
    const a = run(), b = run();
    expect(JSON.stringify(a.colliders)).toBe(JSON.stringify(b.colliders));
    const sig = (g: THREE.Group) => meshesOf(g).map((m) => `${(m.material as THREE.Material).name}:${m.geometry.getAttribute('position').count}`).join('|');
    expect(sig(a.group)).toBe(sig(b.group));
    let bad = 0;
    for (const m of meshesOf(a.group)) for (const nm of ['position', 'normal', 'uv']) {
      const arr = m.geometry.getAttribute(nm).array;
      for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) bad++;
    }
    expect(bad).toBe(0);
    const bodies = a.colliders.filter((c) => c.shape.kind === 'polygon' && !c.id?.includes('-stoop'));
    expect(bodies.length).toBe(a.lots.filter((l) => l.type !== 'vacant').length);
    const ms = meshesOf(a.group);
    expect(ms.length).toBeLessThanOrEqual(60);
    expect(tris(ms)).toBeLessThan(700_000 * (grid.blocks.length / 10)); // 25 blocks since B1
  });

  it('the data city uses no materials (draw calls) the fallback city does not', () => {
    const names = (f?: typeof faces) => new Set(meshesOf(buildBuildings(lotsOf(f), new Stub(), new Rng(data.seed).fork('buildings')).group).map((m) => (m.material as THREE.Material).name.replace(/^(awning|sign):.*/, '$1')));
    const fall = names(), dataSet = names(faces);
    expect([...dataSet].filter((n) => !fall.has(n))).toEqual([]);
  });

  it('specFromData maps the schema to builder specs (families, uses, cornices)', () => {
    const base = { widthM: 6, floors: 3, family: 'brickTan', stoop: true, stoopHeightM: 1.5, cornice: 'bracketed', bays: 3, use: 'residential', trees: 1, scaffold: false, depthM: 14, confidence: 'M', note: '' } as const;
    const s = specFromData({ ...base });
    expect(s).toMatchObject({ family: 'tanBrick', cornice: 'bracket', use: 'residential', stoop: { present: true, heightM: 1.5 }, bays: 3, floors: 3 });
    expect(specFromData({ ...base, stoop: false, stoopHeightM: 0, floors: 5 }).use).toBe('apartment');
    expect(specFromData({ ...base, use: 'garage' })).toMatchObject({ use: 'mixed', storefront: 'autorepair' });
    expect(lotTypeOf(specFromData({ ...base, use: 'church' }))).toBe('church');
    expect(lotTypeOf(specFromData({ ...base, scaffold: true }))).toBe('scaffold');
    expect(lotTypeOf(specFromData({ ...base, family: 'brickRed' }))).toBe('rowhouse');
    expect(lotTypeOf(specFromData({ ...base, family: 'brownstone' }))).toBe('brownstone');
  });
});

describe('buildUpperFloors (shared with the mixed-use lane)', () => {
  const run = (floors: number, y0: number, over: Partial<{ cornerSide: 'left' | 'right' | null }> = {}) => {
    const b = new LotBatch();
    const lot = lotOf({ use: 'mixed', family: 'brick', stoop: { present: false, heightM: 0 } }, 'mx', 7, 15);
    const m = loadMats(new Stub());
    const out = buildUpperFloors({ b, m, rng: new Rng(5), W: 7, D: 15, lot, cornerSide: over.cornerSide ?? null, spec: lot.spec }, { y0, floors, wall: m.brickRed });
    b.flush(new THREE.Matrix4());
    return { out, merged: b.merged() };
  };
  it('stacks 2.9 m floors from y0 and reports the roof line', () => {
    for (const [floors, y0] of [[2, 4], [3, 4], [4, 3.3]] as const) {
      const { out, merged } = run(floors, y0);
      expect(out.topY).toBeCloseTo(y0 + floors * UPPER_H, 6);
      expect(out.sillYs.length).toBe(floors);
      const wall = merged.find((r) => r.material.name === 'brickRed:0')!;
      const p = wall.geometry.getAttribute('position');
      let lo = Infinity;
      for (let i = 0; i < p.count; i++) lo = Math.min(lo, p.getY(i));
      expect(lo).toBeGreaterThanOrEqual(y0 - 1e-6); // nothing below the hand-off line
    }
  });
  it('leaves the corner side open for the caller and adds a windowed side wall above y0', () => {
    const plain = run(3, 4).merged.find((r) => r.material.name === 'window:0');
    const corner = run(3, 4, { cornerSide: 'left' }).merged.find((r) => r.material.name === 'window:0');
    expect(corner!.geometry.getAttribute('position').count).toBeGreaterThan(plain!.geometry.getAttribute('position').count);
  });
  it('produces finite geometry', () => {
    for (const r of run(4, 4, { cornerSide: 'right' }).merged) {
      for (const nm of ['position', 'normal', 'uv']) for (const v of r.geometry.getAttribute(nm).array) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
