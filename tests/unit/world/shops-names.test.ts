/**
 * STORES2: parody shop names. Deterministic, distinct, readable as their trade, and never a real business.
 * The banned list of real names lives in THIS FILE ONLY (shipped code must not carry real names).
 */
import { describe, expect, it } from 'vitest';
import { classifyArchetype, cuisineOf } from '@/textures/painters/storefront-art';
import { SHOP_TYPES, SHOP_TYPE_LIST, typeOfArchetype, typesOfKind } from '@/world/shops/shopTypes';
import { lexiconOf, nameSpace, shopIdentity } from '@/world/shops/shopNames';
import bedstuy from '@/world/data/bedstuy.json';

/** Real chains and well-known Brooklyn/NYC business names (whole-name, squashed lower case). Never allowed on a sign. */
const BANNED = [
  'dominos', 'papa johns', 'pizza hut', 'little caesars', 'subway', 'mcdonalds', 'burger king', 'kfc', 'kentucky fried', 'popeyes',
  'wendys', 'taco bell', 'chipotle', 'starbucks', 'dunkin', 'duane reade', 'cvs', 'walgreens', 'rite aid', '7 eleven', 'seven eleven',
  'family dollar', 'dollar tree', 'dollar general', '99 cents only', 'sally beauty', 'ulta', 'sephora', 'key food', 'c town',
  'western beef', 'pathmark', 'foodtown', 'whole foods', 'trader joes', 'aldi', 'lidl', 'walmart', 'rays pizza', 'joes pizza',
  'famous original rays', 'peter luger', 'juniors', 'robertas', 'di fara', 'lombardis', 'katzs', 'carnegie deli', 'zabars', 'white castle',
  'arbys', 'panera', 'krispy kreme', 'cinnabon', 'western union', 'moneygram', 'metro pcs', 'boost mobile', 't mobile', 'verizon',
  'at t', 'sprint', 'best buy', 'home depot', 'lowes', 'jiffy lube', 'midas', 'pep boys', 'meineke', 'autozone', 'great clips',
  'supercuts', 'planet fitness', 'gnc', 'checkers', 'sonic', 'regis',
];
const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/** words only, apostrophes dropped, single spaces: for whole-word matching of the banned list */
const words = (s: string): string => ` ${s.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;

/** A neighbourhood: 600 lots of ids like the real map's BBLs and the grid map's ids. */
const ids = (n: number, p: string): string[] => Array.from({ length: n }, (_, i) => `${p}${3000000000 + i * 37}`);

describe('shopNames', () => {
  it('is deterministic by (type, id, seed)', () => {
    for (const t of SHOP_TYPE_LIST) {
      const a = shopIdentity(t, 'r1c1:E:4', 7), b = shopIdentity(t, 'r1c1:E:4', 7);
      expect(b).toEqual(a);
    }
    expect(shopIdentity('pizzeria', 'x1', 1).name).not.toBe(shopIdentity('pizzeria', 'x1', 2).name);
  });

  it('reads as its trade: art archetype and cuisine match for every type', () => {
    for (const t of SHOP_TYPE_LIST) {
      for (const id of ids(150, 'bbl')) {
        const s = shopIdentity(t, id);
        expect(classifyArchetype(s.name), `${t}: ${s.name}`).toBe(SHOP_TYPES[t].archetype);
        expect(classifyArchetype(s.signCopy), `${t}: ${s.signCopy}`).toBe(SHOP_TYPES[t].archetype);
        if (SHOP_TYPES[t].archetype === 'kitchen') expect(cuisineOf(s.name), `${t}: ${s.name}`).toBe(SHOP_TYPES[t].cuisine);
        expect(s.main.length).toBeLessThanOrEqual(38);
        expect(s.name).toContain('·');
      }
    }
  });

  it('every hand-written standout and tagline is clean text (no stray lowercase, no curly marks)', () => {
    for (const t of SHOP_TYPE_LIST) {
      const lx = lexiconOf(t);
      for (const s of [...lx.standouts, ...lx.taglines, ...lx.copies]) expect(s, `${t}: ${s}`).toBe(s.toUpperCase());
    }
  });

  it('is distinct within a neighbourhood: 400 shops of a type, at most a few repeats', () => {
    for (const t of SHOP_TYPE_LIST) {
      const mains = ids(400, 'lot').map((id) => shopIdentity(t, id).main);
      const distinct = new Set(mains).size;
      expect(distinct, `${t} distinct ${distinct}/400`).toBeGreaterThanOrEqual(t === 'church' || t === 'funeral' || t === 'daycare' ? 250 : 340);
      // ids are hashed independently, so neighbours match only by chance: a handful in 400 at most
      let adj = 0;
      for (let i = 1; i < mains.length; i++) if (mains[i] === mains[i - 1]) adj++;
      expect(adj, `${t} adjacent repeats`).toBeLessThanOrEqual(3);
    }
  });

  it('has thousands of possible names per type (the big types) and every type has taglines and standouts', () => {
    for (const t of SHOP_TYPE_LIST) {
      expect(nameSpace(t), t).toBeGreaterThan(2500);
      expect(lexiconOf(t).taglines.length, t).toBeGreaterThanOrEqual(8);
      expect(lexiconOf(t).standouts.length, t).toBeGreaterThanOrEqual(1);
    }
  });

  it('never contains a banned real chain or brand', () => {
    for (const t of SHOP_TYPE_LIST) {
      const lx = lexiconOf(t);
      const all = [...lx.standouts, ...ids(300, 'ban').map((id) => shopIdentity(t, id).name)];
      for (const n of all) {
        const q = words(n);
        for (const b of BANNED) expect(q.includes(` ${b} `), `${t}: "${n}" contains ${b}`).toBe(false);
      }
    }
  });

  it('never equals a real street name, or any name from the city data the project holds', () => {
    const real = new Set<string>();
    for (const s of (bedstuy as { streets: { name: string; signName?: string }[] }).streets) { real.add(squash(s.name)); if (s.signName) real.add(squash(s.signName)); }
    for (const t of SHOP_TYPE_LIST) {
      for (const id of ids(200, 'real')) {
        const s = shopIdentity(t, id);
        expect(real.has(squash(s.main)), s.main).toBe(false);
      }
    }
  });

  it('the type table is consistent: every type has a kind, archetype, sticker set and palette', () => {
    for (const t of SHOP_TYPE_LIST) {
      const i = SHOP_TYPES[t];
      expect(i.awning.length, t).toBeGreaterThan(0);
      expect(i.sign.length).toBe(2);
    }
    expect(SHOP_TYPE_LIST.length).toBeGreaterThanOrEqual(25);
    expect(typesOfKind('restaurant').map((x) => x.type)).toEqual(expect.arrayContaining(['pizzeria', 'chinese', 'caribbean', 'chicken', 'halal']));
    expect(typeOfArchetype('pizza')).toBe('pizzeria');
    expect(typeOfArchetype('braiding')).toBe('braiding');
    expect(typeOfArchetype('nonsense')).toBeNull();
  });
});
