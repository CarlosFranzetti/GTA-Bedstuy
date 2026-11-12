// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { BACKDROPS, backdropUrl } from '@/ui/backdrops';
import { Hud } from '@/ui/Hud';
import { Credits } from '@/ui/Credits';

describe('backdrop shots', () => {
  it('lists five distinct webp files with a focus position each', () => {
    expect(BACKDROPS.length).toBe(5);
    expect(new Set(BACKDROPS.map((b) => b.file)).size).toBe(5);
    for (const b of BACKDROPS) {
      expect(b.file).toMatch(/^[a-z0-9-]+\.webp$/);
      expect(b.pos).toMatch(/^\d+% \d+%$/);
      expect(b.caption.length).toBeGreaterThan(8);
    }
  });
  it('builds a page-relative URL under art/', () => {
    expect(backdropUrl(document, 'shot-car.webp')).toMatch(/\/art\/shot-car\.webp$/);
  });
  it('ships every file in public/art, 1920 wide pictures kept small (30 to 160 kB)', () => {
    for (const b of BACKDROPS) {
      const f = resolve(__dirname, '../../../public/art', b.file);
      expect(existsSync(f), b.file).toBe(true);
      const kb = statSync(f).size / 1024;
      expect(kb, b.file).toBeGreaterThan(30);
      expect(kb, b.file).toBeLessThan(160);
    }
  });
  it('the title screen uses the first shot as a full-bleed picture and the credits use the last, both optional', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const hud = new Hud(parent);
    const img = parent.querySelector<HTMLImageElement>('.hud-art img')!;
    expect(img.src).toContain(`art/${BACKDROPS[0]!.file}`);
    expect(img.style.objectPosition).toBe(BACKDROPS[0]!.pos);
    img.dispatchEvent(new Event('error')); // single-file build: the file is missing, the dark backdrop stays
    expect(parent.querySelector('.hud-art img')).toBeNull();
    expect(parent.querySelector('.hud-start')?.textContent).toBe('press space to start');
    void hud;
    const cr = new Credits(parent);
    cr.open();
    expect(parent.querySelector<HTMLImageElement>('.cr-art img')?.src).toContain(`art/${BACKDROPS[BACKDROPS.length - 1]!.file}`);
    void cr;
    parent.remove();
  });
});
