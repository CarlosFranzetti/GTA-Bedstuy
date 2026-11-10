import { describe, it, expect } from 'vitest';
import { TEXTURE_PACKS } from '@/textures/packs';

describe('texture pack manifest', () => {
  it('every entry has asset urls and a positive repeat', () => {
    expect(TEXTURE_PACKS.length).toBeGreaterThanOrEqual(12);
    for (const e of TEXTURE_PACKS) {
      expect(typeof e.color).toBe('string');
      // a colour-less entry (painted metal) carries only relief + roughness and keeps the painted colour map
      if (e.color.length === 0) expect(e.normal.length + e.rough.length).toBeGreaterThan(0); else expect(e.color.length).toBeGreaterThan(0);
      expect(typeof e.normal).toBe('string'); expect(typeof e.rough).toBe('string');
      expect(e.repeat).toBeGreaterThan(0); expect(e.normalScale).toBeGreaterThan(0);
    }
  });
  it('does not define the same key/variant twice', () => {
    const seen = new Set(TEXTURE_PACKS.map((e) => `${e.key}:${e.variant}`));
    expect(seen.size).toBe(TEXTURE_PACKS.length);
  });
});

import { parseUserTextureName, userPackEntries } from '@/textures/packs';

describe('user photo packs', () => {
  it('parses key, variant and kind from file names', () => {
    expect(parseUserTextureName('/x/brownstone.0_color.jpg')).toEqual({ key: 'brownstone', variant: 0, kind: 'color' });
    expect(parseUserTextureName('/x/brickRed.2_normal.jpg')).toEqual({ key: 'brickRed', variant: 2, kind: 'normal' });
    expect(parseUserTextureName('/x/asphalt_rough.png')).toEqual({ key: 'asphalt', variant: 0, kind: 'rough' });
    expect(parseUserTextureName('/x/readme.txt')).toBeNull();
  });
  it('groups files into entries and requires a colour map', () => {
    const entries = userPackEntries({ 'a/brownstone.0_color.jpg': 'u1', 'a/brownstone.0_normal.jpg': 'u2', 'a/asphalt.1_normal.jpg': 'u3' });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ key: 'brownstone', variant: 0, color: 'u1', normal: 'u2', rough: '', repeat: 1.5 });
  });
});

import { TEXTURE_PACKS as PACKS } from '@/textures/packs';
describe('CC0 world sets', () => {
  const ids = (k: string): number[] => PACKS.filter((e) => e.key === k).map((e) => e.variant);
  it('cover the world materials and replace the older photo entries', () => {
    for (const k of ['brickRed', 'brickPainted', 'brownstone', 'asphalt', 'asphaltWorn', 'concrete', 'bluestone', 'corrugatedSteel', 'tarRoof', 'rollGate', 'castIronFence', 'waterTank']) {
      expect(ids(k).length, k).toBeGreaterThan(0);
    }
    expect(PACKS.find((e) => e.key === 'bluestone')!.color).toMatch(/bluestone_slate/);
    expect(PACKS.find((e) => e.key === 'concrete' && e.variant === 0)!.color).toMatch(/concrete_pavement/); // grey slabs, not brick pavers
    expect(PACKS.find((e) => e.key === 'asphalt' && e.variant === 0)!.color).toMatch(/cc0\/asphalt\//);
  });
  it('use the 512 px files in the artifact build and keep the painted colour for metals', () => {
    for (const e of PACKS.filter((x) => x.color.includes('/cc0/'))) expect(e.color).toMatch(/_512\./);
    for (const k of ['rollGate', 'castIronFence']) for (const e of PACKS.filter((x) => x.key === k)) expect(e.color).toBe('');
  });
});
