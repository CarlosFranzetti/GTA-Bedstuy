import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  MIN_TEX_SIDE, acquireScratch, canvasReleased, canvasStats, downscaleCanvas, releaseCanvasAfterUpload,
  releaseScratch, scratchPoolSize, setTextureTier, texScale, texSize, textureTier, trimScratch, wantsReliefMaps,
} from '@/textures/texTier';
import { loadTexturePacks, effectivePackEntries } from '@/textures/packs';
import { setAnisotropy } from '@/render/TierDetail';
import type { MaterialLibrary } from '@/textures/MaterialLibrary';

afterEach(() => { setTextureTier(null); trimScratch(); });

/** A canvas look-alike: width / height settable, getContext present. */
const fakeCanvas = (w: number, h: number): HTMLCanvasElement => ({ width: w, height: h, getContext: () => ({ drawImage() {}, imageSmoothingEnabled: true, imageSmoothingQuality: 'low' }) }) as unknown as HTMLCanvasElement;

describe('texture size by tier (the one API new textures use)', () => {
  it('is the full size off the phone tier and without a browser', () => {
    expect(textureTier()).toBe('high'); // node: no location
    for (const q of ['low', 'medium', 'high'] as const) {
      setTextureTier(q);
      expect(texSize(1024, 'surface')).toBe(1024);
      expect(texSize(2048, 'atlas')).toBe(2048);
      expect(texScale('skin')).toBe(1);
      expect(wantsReliefMaps()).toBe(true);
    }
  });
  it('halves most kinds on the phone tier (shop sheets and people go to 3/8) and never goes below the minimum side', () => {
    setTextureTier('phone');
    expect(texSize(1024)).toBe(512);
    expect(texSize(512, 'decal')).toBe(256);
    expect(texSize(2048, 'atlas')).toBe(768);   // shop-front sheets: 3/8 (the memory target of the second phone pass)
    expect(texSize(1024, 'skin')).toBe(512);
    expect(texSize(1024, 'ground')).toBe(768); // ground photos are seen up close
    expect(texSize(1024, 'people')).toBe(384);  // people are small on a phone screen
    expect(texSize(20, 'surface')).toBe(MIN_TEX_SIDE);
    expect(texSize(8, 'surface')).toBe(8); // already below the minimum: untouched
    expect(wantsReliefMaps()).toBe(false);
  });
  it('an explicit tier argument wins over the current one', () => {
    setTextureTier('phone');
    expect(texSize(1024, 'surface', 'high')).toBe(1024);
  });
});

describe('canvas release after upload', () => {
  it('does nothing on medium and high', () => {
    setTextureTier('high');
    const t = new THREE.Texture(fakeCanvas(512, 512));
    expect(releaseCanvasAfterUpload(t)).toBe(false);
    expect(t.onUpdate).toBeNull();
  });
  it('sets the canvas to 1 x 1 at the first upload on phone and low, once, and chains an existing hook', () => {
    for (const q of ['phone', 'low'] as const) {
      setTextureTier(q);
      const c = fakeCanvas(1024, 512);
      const t = new THREE.Texture(c);
      let chained = 0;
      t.onUpdate = () => { chained++; };
      const before = canvasStats.released;
      expect(releaseCanvasAfterUpload(t)).toBe(true);
      expect(c.width).toBe(1024); // not before the upload
      t.onUpdate!(t); // what WebGLTextures does after texImage2D
      expect([c.width, c.height]).toEqual([1, 1]);
      expect(canvasReleased(t)).toBe(true);
      expect(t.userData.gpuW).toBe(1024); // the size the GPU holds stays known for the estimate
      expect(chained).toBe(1);
      expect(canvasStats.released).toBe(before + 1);
      expect(t.onUpdate).toBeNull();
    }
  });
  it('leaves non-canvas images alone', () => {
    setTextureTier('phone');
    const img = { width: 64, height: 64 };
    const t = new THREE.Texture(img as unknown as HTMLImageElement);
    releaseCanvasAfterUpload(t);
    t.onUpdate!(t);
    expect(img.width).toBe(64);
  });
  it('a released texture is never re-uploaded by an anisotropy change', () => {
    const c = fakeCanvas(256, 256);
    const t = new THREE.Texture(c);
    t.anisotropy = 8;
    t.userData.canvasReleased = true;
    const root = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ map: t }));
    const v = t.version;
    expect(setAnisotropy(root, 2)).toBe(1);
    expect(t.anisotropy).toBe(2);
    expect(t.version).toBe(v);
  });
});

describe('scratch canvases are pooled', () => {
  it('reuses one canvas for consecutive paints and keeps at most two', () => {
    let made = 0;
    const make = (w: number, h: number): HTMLCanvasElement => { made++; return fakeCanvas(w, h); };
    const a = acquireScratch(make, 1024, 1024);
    releaseScratch(a);
    const b = acquireScratch(make, 512, 512);
    expect(b).toBe(a);
    expect([b.width, b.height]).toEqual([512, 512]);
    expect(made).toBe(1);
    const c = acquireScratch(make, 64, 64), d = acquireScratch(make, 64, 64), e = acquireScratch(make, 64, 64);
    releaseScratch(b); releaseScratch(c); releaseScratch(d); releaseScratch(e);
    expect(scratchPoolSize()).toBe(2);
    expect(e.width).toBe(1); // the third was freed at once
    trimScratch();
    expect(scratchPoolSize()).toBe(0);
  });
  it('downscaleCanvas returns the target size', () => {
    const out = downscaleCanvas(fakeCanvas(1024, 1024), fakeCanvas, 512, 512);
    expect([out.width, out.height]).toEqual([512, 512]);
  });
});

describe('photo packs on the phone tier', () => {
  const fakeLib = () => {
    const calls: Array<{ key: string; maps: { map?: THREE.Texture; normalMap?: THREE.Texture; roughnessMap?: THREE.Texture } }> = [];
    const mat = new THREE.MeshStandardMaterial({ roughness: 1 });
    return { calls, lib: { overrideMaps: (key: string, _v: number, maps: never) => { calls.push({ key, maps }); }, get: () => mat } as unknown as MaterialLibrary, mat };
  };
  const fakeLoader = () => {
    const urls: string[] = [];
    return { urls, loader: { loadAsync: (u: string) => { urls.push(u); return Promise.resolve(new THREE.Texture()); } } as unknown as THREE.TextureLoader };
  };
  it('requests no normal or roughness map file and hands none to the library', async () => {
    setTextureTier('phone');
    const { lib, calls } = fakeLib(), { loader, urls } = fakeLoader();
    const n = await loadTexturePacks(lib, 2, loader);
    expect(n).toBe(effectivePackEntries().size);
    const entries = [...effectivePackEntries().values()];
    const reliefUrls = new Set(entries.flatMap((e) => [e.normal, e.rough]).filter((u) => u && !entries.some((x) => x.color === u)));
    expect(reliefUrls.size).toBeGreaterThan(0);
    for (const u of urls) expect(reliefUrls.has(u)).toBe(false);
    for (const c of calls) { expect(c.maps.normalMap).toBeUndefined(); expect(c.maps.roughnessMap).toBeUndefined(); }
  });
  it('still loads them on the tiers that show them', async () => {
    setTextureTier('low');
    const { lib, calls } = fakeLib(), { loader } = fakeLoader();
    await loadTexturePacks(lib, 8, loader);
    expect(calls.some((c) => c.maps.normalMap !== undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------- the library and the atlas on the phone tier
import { Rng } from '@/core/Rng';
import { MaterialLibrary as Library } from '@/textures/MaterialLibrary';
import { buildSkinTexture, paintBox, skinLayoutFor, skinSizeNow } from '@/entities/models/carSkin';
import { paintCarSkin } from '@/textures/painters/vehicleSkin';

/** A canvas that records its size and accepts any 2D call (getImageData returns a flat grey image). */
function recCanvas(w: number, h: number) {
  const c = { width: w, height: h, sizes: [[w, h]] as number[][] } as { width: number; height: number; sizes: number[][]; getContext(): unknown };
  const ctx = new Proxy({}, {
    get: (_t, p: string) => {
      if (p === 'measureText') return (s: string) => ({ width: s.length * 6 });
      if (p === 'getImageData') return (_x: number, _y: number, gw: number, gh: number) => ({ data: new Uint8ClampedArray(gw * gh * 4).fill(128) });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (p === 'canvas') return c;
      return () => {};
    },
    set: () => true,
  });
  c.getContext = () => ctx;
  return c as unknown as HTMLCanvasElement & { sizes: number[][] };
}

describe('MaterialLibrary on the phone tier', () => {
  const sizes = (tier: 'phone' | 'high') => {
    setTextureTier(tier);
    const made: HTMLCanvasElement[] = [];
    const lib = new Library(new Rng(5), (w, h) => { const c = recCanvas(w, h); made.push(c); return c; });
    const mats = (['brickRed', 'asphalt', 'concrete', 'brownstone'] as const).map((k) => lib.get(k, 0) as THREE.MeshStandardMaterial);
    return { mats, made, lib };
  };
  it('keeps colour maps at half size, draws no normal or roughness maps, and frees the canvas after upload', () => {
    const { mats } = sizes('phone');
    const brick = mats[0];
    expect((brick.map!.image as HTMLCanvasElement).width).toBe(512); // painted at 1024, kept at 512
    expect(brick.normalMap).toBeNull();
    expect(brick.roughnessMap).toBeNull();
    expect(brick.map!.onUpdate).not.toBeNull();
    for (const m of mats) expect(m.normalMap).toBeNull();
    // the full-size painting canvas was a pooled scratch, not one canvas per texture
    expect(scratchPoolSize()).toBeLessThanOrEqual(2);
  });
  it('is the same as before on the high tier: full-size maps and relief', () => {
    const { mats } = sizes('high');
    expect((mats[0].map!.image as HTMLCanvasElement).width).toBe(1024);
    expect(mats[0].normalMap).not.toBeNull();
    expect(mats[0].map!.onUpdate).toBeNull();
  });
});

describe('car skins on the phone tier', () => {
  it('are half size and carry no normal map', () => {
    setTextureTier('phone');
    expect(skinSizeNow()).toBe(256);
    const mk = (w: number, h: number) => recCanvas(w, h);
    const layout = skinLayoutFor('sedan', paintBox(new THREE.BoxGeometry(1.9, 1.2, 4.5)), 0);
    const tex = buildSkinTexture(layout, skinSizeNow(), mk);
    expect(tex).not.toBeNull();
    expect(tex!.userData.normal).toBeUndefined();
    expect(tex!.image.width).toBe(256);
    setTextureTier('high');
    expect(skinSizeNow()).toBe(1024);
    const full = buildSkinTexture(layout, 1024, mk);
    expect(full!.userData.normal).toBeDefined();
  });
  it('paintCarSkin is untouched (imported to keep the dependency visible)', () => { expect(typeof paintCarSkin).toBe('function'); });
});
