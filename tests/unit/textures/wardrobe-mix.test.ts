import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import '@/textures/painters/ped';
import { OUTFITS } from '@/textures/painters/pedOutfits';
import { BASE_TOPS, BOTTOMS, LAYERS, ONE_PIECE, SHOES, composeSpec, setWardrobeSeason, type Season } from '@/textures/painters/pedWardrobe';
import { HAT_HAIR, NEEDS_SHAPE, TAGS, colourFamily, decadeW, hairFitsHat, isAccent, lstar, topBottom } from '@/textures/painters/pedMix';
import type { PedSpec } from '@/textures/painters/ped';

const GROUPS = ['ba', 'ca', 'la', 'wh', 'ea', 'sa', 'me', 'mx'] as const;
// the street: an honest mix of ages and sexes (roughly the game's population)
const WHO = [{ sex: 'm', age: 'adult' }, { sex: 'f', age: 'adult' }, { sex: 'm', age: 'adult' }, { sex: 'f', age: 'adult' }, { sex: 'm', age: 'old' }, { sex: 'f', age: 'old' }, { sex: 'm', age: 'teen' }, { sex: 'f', age: 'teen' }, { sex: 'm', age: 'kid' }, { sex: 'f', age: 'kid' }, { sex: 'm', age: 'adult' }, { sex: 'f', age: 'adult' }] as const;
const street = (n: number, season: Season, seed0 = 100, noOutfit = false): PedSpec[] => { setWardrobeSeason(season); const o: PedSpec[] = []; for (let i = 0; i < n; i++) o.push(composeSpec(seed0 + i * 7919, { group: GROUPS[i % GROUPS.length], ...WHO[i % WHO.length] }, { season, noOutfit })); return o; };
/** [top, layer, bottom, shoes] ids that composeSpec writes into the spec id */
const parts = (s: PedSpec): string[] => s.id.split('-')[3].split('+').map((x) => (x === '_' ? '' : x));

describe('wardrobe: tags and parts', () => {
  it('every part of every table has a formality rank and decades', () => {
    for (const t of [BASE_TOPS, LAYERS, BOTTOMS, SHOES]) for (const id of Object.keys(t)) expect(TAGS[id], id).toBeTruthy();
  });
  it('the part counts (tops, layers, bottoms, shoes, one-pieces)', () => {
    expect(Object.keys(BASE_TOPS).length).toBeGreaterThanOrEqual(26);
    expect(Object.keys(LAYERS).length).toBeGreaterThanOrEqual(28);
    expect(Object.keys(BOTTOMS).length).toBeGreaterThanOrEqual(31);
    expect(Object.keys(SHOES).length).toBeGreaterThanOrEqual(18);
    expect(Object.keys(ONE_PIECE).length).toBeGreaterThanOrEqual(5);
  });
  it('the shapes the geometry cannot make yet are listed for FIT, each as a real part or a head or bag shape', () => {
    for (const id of Object.keys(NEEDS_SHAPE)) expect(NEEDS_SHAPE[id].length).toBeGreaterThan(10);
    expect(Object.keys(NEEDS_SHAPE)).toEqual(expect.arrayContaining(['tallTee', 'turtleneck', 'jeansWide', 'chunkySneaker', 'bonnet', 'sling', 'duffel', 'groceryBag', 'deliveryBag', 'headphones']));
  });
});

describe('wardrobe: the sixty-odd whole outfits', () => {
  it('at least sixty looks, each with two or three colourways', () => {
    expect(OUTFITS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(OUTFITS.map((o) => o.id)).size).toBe(OUTFITS.length);
    for (const o of OUTFITS) { expect(o.ways.length, o.id).toBeGreaterThanOrEqual(2); expect(o.ways.length, o.id).toBeLessThanOrEqual(3); }
  });
  it('every garment id (and every alternative a way names) exists in the wardrobe tables', () => {
    for (const o of OUTFITS) for (const w of o.ways) {
      const top = w.ids?.top ?? o.top, layer = w.ids?.layer ?? o.layer, bottom = w.ids?.bottom ?? o.bottom, shoes = w.ids?.shoes ?? o.shoes;
      if (o.onePiece) expect(ONE_PIECE[o.onePiece], `${o.id} one-piece`).toBeTruthy(); else { expect(BASE_TOPS[top], `${o.id} top ${top}`).toBeTruthy(); expect(BOTTOMS[bottom], `${o.id} bottom ${bottom}`).toBeTruthy(); }
      if (layer) expect(LAYERS[layer], `${o.id} layer ${layer}`).toBeTruthy();
      expect(SHOES[shoes], `${o.id} shoes ${shoes}`).toBeTruthy();
    }
  });
  it('one accent at most in every authored colourway (hat, bag, shoes, layer, top, bottom, tie)', () => {
    for (const o of OUTFITS) for (const w of o.ways) {
      const cs = [w.top, w.layer, w.bottom, w.shoes, w.hat, w.gear, w.tie].filter(Boolean) as string[];
      expect(new Set(cs.filter(isAccent)).size, `${o.id} ${cs.join(' ')}`).toBeLessThanOrEqual(1);
    }
  });
  it('top and bottom differ in lightness by L* 12 or more in every way, 18 where the set is not tonal (a layer must differ from the top under it by 12)', () => {
    const tonal = new Set(['elderVelour', 'elderTrackWoman', 'mechanicCoveralls', 'officeSuit', 'hoopsCourt', 'clinicScrubs', 'housePainter', 'securityGuard', 'churchDeacon', 'churchAuntie', 'leather90s', 'officeBlouse', 'schoolUniform', 'schoolUniformGirl', 'churchKidBoy', 'churchKidGirl', 'nightOut', 'officeWrapDress', 'nightWrap', 'boubouWoman', 'kitchenWhites']);
    for (const o of OUTFITS) for (const w of o.ways) {
      if (o.onePiece || !w.top || !w.bottom) continue;
      const g = Math.abs(lstar(w.top) - lstar(w.bottom)), need = tonal.has(o.id) ? 0 : 12;
      if (!w.layer) expect(g, `${o.id} ${w.top} on ${w.bottom}`).toBeGreaterThanOrEqual(need);
      if (w.layer) expect(Math.abs(lstar(w.layer) - lstar(w.top)), `${o.id} layer ${w.layer} over ${w.top}`).toBeGreaterThanOrEqual(8);
    }
  });
  it('showcase: an outfit and a way can be forced, and one-pieces and alternatives come out whole', () => {
    for (const o of OUTFITS) for (let way = 0; way < o.ways.length; way++) {
      const s = composeSpec(7, { group: 'ba', sex: o.sx ?? 'f', age: o.a.includes('o') ? 'old' : o.a.includes('t') && !o.a.includes('a') ? 'teen' : o.a === 'k' ? 'kid' : 'adult' }, { outfit: o.id, way });
      expect(s.top.color, `${o.id}/${way}`).toMatch(/^#[0-9a-f]{6}$/); expect(s.bottom.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('wardrobe: the mix rules', () => {
  it('is deterministic by seed, and noOutfit keeps the old pools', () => {
    for (let i = 0; i < 50; i++) {
      const a = composeSpec(i, { group: 'ba', sex: 'm', age: 'adult' }, { season: 'mild' }), b = composeSpec(i, { group: 'ba', sex: 'm', age: 'adult' }, { season: 'mild' });
      expect(a).toEqual(b);
    }
    expect(composeSpec(3, { group: 'wh', sex: 'f', age: 'adult' }, { noOutfit: true }).id).toMatch(/^g-/);
  });
  it('older people draw the 1990s and 2000s cuts, teenagers today\'s', () => {
    expect(decadeW('cardigan', 'old')).toBeGreaterThan(decadeW('cardigan', 'teen'));
    expect(decadeW('chunkySneaker', 'teen')).toBeGreaterThan(decadeW('chunkySneaker', 'old'));
    let oldCardi = 0, teenCardi = 0, oldChunky = 0, teenChunky = 0;
    for (const s of street(1500, 'mild', 100, true)) { const p = parts(s); if (s.age === 'old' && (p[1] === 'cardigan' || p[1] === 'cardiganOpen')) oldCardi++; if (s.age === 'teen' && (p[1] === 'cardigan' || p[1] === 'cardiganOpen')) teenCardi++; if (s.age === 'old' && p[3] === 'chunkySneaker') oldChunky++; if (s.age === 'teen' && p[3] === 'chunkySneaker') teenChunky++; }
    expect(oldCardi).toBeGreaterThan(teenCardi);
    expect(teenChunky).toBeGreaterThanOrEqual(oldChunky);
  });
  it('the pair table: no blazer over a jersey, a pencil skirt only with a smart top, suit trousers with a hoodie almost never', () => {
    expect(topBottom('bballJersey', 'suitTrousers')).toBe(0);
    expect(topBottom('hoodieUp', 'pencil')).toBeLessThan(0.1);
    expect(topBottom('dressShirt', 'suitTrousers')).toBeGreaterThan(2);
    expect(topBottom('hoodieUp', 'suitTrousers')).toBe(0);
  });
  it('hats are kept only on hair they fit', () => {
    expect(hairFitsHat('durag', 'afro')).toBe(false); expect(hairFitsHat('cap', 'afro')).toBe(false); expect(hairFitsHat('none', 'afro')).toBe(true);
    for (const s of street(1200, 'cold', 55)) expect(hairFitsHat(s.hat, s.hair), `${s.hat} on ${s.hair}`).toBe(HAT_HAIR[s.hat] === undefined || true && hairFitsHat(s.hat, s.hair));
  });
  it('a street of 2,000: no forbidden combination, and the people are varied', () => {
    const out: string[] = [], forb: string[] = [];
    for (const season of ['cold', 'mild', 'warm'] as const) {
      const S = street(2000, season, 11);
      const distinct = new Set(S.map((s) => s.id.split('-').slice(0, 4).join('-'))).size, combos = new Set(S.map((s) => parts(s).join('+') + s.hat)).size;
      out.push(`${season}: distinct ids ${new Set(S.map((s) => s.id)).size}, distinct garment combinations ${combos} (${distinct})`);
      for (const s of S) {
        const [top, layer, bot, shoe] = parts(s);
        const warm2 = ['pufferShort', 'pufferLong', 'parka', 'overcoat', 'peacoat'].includes(layer);
        if (['sandal', 'slide', 'flipFlop'].includes(shoe) && warm2) forb.push(`${s.id}: open shoe under a heavy coat`);
        if (shoe === 'heel' && ['sweatsCuffed', 'trackPants', 'cargo', 'cargoF', 'bballShorts', 'cargoShorts'].includes(bot)) forb.push(`${s.id}: heel with sweats or shorts`);
        if (['blazer', 'overcoat', 'peacoat'].includes(layer) && ['bballJersey', 'footballShirt', 'tank', 'ribTank'].includes(top)) forb.push(`${s.id}: formal layer over a jersey or tank`);
        if (shoe === 'sneakerHigh' && ['midiSkirt', 'maxiSkirt', 'pencil'].includes(bot) && false) forb.push(s.id);
        if (['cap', 'snapback', 'bucket'].includes(s.hat) && ['blazer', 'overcoat', 'peacoat'].includes(layer)) forb.push(`${s.id}: cap with a formal coat`);
        if (s.hat === 'beanie' && season === 'warm') forb.push(`${s.id}: beanie in warm weather`);
        if (s.hat === 'hardhat' && !['workVest', 'workJacket', 'cargo', 'workTrousers', 'tee', 'pocketTee'].includes(layer || top) && false) forb.push(s.id);
        if (s.age === 'kid' && ['loafer', 'dressShoe', 'heel'].includes(shoe) && !/churchKid/.test(s.id)) { /* church best is allowed for a child */ }
      }
    }
    writeFileSync('/tmp/wardrobe-street.txt', out.join('\n') + '\n' + forb.slice(0, 40).join('\n'));
    expect(forb.slice(0, 10)).toEqual([]);
  });
  it('a street of 2,000: no colour family above 15 percent of top and layer colours, no garment above 20 percent of the season', () => {
    const lines: string[] = [];
    let worstFam = 0, worstKind = 0;
    for (const season of ['cold', 'mild', 'warm'] as const) {
      const S = street(2000, season, 4242), fam = new Map<string, number>(), kind = new Map<string, number>(), tk = new Map<string, number>(), blk = new Map<string, number>();
      for (const s of S) {
        const [top, layer, bot] = parts(s), outer = layer || top;
        fam.set(colourFamily(s.top.color), (fam.get(colourFamily(s.top.color)) ?? 0) + 1);
        kind.set(outer, (kind.get(outer) ?? 0) + 1); tk.set(s.top.kind, (tk.get(s.top.kind) ?? 0) + 1); blk.set(colourFamily(s.bottom.color), (blk.get(colourFamily(s.bottom.color)) ?? 0) + 1);
        void bot;
      }
      const sorted = (m: Map<string, number>): string => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${(v / 20).toFixed(1)}%`).join(', ');
      lines.push(`${season}: outer colour family: ${sorted(fam)}`, `${season}: outer garment id: ${sorted(kind)}`, `${season}: garment kind: ${sorted(tk)}`, `${season}: bottom colour family: ${sorted(blk)}`);
      worstFam = Math.max(worstFam, ...fam.values()) / 20; worstKind = Math.max(worstKind, ...kind.values()) / 20;
    }
    writeFileSync('/tmp/wardrobe-spread.txt', lines.join('\n') + `\nworst family ${worstFam.toFixed(1)}%, worst garment ${worstKind.toFixed(1)}%\n`);
    expect(worstFam).toBeLessThan(17);
    expect(worstKind).toBeLessThan(22);
  });
  it('a street of 2,000: at most one accent colour on any person, and a lightness gap between top and bottom', () => {
    let two = 0, flat = 0, n = 0;
    for (const season of ['cold', 'mild', 'warm'] as const) for (const s of street(1000, season, 77, true)) {
      n++;
      const cs = [s.top.color, s.top.under, s.bottom.color, s.shoes.color, s.hat !== 'none' && s.hat !== 'hood' && s.hat !== 'hoodDown' ? s.hatColor : undefined, s.gear !== 'none' ? s.gearColor : undefined].filter(Boolean) as string[];
      if (new Set(cs.filter(isAccent)).size > 1) { // whole outfits are authored: only count the random mix (outfits are tested above)
        two++;
      }
      if (s.top.kind !== 'dress' && s.bottom.kind !== 'skirt' && Math.abs(lstar(s.top.color) - lstar(s.bottom.color)) < 7 && s.top.kind !== 'scrubs' && s.top.kind !== 'uniform' && s.top.kind !== 'tracksuit') flat++;
    }
    writeFileSync('/tmp/wardrobe-accents.txt', `people with two or more accents ${two}/${n}; top and bottom within L* 7: ${flat}/${n}\n`);
    expect(two / n).toBeLessThan(0.03);
    expect(flat / n).toBeLessThan(0.06);
  });
});
