import { describe, expect, it } from 'vitest';
import '@/textures/painters/ped';
import { BASE_TOPS, BOTTOMS, LAYERS, ONE_PIECE, SHOES } from '@/textures/painters/pedWardrobe';
import { BODY_TYPES } from '@/entities/models/pedBodyTypes';
import { faceTraits } from '@/entities/models/pedHead';
import { bodyBuildOf } from '@/entities/models/pedBodyTypes';
import { CAST_MEMBERS, CAST_IDS, castMember, PLAYABLE_IDS } from '@/game/story/cast/cast';
import { castSpec, allOutfitSpecs } from '@/game/story/cast/specs';
import { OUTFIT_KEYS } from '@/game/story/cast/types';

const HEX = /^#[0-9a-f]{6}$/i;
describe('CAST: the named people as data', () => {
  it('the five owner-named people exist, Pedro is the player', () => {
    for (const n of ['Pedro Martinez', 'Lana Porskaia', 'Adele Labos', 'Stavros Yanos', 'Akira Tonaka']) expect(CAST_MEMBERS.some((m) => m.full === n)).toBe(true);
    expect(castMember('pedro')!.role).toBe('player');
    expect(PLAYABLE_IDS).toEqual(['pedro', 'lana', 'adele']);
    expect(new Set(CAST_IDS).size).toBe(CAST_IDS.length);
  });
  it('everyone is an adult, with a real body type, voice and barks', () => {
    for (const m of CAST_MEMBERS) {
      expect(['adult', 'old']).toContain(m.age);
      expect(BODY_TYPES[m.body], m.id).toBeTruthy();
      expect(m.voice.voice).toMatch(/^[ab][fm]_/);
      for (const k of ['greet', 'bye', 'hurt', 'help', 'chat', 'getUp'] as const) expect(m.barks[k]?.length ?? 0, `${m.id} ${k}`).toBeGreaterThanOrEqual(2);
      expect(m.places.length).toBeGreaterThan(0);
      for (const p of m.places) { expect(p.hours[0]).toBeGreaterThanOrEqual(0); expect(p.hours[1]).toBeGreaterThan(p.hours[0]); }
    }
  });
  it('every garment id exists in the wardrobe pools and every colour is a hex', () => {
    for (const m of CAST_MEMBERS) for (const k of OUTFIT_KEYS) {
      const o = m.outfits[k]; if (!o) continue;
      const where = `${m.id}/${k}`;
      if (o.top) { expect(BASE_TOPS[o.top[0]], where + ' top').toBeTruthy(); expect(o.top[1]).toMatch(HEX); }
      if (o.layer) { expect(LAYERS[o.layer[0]], where + ' layer').toBeTruthy(); expect(o.layer[1]).toMatch(HEX); }
      if (o.bottom) { expect(BOTTOMS[o.bottom[0]], where + ' bottom').toBeTruthy(); expect(o.bottom[1]).toMatch(HEX); }
      if (o.shoes) { expect(SHOES[o.shoes[0]], where + ' shoes').toBeTruthy(); expect(o.shoes[1]).toMatch(HEX); }
      if (o.onePiece) expect(ONE_PIECE[o.onePiece[0]], where + ' one-piece').toBeTruthy();
      expect(o.onePiece || (o.top && o.bottom), where + ' covers the body').toBeTruthy();
    }
    for (const m of CAST_MEMBERS) { expect(m.skin).toMatch(HEX); expect(m.hairColor).toMatch(HEX); }
  });
  it('looks are stable: the same spec every time, one face and one build across outfits', () => {
    for (const m of CAST_MEMBERS) {
      expect(JSON.stringify(castSpec(m.id, 'day'))).toBe(JSON.stringify(castSpec(m.id, 'day')));
      const specs = allOutfitSpecs(m.id);
      expect(new Set(specs.map((s) => s.id)).size, m.id).toBe(OUTFIT_KEYS.filter((k) => m.outfits[k]).length);
      const ft = JSON.stringify(faceTraits(specs[0])), bb = JSON.stringify(bodyBuildOf(specs[0]));
      for (const s of specs) {
        expect(s.seed).toBe(`cast-${m.id}`);
        expect(JSON.stringify(faceTraits(s))).toBe(ft);
        expect(JSON.stringify(bodyBuildOf(s))).toBe(bb);
        expect(s.weight).toBe(0);
      }
    }
  });
  it('a person without a night or gig look wears the day look in that slot (as another id)', () => {
    const a = castSpec('clem', 'gig'), d = castSpec('clem', 'day');
    expect(a.id).toBe(d.id);
    expect(a.top).toEqual(d.top);
  });
  it('people differ: no two share skin, hair and top colour; the five have different silhouettes (body types)', () => {
    const sig = CAST_MEMBERS.map((m) => `${m.skin}|${m.hairColor}|${m.outfits.day.top?.[1] ?? m.outfits.day.onePiece?.[1]}`);
    expect(new Set(sig).size).toBe(CAST_MEMBERS.length);
    const five = ['pedro', 'lana', 'adele', 'stavros', 'akira'].map((i) => castMember(i)!.body);
    expect(new Set(five).size).toBe(5);
    // face traits differ between people
    const heads = new Set(CAST_MEMBERS.map((m) => JSON.stringify(faceTraits(castSpec(m.id, 'day')))));
    expect(heads.size).toBe(CAST_MEMBERS.length);
  });
  it('the player roles use the larger player texture, the rest are civilians', () => {
    expect(castSpec('pedro').role).toBe('player');
    expect(castSpec('lana').role).toBe('player');
    expect(castSpec('stavros').role).toBe('civilian');
  });
});
