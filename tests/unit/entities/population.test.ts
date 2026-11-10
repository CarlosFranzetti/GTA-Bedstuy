import { describe, expect, it, beforeEach } from 'vitest';
import { Rng } from '@/core/Rng';
import { CIVILIAN_COUNT, PED_SPECS, pedVariantIndex } from '@/textures/painters/ped';
import { GROUPS, GROUP_SHARE, getPlayerLook, randomPlayerLook, setPlayerLook } from '@/textures/painters/pedRoster';
import { pickPedVariant, resetPopulation } from '@/entities/models/pedBody';
import { shapeFor } from '@/entities/models/pedMesh';

describe('street population (pedRoster)', () => {
  beforeEach(() => resetPopulation());

  it('over 500 spawns no group exceeds 35 % and every group appears', () => {
    const r = new Rng('pop'), count = new Map<string, number>();
    for (let i = 0; i < 500; i++) { const g = PED_SPECS[pickPedVariant(r, 14, false)].group!; count.set(g, (count.get(g) ?? 0) + 1); }
    for (const [g, n] of count) expect(n / 500, g).toBeLessThanOrEqual(0.35);
    for (const g of GROUPS) expect(count.get(g) ?? 0, g).toBeGreaterThan(0);
    expect(Object.values(GROUP_SHARE).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });

  it('every window of 20 consecutive people holds at least 4 distinct groups, for many seeds and hours', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      resetPopulation();
      const r = new Rng(seed), groups: string[] = [];
      for (let i = 0; i < 300; i++) groups.push(PED_SPECS[pickPedVariant(r, i % 24, i % 7 === 0)].group!);
      for (let i = 0; i + 20 <= groups.length; i++) expect(new Set(groups.slice(i, i + 20)).size, `${seed}@${i}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('outfits are not tied to a skin tone: every outfit family is worn by more than one background where it is generic', () => {
    const fam = (id: string): string => id.replace(/^(ba|ca|la|wh|hj|ea|sa|me|mx)-/, '');
    const by = new Map<string, Set<string>>();
    for (const s of PED_SPECS.slice(0, CIVILIAN_COUNT)) { const k = s.top.kind + '/' + s.bottom.kind; (by.get(k) ?? by.set(k, new Set()).get(k)!).add(s.group!); void fam; }
    const multi = [...by.values()].filter((g) => g.size >= 2).length;
    expect(multi).toBeGreaterThanOrEqual(5);
    const skins = new Set(PED_SPECS.slice(0, CIVILIAN_COUNT).map((s) => s.skin));
    expect(skins.size).toBeGreaterThanOrEqual(16);
    // light and dark skin in several outfits: hoodie, puffer, jersey, scrubs, jacket
    const tone = (hex: string): number => parseInt(hex.slice(1, 3), 16);
    for (const kind of ['hoodie', 'puffer', 'jersey', 'scrubs', 'jacket']) {
      const t = PED_SPECS.slice(0, CIVILIAN_COUNT).filter((s) => s.top.kind === kind).map((s) => tone(s.skin));
      expect(Math.max(...t) - Math.min(...t), kind).toBeGreaterThan(20);
    }
  });

  it('has the new everyday and religious-dress variants, respectfully and only for the people who wear them', () => {
    const ids = PED_SPECS.map((s) => s.id);
    for (const id of ['hj-man', 'hj-woman', 'me-hijabi', 'sa-hijabi', 'wh-tote', 'wh-cyclist', 'la-construction', 'sa-rider', 'wh-elder', 'ba-elder', 'mx-androgynous']) expect(ids, id).toContain(id);
    const man = PED_SPECS[pedVariantIndex('hj-man')], woman = PED_SPECS[pedVariantIndex('hj-woman')];
    expect(man.hat).toBe('fedora'); expect(man.hair).toBe('peyot'); expect(man.face.beard).toBe(true); expect(man.top.long).toBe(true);
    expect(woman.bottom.long).toBe(true); expect(woman.top.sleeves).toBe('long');
    expect(PED_SPECS[pedVariantIndex('me-hijabi')].hat).toBe('hijab');
    // no other variant wears religious dress
    for (const s of PED_SPECS) if (!['hj-man', 'hj-woman', 'me-hijabi', 'sa-hijabi'].includes(s.id)) { expect(['fedora', 'hijab']).not.toContain(s.hat); expect(s.hair).not.toBe('peyot'); }
  });

  it('maps every person to a shape of their group, sex and age', () => {
    expect(shapeFor(PED_SPECS[pedVariantIndex('ea-office')])).toBe('ea_m');
    expect(shapeFor(PED_SPECS[pedVariantIndex('la-denim')])).toBe('la_f');
    expect(shapeFor(PED_SPECS[pedVariantIndex('hj-man')])).toBe('wh_m');
    expect(shapeFor(PED_SPECS[pedVariantIndex('wh-elder')])).toBe('wh_m_old');
    expect(shapeFor(PED_SPECS[pedVariantIndex('mx-androgynous')])).toBe('mx_x');
    expect(shapeFor(PED_SPECS[pedVariantIndex('ea-kid')])).toBe('teen_b');
    const shapes = new Set(PED_SPECS.slice(0, CIVILIAN_COUNT).map((s) => shapeFor(s)));
    expect(shapes.size).toBeGreaterThanOrEqual(14);
  });
});

describe('player look', () => {
  it('is random per seed, covers every group but the religious-dress one, and persists through get / set', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(randomPlayerLook(`game${i}`).group);
    expect(seen.size).toBe(GROUPS.length - 1);
    expect(seen.has('hj')).toBe(false);
    const a = randomPlayerLook('seed-1');
    expect(randomPlayerLook('seed-1')).toEqual(a);
    setPlayerLook(a);
    expect(getPlayerLook()).toEqual(a);
    const spec = PED_SPECS[pedVariantIndex('player')];
    expect(spec.role).toBe('player'); expect(spec.group).toBe(a.group);
    setPlayerLook({ group: 'ea', variant: 2 });
    expect(PED_SPECS[pedVariantIndex('player')].id).toBe('player-ea-2');
    setPlayerLook({ group: 'zz' as never, variant: 99 });
    expect(getPlayerLook().variant).toBe(2);
  });
});
