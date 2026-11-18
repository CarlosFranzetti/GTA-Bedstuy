import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync, readdirSync } from 'node:fs';
import { Rng } from '@/core/Rng';
import { PED_SPECS, registerSpec, type PedSpec } from '@/textures/painters/ped';
import { BASE_TOPS, BOTTOMS, COLOURWAYS, LAYERS, ONE_PIECE, SHOES, WARDROBE_COUNTS, composeSpec, dress, pickWardrobeVariant, resetWardrobe, setWardrobeCap, setWardrobeSeason, wardrobeAlive, type Look, type Season } from '@/textures/painters/pedWardrobe';
import { BODY_POOLS, BODY_TYPES, type BodyTypeId } from '@/entities/models/pedBodyTypes';
import { pickPedVariant } from '@/entities/models/pedBody';
import { buildMhPedModel, clearPeople, parseShape, registerShape } from '@/entities/models/pedMesh';
import { SHOE_IDS } from '@/entities/models/pedShoes';
import type { IMaterialLibrary } from '@/world/types';

const DIR = 'src/assets/models/people/';
const materials = { get: () => new THREE.MeshStandardMaterial() } as unknown as IMaterialLibrary;
beforeAll(async () => {
  clearPeople();
  for (const f of readdirSync(DIR).filter((n) => n.endsWith('.glb'))) { const b = readFileSync(DIR + f); registerShape(await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)); }
});

const GROUPS = ['ba', 'ca', 'la', 'wh', 'ea', 'sa', 'me', 'mx'] as const;
const WHO = [{ sex: 'm', age: 'adult' }, { sex: 'f', age: 'adult' }, { sex: 'm', age: 'old' }, { sex: 'f', age: 'old' }, { sex: 'm', age: 'teen' }, { sex: 'f', age: 'teen' }, { sex: 'x', age: 'adult' }, { sex: 'm', age: 'kid' }] as const;
const sample = (n: number, opts: { season?: Season; look?: Look } = {}): PedSpec[] => {
  const out: PedSpec[] = [];
  for (let i = 0; i < n; i++) out.push(composeSpec(i * 7919 + 13, { group: GROUPS[i % GROUPS.length], ...WHO[i % WHO.length] }, opts));
  return out;
};

describe('PEOPLE6 wardrobe: slots, pools and rules', () => {
  it('the catalogue has real choice in every slot', () => {
    const c = WARDROBE_COUNTS();
    expect(c.tops).toBeGreaterThanOrEqual(26);
    expect(c.bottoms).toBeGreaterThanOrEqual(20);
    expect(c.shoes).toBeGreaterThanOrEqual(11);
    expect(c.onePieces).toBeGreaterThanOrEqual(6);
    for (const id of SHOE_IDS) expect(Object.values(SHOES).some((g) => g.p.kind === id), id).toBe(true);
    for (const g of [...Object.values(BASE_TOPS), ...Object.values(LAYERS), ...Object.values(BOTTOMS), ...Object.values(SHOES)]) expect(COLOURWAYS[g.c], g.c).toBeTruthy();
    for (const o of Object.values(ONE_PIECE)) expect(COLOURWAYS[o.c], o.c).toBeTruthy();
  });

  it('the same seed is always the same person, a different seed another', () => {
    const a = composeSpec(1234, { group: 'ba', sex: 'f', age: 'adult' }), b = composeSpec(1234, { group: 'ba', sex: 'f', age: 'adult' });
    expect(a).toEqual(b);
    expect(composeSpec(1235, { group: 'ba', sex: 'f', age: 'adult' }).id).not.toBe(a.id);
    const ids = PED_SPECS.slice(0, 3).map((s) => s.id);
    const r = (): number[] => { resetWardrobe(); setWardrobeCap(500); const o: number[] = []; for (let i = 0; i < 12; i++) { const rng = new Rng(Rng.hash('ped-' + i)); o.push(pickWardrobeVariant(rng, pickPedVariant(rng), false)); } return o; };
    expect(ids.length).toBe(3);
    const x = r().map((v) => PED_SPECS[v].id), y = r().map((v) => PED_SPECS[v].id);
    expect(x).toEqual(y);
    setWardrobeCap(null);
  });

  it('draws a wide variety: 300 seeds make at least 280 different people, using every garment of the pools', () => {
    const specs = sample(300), ids = new Set(specs.map((s) => s.id));
    expect(ids.size).toBeGreaterThanOrEqual(280);
    const tops = new Set(specs.map((s) => `${s.top.kind}/${s.top.style ?? ''}`)), bottoms = new Set(specs.map((s) => `${s.bottom.kind}/${s.bottom.cut ?? ''}`)), shoes = new Set(specs.map((s) => s.shoes.kind));
    expect(tops.size).toBeGreaterThanOrEqual(16);
    expect(bottoms.size).toBeGreaterThanOrEqual(14);
    expect(shoes.size).toBeGreaterThanOrEqual(10);
    expect(new Set(specs.map((s) => s.body)).size).toBeGreaterThanOrEqual(14);
  });

  it('the rules hold: no sandals in the cold, no tie with a hood, a pencil skirt only on a dress top, nothing lettered', () => {
    for (const season of ['cold', 'mild', 'warm'] as const) {
      for (const s of sample(240, { season })) {
        if (season === 'cold') expect(['sandal', 'slide'], s.id).not.toContain(s.shoes.kind);
        if (s.hat === 'hood' || s.hat === 'hoodDown') expect(s.top.tie, s.id).toBeUndefined();
        if (s.top.kind === 'dress') expect(s.bottom.kind).toBe('skirt');
        expect(['none', 'stripes'], s.id).toContain(s.top.print);
        expect(s.top.printText, s.id).toBeUndefined();
        expect(s.hatLogo, s.id).toBe('');
        if (s.shoes.kind === 'heel') expect(s.sex).not.toBe('m');
        if (s.age === 'kid') expect(['heel', 'dressShoe', 'loafer', 'tallBoot']).not.toContain(s.shoes.kind);
      }
    }
    // the season moves the street: more outer layers (puffers, coats, parkas) in the cold than in the heat
    const heavy = (n: Season): number => sample(300, { season: n }).filter((s) => ['puffer', 'jacket', 'cardigan', 'tracksuit'].includes(s.top.kind) && s.top.sleeves === 'long').length;
    expect(heavy('cold')).toBeGreaterThan(heavy('warm') * 2);
  });

  it('a look steers the pools: work is not a night out', () => {
    const w = sample(200, { look: 'work' }), n = sample(200, { look: 'night' });
    const cargoish = (a: PedSpec[]): number => a.filter((s) => ['cargo'].includes(s.bottom.kind) || s.bottom.cut === 'patch' || s.shoes.kind === 'workBoot').length;
    expect(cargoish(w)).toBeGreaterThan(cargoish(n) * 2);
    const smart = (a: PedSpec[]): number => a.filter((s) => s.top.style === 'blazer' || s.top.style === 'shirt' || s.shoes.kind === 'dressShoe' || s.shoes.kind === 'heel').length;
    expect(smart(n)).toBeGreaterThan(smart(sample(200, { look: 'sport' })));
  });

  it('colourways: no top vanishes into its bottom', () => {
    for (const s of sample(200)) if (s.top.kind !== 'dress' && s.bottom.kind !== 'skirt') {
      const p = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)), a = p(s.top.color), b = p(s.bottom.color);
      if (s.top.style !== 'boiler' && s.top.style !== 'track' && s.top.kind !== 'jersey') expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) + (s.top.under ? 99 : 0) + (s.top.long ? 99 : 0), s.id).toBeGreaterThan(20);
    }
  });

  it('the street cap holds: however many pedestrians are drawn, only `cap` different people are alive, same group, sex and age first', () => {
    resetWardrobe(); setWardrobeCap(24);
    const named = new Set<number>(), seen = new Set<number>();
    for (let i = 0; i < 400; i++) { const rng = new Rng(Rng.hash('cap-' + i)), nm = pickPedVariant(rng); named.add(nm); seen.add(pickWardrobeVariant(rng, nm, false)); }
    expect(wardrobeAlive()).toBeLessThanOrEqual(24);
    expect(seen.size).toBeLessThanOrEqual(24);
    expect(named.size).toBeGreaterThan(24);
    setWardrobeCap(null); resetWardrobe();
  });

  it('the named roster is untouched by the wardrobe', () => {
    const before = PED_SPECS.length;
    const g = registerSpec(composeSpec(99, { group: 'wh', sex: 'm', age: 'adult' }));
    expect(g).toBeGreaterThanOrEqual(before);
    expect(PED_SPECS.slice(0, 20).every((s) => s.id.length > 0)).toBe(true);
    expect(PED_SPECS.find((s) => s.id === 'hj-man')).toBeTruthy();
    expect(registerSpec(PED_SPECS[g])).toBe(g);
  });

  it('every body type of the pools exists, and the pools have at least nine new types', () => {
    for (const k of Object.keys(BODY_POOLS)) for (const [t] of BODY_POOLS[k]) expect(BODY_TYPES[t as BodyTypeId], t).toBeTruthy();
    const fresh = ['lanky', 'swimmer', 'stoop-slim', 'elder-heavy', 'big-tall', 'pregnant', 'lean-teen', 'stout', 'slight'];
    for (const t of fresh) expect(Object.values(BODY_POOLS).some((p) => p.some(([b]) => b === t)), t).toBe(true);
  });

  it('dress() builds an outfit from garment ids (the player wardrobe, a shop later)', () => {
    const p = dress({ top: ['polo', '#3a7a9a'], layer: ['denimJacket', '#4d6c98'], bottom: ['jeansSlim', '#232b3b'], shoes: ['runner', '#e8e8ec'], hat: 'cap', hatColor: '#111111' });
    expect(p.top!.kind).toBe('jacket'); expect(p.top!.under).toBe('#3a7a9a'); expect(p.top!.fabric).toBe('denim');
    expect(p.bottom!.cut).toBe('slim'); expect(p.shoes!.kind).toBe('runner'); expect(p.hat).toBe('cap');
  });
});

describe('PEOPLE6 wardrobe: geometry budgets (hi < 5,600, mid < 2,000, far < 400 triangles)', () => {
  it('40 drawn people across the body types and seasons build within budget', () => {
    const levels = (m: THREE.Group): number[] => { const o: number[] = []; m.traverse((x) => { if ((x as THREE.SkinnedMesh).isSkinnedMesh) o.push((x as THREE.SkinnedMesh).geometry.index!.count / 3); }); return o; };
    const bad: string[] = [];
    let worstHi = 0, worstMid = 0;
    const types = Object.keys(BODY_TYPES) as BodyTypeId[];
    for (let i = 0; i < 40; i++) {
      setWardrobeSeason((['cold', 'mild', 'warm'] as const)[i % 3]);
      const sp = composeSpec(i * 31 + 5, { group: GROUPS[i % GROUPS.length], ...WHO[i % WHO.length] });
      sp.body = types[i % types.length];
      if (sp.age === 'kid') sp.body = 'kid';
      sp.id += '-t' + i;
      const v = registerSpec(sp), m = buildMhPedModel(materials, new Rng(i + 1), { variant: v })!;
      const [hi, mid, far] = levels(m.group);
      worstHi = Math.max(worstHi, hi); worstMid = Math.max(worstMid, mid);
      if (hi >= 5600 || mid >= 2000 || far > 400) bad.push(`${sp.id} ${hi}/${mid}/${far}`);
    }
    setWardrobeSeason('mild');
    expect(bad, `worst hi ${worstHi}, mid ${worstMid}`).toEqual([]);
  }, 240000);
});
