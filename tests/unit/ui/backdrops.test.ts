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
  it('the title screen cycles the shots as full-bleed pictures and the credits use the last, all optional', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const hud = new Hud(parent);
    const imgs = [...parent.querySelectorAll<HTMLImageElement>('.hud-art img')];
    expect(imgs.length).toBe(BACKDROPS.length);
    expect(imgs[0]!.src).toContain(`art/${BACKDROPS[0]!.file}`);
    expect(imgs[0]!.style.objectPosition).toBe(BACKDROPS[0]!.pos);
    // the first to load is shown, a later one waits its turn (the playtest of 18 Nov saw only one picture, ever)
    imgs[1]!.dispatchEvent(new Event('load'));
    imgs[0]!.dispatchEvent(new Event('load'));
    expect(imgs[1]!.classList.contains('on')).toBe(true);
    expect(imgs[0]!.classList.contains('on')).toBe(false);
    for (const im of imgs.slice(2)) im.dispatchEvent(new Event('error')); // a missing file is dropped
    expect(parent.querySelectorAll('.hud-art img').length).toBe(2);
    for (const im of imgs.slice(0, 2)) im.dispatchEvent(new Event('error')); // single-file build: none exists, the dark backdrop stays
    expect(parent.querySelector('.hud-art img')).toBeNull();
    expect(parent.querySelector('.hud-start')?.textContent).toBe('press space to start');
    void hud;
    const cr = new Credits(parent);
    cr.open();
    expect(parent.querySelector<HTMLImageElement>('.cr-art img')?.src).toContain(`art/${BACKDROPS[BACKDROPS.length - 1]!.file}`);
    void cr;
    parent.remove();
  });

  it('the loading screen cycles posters only once one has loaded, and the shots until then', async () => {
    const { BACKDROPS, POSTERS, LOADING_ART, artPool, isPoster } = await import('@/ui/backdrops');
    expect(LOADING_ART.length).toBe(BACKDROPS.length + POSTERS.length);
    expect(LOADING_ART.slice(0, BACKDROPS.length)).toEqual([...BACKDROPS]); // shot indexes are unchanged
    expect(artPool([0, 2, 3])).toEqual([0, 2, 3]);
    const p0 = BACKDROPS.length;
    expect(isPoster(p0)).toBe(true);
    expect(artPool([0, 2, p0, p0 + 3])).toEqual([p0, p0 + 3]);
    for (const p of POSTERS) expect(p.file).toMatch(/^loading\/poster-[a-z]+\.webp$/);
  });
});
