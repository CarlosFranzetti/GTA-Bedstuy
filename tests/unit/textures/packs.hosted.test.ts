import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import type { MaterialKey } from '@/world/types';
import type { MapOverride, MaterialLibrary } from '@/textures/MaterialLibrary';
import {
  BASE_TIER, TEXTURE_PACKS, TEXTURE_PROFILES, effectivePackEntries, loadTexturePacks, setPackAnisotropy, tierRank, type PackEntry,
} from '@/textures/packs';
import {
  IS_HOSTED, buildHostedManifest, describeBuild, parseHostedTextureName, pickUpgrades, resolveQuality, startHostedTextures,
  textureProfile, type MaterialSink, type TextureLoaderLike,
} from '@/textures/hosted';

/** Fake MaterialLibrary slice: remembers overrides and mimics applyOverride on the one cached material per id. */
function fakeMaterials() {
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const calls: { key: MaterialKey; variant: number; maps: MapOverride }[] = [];
  const sink: MaterialSink = {
    get(key, variant = 0) {
      const id = `${key}:${variant}`;
      let m = mats.get(id);
      if (!m) {
        m = new THREE.MeshStandardMaterial();
        m.map = new THREE.Texture(); m.normalMap = new THREE.Texture(); m.roughnessMap = new THREE.Texture();
        mats.set(id, m);
      }
      return m;
    },
    overrideMaps(key, variant, maps) {
      calls.push({ key, variant, maps });
      const m = this.get(key, variant) as THREE.MeshStandardMaterial;
      if (maps.map) m.map = maps.map;
      if (maps.normalMap) m.normalMap = maps.normalMap;
      if (maps.roughnessMap) m.roughnessMap = maps.roughnessMap;
      for (const t of [maps.map, maps.normalMap, maps.roughnessMap]) if (t) t.anisotropy = 8; // MaterialLibrary.applyOverride does this
    },
  };
  return { sink, mats, calls };
}

/** Fake loader: every url becomes a distinct Texture; remembers the request order. */
function fakeLoader(failOn?: string) {
  const urls: string[] = [];
  const loader: TextureLoaderLike = {
    async loadAsync(url) {
      urls.push(url);
      if (failOn && url.includes(failOn)) throw new Error('404');
      const t = new THREE.Texture();
      t.name = url;
      return t;
    },
  };
  return { loader, urls };
}

const FILES = {
  '/src/assets/textures/2k/asphalt.0_color.jpg': 'u/asphalt0-2k-c.jpg',
  '/src/assets/textures/2k/asphalt.0_normal.jpg': 'u/asphalt0-2k-n.jpg',
  '/src/assets/textures/2k/asphalt.0_rough.jpg': 'u/asphalt0-2k-r.jpg',
  '/src/assets/textures/2k/brownstone_color.jpg': 'u/brownstone0-2k-c.jpg', // colour only, variant defaults to 0
};
const now = () => Promise.resolve();

describe('hosted manifest parsing', () => {
  it('parses tier, key, variant and kind from larger-tier file names', () => {
    expect(parseHostedTextureName('/a/textures/2k/brickRed.2_normal.jpg')).toEqual({ tier: '2k', key: 'brickRed', variant: 2, kind: 'normal' });
    expect(parseHostedTextureName('/a/textures/4k/asphalt_rough.webp')).toEqual({ tier: '4k', key: 'asphalt', variant: 0, kind: 'rough' });
    expect(parseHostedTextureName('/a/textures/2k/readme.txt')).toBeNull();
    expect(parseHostedTextureName('/a/textures/brick_red_color.jpg')).toBeNull(); // no tier folder: that is a base 1K file
  });

  it('groups files into sets, requires a colour map and inherits material parameters from the 1K entry', () => {
    const m = buildHostedManifest({ ...FILES, '/x/2k/limestone.0_normal.jpg': 'orphan' });
    expect(Object.keys(m).sort()).toEqual(['asphalt:0', 'brownstone:0']); // limestone has no colour map -> dropped
    const [asphalt] = m['asphalt:0'];
    const base = TEXTURE_PACKS.find((e) => e.key === 'asphalt' && e.variant === 0)!;
    expect(asphalt).toMatchObject({ tier: '2k', color: 'u/asphalt0-2k-c.jpg', normal: 'u/asphalt0-2k-n.jpg', rough: 'u/asphalt0-2k-r.jpg', repeat: base.repeat, normalScale: base.normalScale });
    expect(m['brownstone:0'][0]).toMatchObject({ normal: '', rough: '' });
  });

  it('orders tiers ascending and falls back to per-key defaults when no 1K entry exists', () => {
    const m = buildHostedManifest({ '/x/4k/rollGate.0_color.jpg': 'g4', '/x/2k/rollGate.0_color.jpg': 'g2' }, new Map());
    expect(m['rollGate:0'].map((s) => s.tier)).toEqual(['2k', '4k']);
    expect(m['rollGate:0'][0]).toMatchObject({ repeat: 1, normalScale: 0.8, roughness: 0.9 });
  });

  it('picks the best tier within the cap, never the base tier, and honours skips', () => {
    const m = buildHostedManifest({ ...FILES, '/x/4k/asphalt.0_color.jpg': 'a4' });
    expect(pickUpgrades(m, '1k')).toEqual([]);
    expect(pickUpgrades(m, '2k').map((s) => `${s.key}:${s.tier}`).sort()).toEqual(['asphalt:2k', 'brownstone:2k']);
    expect(pickUpgrades(m, '4k').find((s) => s.key === 'asphalt')?.tier).toBe('4k');
    expect(pickUpgrades(m, '2k', new Set(['asphalt:0'])).map((s) => s.key)).toEqual(['brownstone']);
  });

  it('ranks tiers numerically', () => {
    expect([tierRank('1k'), tierRank('2k'), tierRank('4k'), tierRank('big')]).toEqual([1, 2, 4, 0]);
    expect(BASE_TIER).toBe('1k');
  });

  it('is empty today: no larger tier ships until a licence-checked set is added', () => {
    expect(describeBuild()).toEqual({ hosted: false, tiers: ['1k'] });
  });
});

describe('quality and the ultra flag', () => {
  it('maps ?q= to a renderer quality; ultra is high plus a flag, hosted build only', () => {
    expect(resolveQuality('low', false, true)).toEqual({ quality: 'low', ultra: false });
    expect(resolveQuality('high', false, true)).toEqual({ quality: 'high', ultra: false });
    expect(resolveQuality('ultra', false, true)).toEqual({ quality: 'high', ultra: true });
    expect(resolveQuality('ultra', false, false)).toEqual({ quality: 'high', ultra: false }); // artifact: plain high
  });
  it('falls back to the device default for missing or unknown values', () => {
    expect(resolveQuality(null, false)).toEqual({ quality: 'medium', ultra: false });
    expect(resolveQuality(undefined, true)).toEqual({ quality: 'low', ultra: false });
    expect(resolveQuality('4k', false)).toEqual({ quality: 'medium', ultra: false });
  });
  it('ultra textures: highest tier 2K and anisotropy 16; standard keeps the 1K base and the library anisotropy', () => {
    expect(textureProfile(true)).toBe(TEXTURE_PROFILES.ultra);
    expect(TEXTURE_PROFILES.ultra).toEqual({ maxTier: '2k', anisotropy: 16 });
    expect(TEXTURE_PROFILES.standard).toEqual({ maxTier: '1k', anisotropy: null });
  });
});

describe('artifact mode is a no-op', () => {
  it('is not hosted under vitest', () => { expect(IS_HOSTED).toBe(false); });

  it('does not schedule, load, swap or retune anything', async () => {
    const { sink, calls } = fakeMaterials();
    const { loader, urls } = fakeLoader();
    const schedule = vi.fn(now);
    const handle = startHostedTextures(sink, { hosted: false, ultra: true, files: FILES, loader, schedule, maxAnisotropy: 16 });
    const r = await handle.done;
    expect(r).toEqual({ upgraded: 0, retuned: 0, tier: '1k', skipped: true });
    expect(schedule).not.toHaveBeenCalled();
    expect(urls).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('defaults to the build flag (false here), so the bare call changes nothing', async () => {
    const { sink, calls } = fakeMaterials();
    expect((await startHostedTextures(sink).done).skipped).toBe(true);
    expect(calls).toEqual([]);
  });
});

describe('hosted swap path (fake loader)', () => {
  it('standard quality never downloads a larger tier', async () => {
    const { sink, calls } = fakeMaterials();
    const { loader, urls } = fakeLoader();
    const r = await startHostedTextures(sink, { hosted: true, files: FILES, loader, schedule: now }).done;
    expect(r).toMatchObject({ upgraded: 0, tier: '1k', skipped: false });
    expect(urls).toEqual([]); expect(calls).toEqual([]);
  });

  it('ultra swaps 2K sets in through overrideMaps with the 1K entry parameters', async () => {
    const { sink, calls, mats } = fakeMaterials();
    const { loader, urls } = fakeLoader();
    const old = sink.get('asphalt', 0) as THREE.MeshStandardMaterial;
    const oldMap = old.map!; const disposed = vi.fn(); oldMap.addEventListener('dispose', disposed);
    const r = await startHostedTextures(sink, { hosted: true, ultra: true, maxAnisotropy: 16, files: FILES, loader, schedule: now }).done;
    expect(r).toMatchObject({ upgraded: 2, tier: '2k', skipped: false });
    expect(urls.sort()).toEqual(['u/asphalt0-2k-c.jpg', 'u/asphalt0-2k-n.jpg', 'u/asphalt0-2k-r.jpg', 'u/brownstone0-2k-c.jpg']);
    const a = calls.find((c) => c.key === 'asphalt')!;
    const base = TEXTURE_PACKS.find((e) => e.key === 'asphalt' && e.variant === 0)!;
    expect(a.variant).toBe(0);
    expect(a.maps.map!.name).toBe('u/asphalt0-2k-c.jpg');
    expect(a.maps.map!.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(a.maps.normalMap!.colorSpace).toBe(THREE.NoColorSpace);
    expect(a.maps.repeat).toEqual({ x: base.repeat, y: base.repeat });
    expect(a.maps.normalScale).toBe(base.normalScale);
    expect(mats.get('asphalt:0')!.map).toBe(a.maps.map);
    expect(disposed).toHaveBeenCalled(); // the replaced 1K map is freed
  });

  it('keeps the existing normal / roughness maps when the larger set only has a colour map', async () => {
    const { sink, calls } = fakeMaterials();
    const { loader } = fakeLoader();
    const m = sink.get('brownstone', 0) as THREE.MeshStandardMaterial;
    const [n, r] = [m.normalMap, m.roughnessMap];
    await startHostedTextures(sink, { hosted: true, ultra: true, files: FILES, loader, schedule: now }).done;
    const b = calls.find((c) => c.key === 'brownstone')!;
    expect(b.maps.map!.name).toBe('u/brownstone0-2k-c.jpg');
    expect(b.maps.normalMap).toBe(n);
    expect(b.maps.roughnessMap).toBe(r);
  });

  it('raises anisotropy to the clamped ultra value on swapped textures and on already-loaded packs', async () => {
    const { sink, calls } = fakeMaterials();
    const { loader } = fakeLoader();
    // populate the pack registry through the real first-pass loader (fake library + fake loader)
    const lib = fakeMaterials();
    const first = fakeLoader();
    const n = await loadTexturePacks({ ...lib.sink } as unknown as MaterialLibrary, 8, first.loader as unknown as THREE.TextureLoader);
    expect(n).toBe(effectivePackEntries().size);
    const loaded = lib.calls[0].maps.map!;
    expect(loaded.anisotropy).toBe(8);
    const r = await startHostedTextures(sink, { hosted: true, ultra: true, maxAnisotropy: 12, files: FILES, loader, schedule: now }).done;
    expect(r.retuned).toBeGreaterThan(n); // every first-pass texture plus the swapped ones
    expect(loaded.anisotropy).toBe(12); // min(16, renderer max)
    expect(calls[0].maps.map!.anisotropy).toBe(12);
    const r2 = await startHostedTextures(sink, { hosted: true, ultra: true, maxAnisotropy: 64, files: {}, loader, schedule: now }).done;
    expect(r2.retuned).toBeGreaterThan(0);
    expect(loaded.anisotropy).toBe(16);
  });

  it('leaves user photo packs alone', async () => {
    const { sink, calls } = fakeMaterials();
    const { loader } = fakeLoader();
    await startHostedTextures(sink, { hosted: true, ultra: true, files: FILES, loader, schedule: now, skip: new Set(['asphalt:0']) }).done;
    expect(calls.map((c) => c.key)).toEqual(['brownstone']);
  });

  it('waits for the schedule before touching the loader, and cancel() stops everything', async () => {
    const { sink, calls } = fakeMaterials();
    const { loader, urls } = fakeLoader();
    let go!: () => void;
    const schedule = () => new Promise<void>((r) => { go = r; });
    const h = startHostedTextures(sink, { hosted: true, ultra: true, files: FILES, loader, schedule });
    await Promise.resolve();
    expect(urls).toEqual([]);
    h.cancel(); go();
    expect(await h.done).toMatchObject({ upgraded: 0, skipped: true });
    expect(urls).toEqual([]); expect(calls).toEqual([]);
  });

  it('survives a failing set: warns, continues with the others, never rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { sink, calls } = fakeMaterials();
    const { loader } = fakeLoader('asphalt0');
    const r = await startHostedTextures(sink, { hosted: true, ultra: true, files: FILES, loader, schedule: now }).done;
    expect(r.upgraded).toBe(1);
    expect(calls.map((c) => c.key)).toEqual(['brownstone']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('pack helpers used by the hosted path', () => {
  it('user photos win over built-in entries in the effective set', () => {
    const user: PackEntry = { ...TEXTURE_PACKS[0], color: 'user-c' };
    const eff = effectivePackEntries(TEXTURE_PACKS, [user]);
    expect(eff.get(`${user.key}:${user.variant}`)!.color).toBe('user-c');
    expect(eff.size).toBe(effectivePackEntries(TEXTURE_PACKS, []).size);
  });
  it('setPackAnisotropy ignores nonsense and counts changes only', () => {
    const t = new THREE.Texture();
    expect(setPackAnisotropy(0, [t])).toBe(0);
    expect(setPackAnisotropy(4, [t])).toBeGreaterThanOrEqual(1);
    expect(setPackAnisotropy(4, [t])).toBe(0);
    expect(t.anisotropy).toBe(4);
  });
});

describe('scripts/make-artifact.mjs', () => {
  const load = async () => (await import(/* @vite-ignore */ ['..', '..', '..', 'scripts', 'make-artifact.mjs'].join('/'))) as {
    toArtifact(src: string): string; isSingleFile(src: string): boolean; ARTIFACT_MAX_BYTES: number; ARTIFACT_WARN_BYTES: number;
  };
  const single = '<!doctype html><html><head><title>T</title><meta name="description" content="d"><style>a{}</style><script type="module">const s="<script src=x></script>";</script></head><body><div id="app"></div></body></html>';
  const hosted = '<!doctype html><html><head><title>T</title><script type="module" src="./assets/index-abc.js"></script><link rel="stylesheet" href="./assets/i.css"></head><body></body></html>';

  it('tells a single-file page from a hosted one, ignoring tag-like text inside inlined code', async () => {
    const m = await load();
    expect(m.isSingleFile(single)).toBe(true);
    expect(m.isSingleFile(hosted)).toBe(false);
  });
  it('keeps title, description, styles, body and scripts; drops the document skeleton', async () => {
    const out = (await load()).toArtifact(single);
    expect(out).toContain('<title>T</title>'); expect(out).toContain('<meta name="description"'); expect(out).toContain('<div id="app"></div>'); expect(out).toContain('<script type="module">');
    expect(out).not.toContain('<!doctype'); expect(out).not.toContain('<head>');
  });
  it('budget: warn at 10 MB, fail above 12 MB, under the 16 MB platform limit', async () => {
    const m = await load();
    expect(m.ARTIFACT_WARN_BYTES).toBe(10_000_000); expect(m.ARTIFACT_MAX_BYTES).toBe(12_000_000);
  });
});
