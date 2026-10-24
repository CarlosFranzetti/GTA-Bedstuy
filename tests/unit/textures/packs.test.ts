import { describe, it, expect } from 'vitest';
import { TEXTURE_PACKS } from '@/textures/packs';

describe('texture pack manifest', () => {
  it('every entry has asset urls and a positive repeat', () => {
    expect(TEXTURE_PACKS.length).toBeGreaterThanOrEqual(12);
    for (const e of TEXTURE_PACKS) {
      expect(typeof e.color).toBe('string'); expect(e.color.length).toBeGreaterThan(0);
      expect(typeof e.normal).toBe('string'); expect(typeof e.rough).toBe('string');
      expect(e.repeat).toBeGreaterThan(0); expect(e.normalScale).toBeGreaterThan(0);
    }
  });
  it('does not define the same key/variant twice', () => {
    const seen = new Set(TEXTURE_PACKS.map((e) => `${e.key}:${e.variant}`));
    expect(seen.size).toBe(TEXTURE_PACKS.length);
  });
});
