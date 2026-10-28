import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import type { IMaterialLibrary, Lot, MaterialKey, PoiDef } from '@/world/types';
import { LotBatch, loadMats } from '@/world/buildings/facade';
import type { LotCtx } from '@/world/buildings/facade';
import {
  AWN_OUT, GROUND_FLOOR_H, SHOP_H, StorefrontKit, awningRunLength, awningTextWidth, buildMixedUse, signFaceWidth, disposeStorefrontKits, getStorefrontKit,
  isNightHour, isStoreClosed, planStorefront, resolveStorefront, setStorefrontCanvasFactory, setStorefrontHour,
  type StorefrontPlan, type StorefrontSpec,
} from '@/world/buildings/mixeduse';
import { STICKER_SLOTS, STORE_KINDS, STORE_NAMES, STORE_SIGNS, classifyArchetype, layoutSign, type StoreKind } from '@/textures/painters/storefront-art';
import { subdivideLots } from '@/world/LotSubdivider';
import { buildBuildings } from '@/world/BuildingGen';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { getBedstuyFaces } from '@/world/data/faces';

// ---------------------------------------------------------------------------------------------- fakes

/** Canvas whose 2D context accepts every call (the pixel-fake style) and measures text from the font size. */
function fakeCanvas(width: number, height: number): HTMLCanvasElement {
  const state: Record<string, unknown> = { font: '10px sans-serif', globalAlpha: 1, textAlign: 'start' };
  const ctx = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'measureText') {
        return (text: string) => ({ width: text.length * (parseFloat(/(\d+(?:\.\d+)?)px/.exec(String(state.font))?.[1] ?? '10')) * 0.6 });
      }
      if (prop in state) return state[prop];
      return () => undefined;
    },
    set(_t, prop: string, v) {
      state[prop] = v;
      return true;
    },
  });
  return { width, height, getContext: () => ctx } as unknown as HTMLCanvasElement;
}

class StubMaterials implements IMaterialLibrary {
  nightCalls: boolean[] = [];
  private cache = new Map<string, THREE.Material>();
  private mk(k: string): THREE.Material {
    let m = this.cache.get(k);
    if (!m) { m = new THREE.MeshBasicMaterial(); m.name = k; this.cache.set(k, m); }
    return m;
  }
  get(key: MaterialKey, variant = 0): THREE.Material { return this.mk(`${key}:${variant}`); }
  awning(color: string, text: string): THREE.Material { return this.mk(`awning:${color}:${text}`); }
  sign(text: string, bg = '', fg = ''): THREE.Material { return this.mk(`sign:${text}:${bg}:${fg}`); }
  carPaint(color: string): THREE.Material { return this.mk(`car:${color}`); }
  setNight(n: boolean): void { this.nightCalls.push(n); }
}

function lotOf(id: string, W: number, D: number, corner: boolean, extra: Partial<Lot> = {}): Lot {
  return {
    id, blockId: 'r0c0', side: 'W', frontA: { x: 0, z: 0 }, frontB: { x: W, z: 0 }, width: W, depth: D,
    outward: { x: 0, z: 1 }, type: 'mixeduse', corner, ...extra,
  };
}

interface Built { geoms: { name: string; mat: THREE.Material; g: THREE.BufferGeometry }[]; kit: StorefrontKit; lib: StubMaterials; ctx: LotCtx }

function buildLot(lot: Lot, cs: 'left' | 'right' | null, spec?: LotCtx['spec'], lib = new StubMaterials()): Built {
  const b = new LotBatch();
  const ctx: LotCtx = { b, m: loadMats(lib), rng: new Rng(Rng.hash(lot.id)), W: lot.width, D: lot.depth, lot, cornerSide: cs, spec };
  buildMixedUse(ctx);
  b.flush(new THREE.Matrix4());
  const geoms = b.merged().map((x) => ({ name: x.material.name, mat: x.material, g: x.geometry }));
  return { geoms, kit: getStorefrontKit(lib), lib, ctx };
}

function verts(g: THREE.BufferGeometry): THREE.Vector3[] {
  const p = g.getAttribute('position');
  return Array.from({ length: p.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p, i));
}

beforeEach(() => setStorefrontCanvasFactory(fakeCanvas));
afterEach(() => {
  disposeStorefrontKits();
  setStorefrontCanvasFactory(undefined);
});

const SPEC = (kind: StoreKind, over: Partial<StorefrontSpec> = {}): StorefrontSpec => ({
  kind, cuisine: kind === 'restaurant' ? 'soul' : null, name: STORE_NAMES[kind][0], signCopy: STORE_SIGNS[kind][0], awningColor: '#d62828', closesAt: 23, shuttered: false,
  floorsAbove: null, ...over,
});

// ---------------------------------------------------------------------------------------------- aspect

describe('awning and sign textures are sized from the real geometry', () => {
  it('every tile has one pixel density across and down, and covers what it is mapped onto', () => {
    const W = 10.4, D = 16;
    const lot = lotOf('c-left', W, D, true);
    const built = buildLot(lot, 'left');
    const tiles = built.kit.tiles;
    expect(tiles.length).toBeGreaterThanOrEqual(6); // lettered valance + slope, plain pair, sign faces
    for (const t of tiles) {
      const ppmX = t.w / t.widthM, ppmY = t.h / t.heightM;
      expect(Math.abs(ppmX / ppmY - 1), `${t.kind} ${t.text}`).toBeLessThan(0.04);
    }
    const spec = resolveStorefront(lot, null);
    const plan = planStorefront(spec, W, D, 'left', new Rng(Rng.hash('c-left:plan')));
    // lettering tile: exactly the width the name needs (or the whole run when the name is long), whatever the frontage
    const lettered = tiles.filter((t) => t.kind === 'awning-valance' && t.text === spec.name).map((t) => t.widthM);
    expect(lettered.length).toBeGreaterThanOrEqual(1);
    const front = plan.awning!.front;
    const need = awningTextWidth(spec.name);
    for (const w of lettered) {
      const full = awningRunLength(front.b - front.a, true, false);
      expect(Math.abs(w - need) < 0.011 || Math.abs(w - full) < 0.011 || w < full + 0.5, `lettered ${w} vs ${need}`).toBe(true);
    }
    // lightbox faces: a width class that fits inside the box span
    const signs = tiles.filter((t) => t.kind === 'sign' || t.kind === 'board');
    expect(signs.length).toBeGreaterThanOrEqual(2); // front + cross street
    for (const t of signs) {
      const widest = Math.max(plan.sign.front.b - plan.sign.front.a, plan.sign.side!.b - plan.sign.side!.a) - 0.14;
      expect(t.widthM, t.text).toBeLessThanOrEqual(widest + 1e-9);
      expect(t.widthM, t.text).toBe(signFaceWidth(t.widthM + 0.001));
    }
  });

  it('on the mesh, valance and sign UVs advance as many texels per metre across as up', () => {
    const built = buildLot(lotOf('mesh-aspect', 9.2, 15, true), 'left', { storefront: 'bodega' } as LotCtx['spec']);
    let valance = 0, sign = 0;
    for (const { name, mat, g } of built.geoms) {
      if (!/^sf:(awning|sign|board):/.test(name)) continue;
      const map = (mat as THREE.MeshStandardMaterial).map!.image as { width: number; height: number };
      const p = g.getAttribute('position') as THREE.BufferAttribute, uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i += 3) {
        const v = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, i + k));
        const t = [0, 1, 2].map((k) => new THREE.Vector2().fromBufferAttribute(uv, i + k));
        const n = v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).normalize();
        if (Math.abs(n.y) > 0.05) continue; // vertical faces only (valance, sign face)
        const du = Math.max(...t.map((q) => q.x)) - Math.min(...t.map((q) => q.x));
        const dv = Math.max(...t.map((q) => q.y)) - Math.min(...t.map((q) => q.y));
        if (du * map.width < 8 || dv * map.height < 8) continue; // end caps, scallop tips: colour only
        const dy = Math.max(...v.map((q) => q.y)) - Math.min(...v.map((q) => q.y));
        const dh = Math.hypot(Math.max(...v.map((q) => q.x)) - Math.min(...v.map((q) => q.x)), Math.max(...v.map((q) => q.z)) - Math.min(...v.map((q) => q.z)));
        if (dy < 0.05 || dh < 0.05) continue;
        const across = (du * map.width) / dh, up = (dv * map.height) / dy;
        expect(Math.abs(across / up - 1), `${name} texels per metre ${across.toFixed(1)} x ${up.toFixed(1)}`).toBeLessThan(0.06);
        if (name.startsWith('sf:awning')) valance++; else sign++;
      }
    }
    expect(valance).toBeGreaterThanOrEqual(6); // lettered + plain pieces on both faces
    expect(sign).toBeGreaterThanOrEqual(4); // front + side face
  });

  it('a wider frontage gets a longer lightbox, the same density, and the same lettering tile for the same name', () => {
    const narrow = buildLot(lotOf('mid-a', 6, 15, false), null, { storefront: { archetype: 'bodega', name: 'SAME NAME DELI', shuttered: false } } as unknown as LotCtx['spec']).kit;
    const nTiles = [...narrow.tiles];
    disposeStorefrontKits();
    const wide = buildLot(lotOf('mid-b', 9, 15, false), null, { storefront: { archetype: 'bodega', name: 'SAME NAME DELI', shuttered: false } } as unknown as LotCtx['spec']).kit;
    const pick = (tiles: typeof nTiles, kind: string) => tiles.find((t) => t.kind === kind && !t.text.startsWith('plain'))!;
    expect(pick(wide.tiles, 'sign').widthM).toBeGreaterThan(pick(nTiles, 'sign').widthM);
    expect(pick(wide.tiles, 'awning-valance').widthM).toBe(pick(nTiles, 'awning-valance').widthM);
    for (const k of ['awning-valance', 'sign']) {
      const a = pick(nTiles, k), b = pick(wide.tiles, k);
      expect(Math.abs(a.w / a.widthM / (b.w / b.widthM) - 1), k).toBeLessThan(0.03);
    }
  });

  it('shops with the same name share one lettering tile; a thousand shops need few tiles', () => {
    const lib = new StubMaterials();
    for (let i = 0; i < 40; i++) buildLot(lotOf(`share-${i}`, 7 + (i % 4), 15, false), null, { storefront: { archetype: 'deli', name: 'ONE NAME DELI', shuttered: false } } as unknown as LotCtx['spec'], lib);
    const kit = getStorefrontKit(lib);
    expect(kit.tiles.filter((t) => t.kind === 'awning-valance' && t.text === 'ONE NAME DELI').length).toBe(1);
    expect(kit.tiles.filter((t) => t.kind === 'sign').length).toBeLessThanOrEqual(4); // one copy, a few width classes
  });

  it('unauthored shops print the name on the awning and the trade on the lit box; authored ones print their own text on both', () => {
    for (const kind of STORE_KINDS) {
      const s = resolveStorefront(lotOf(`copy-${kind}`, 8, 15, false), { storefront: kind });
      if (kind === 'church' || kind === 'daycare') expect(s.signCopy).toBe(s.name);
      else {
        expect(s.signCopy).not.toBe(s.name);
        expect(STORE_SIGNS[kind]).toContain(s.signCopy);
        // the trade copy classifies as the same art archetype as the shop
        const a = classifyArchetype(s.signCopy);
        if (kind === 'bodega' || kind === 'deli') expect(a).toBe('bodega');
        if (kind === 'barber') expect(a).toBe('barber');
        if (kind === 'restaurant') expect(a).toBe('kitchen');
        if (kind === 'liquor') expect(a).toBe('liquor');
        expect(layoutSign(s.signCopy).mainLine.length).toBeGreaterThan(2);
      }
    }
    const poi: PoiDef = { id: 'p', block: 'r0c0', face: 'W', t: 0.1, archetype: 'bodega', sign: 'TROOP DELI & GROCERY  ·  OPEN 25 HRS', awningColor: '#d62828' };
    const s = resolveStorefront({ ...lotOf('poi-1', 8, 15, true), poi });
    expect(s.signCopy).toBe(s.name);
  });
});

// ---------------------------------------------------------------------------------------------- archetypes

describe('archetype to layout', () => {
  it('is deterministic: the same spec and lot give the same plan and the same geometry', () => {
    for (const kind of STORE_KINDS) {
      for (const cs of [null, 'left', 'right'] as const) {
        const a = planStorefront(SPEC(kind), 9, 16, cs, new Rng(5));
        const b = planStorefront(SPEC(kind), 9, 16, cs, new Rng(5));
        expect(JSON.stringify(a), `${kind} ${cs}`).toBe(JSON.stringify(b));
      }
    }
    const geo = (): number[] => buildLot(lotOf('det-1', 8, 15, false), null).geoms.map((x) => x.g.getAttribute('position').count);
    const g1 = geo();
    disposeStorefrontKits();
    expect(geo()).toEqual(g1);
  });

  it('every kind lays out differently where it should: stickers, awning, lit box, door', () => {
    const plans = Object.fromEntries(STORE_KINDS.map((k) => [k, planStorefront(SPEC(k, { closesAt: null }), 8, 15, null, new Rng(9))])) as Record<StoreKind, StorefrontPlan>;
    const stickerKinds = (k: StoreKind): string[] => plans[k].stickers.map((s) => s.kind);
    expect(stickerKinds('bodega')).toEqual(expect.arrayContaining(['open', 'h24']));
    expect(stickerKinds('liquor')).toContain('lotto');
    expect(stickerKinds('restaurant')).toContain('menu');
    for (const k of ['church', 'daycare'] as const) expect(plans[k].stickers).toEqual([]);
    // churches get no awning and an unlit painted board; day cares an unlit board; the rest a lit box
    expect(plans.church.awning).toBeNull();
    expect(plans.church.sign.lit).toBe(false);
    expect(plans.daycare.sign.lit).toBe(false);
    expect(plans.daycare.awning).not.toBeNull();
    for (const k of ['bodega', 'deli', 'barber', 'laundromat', 'liquor', 'pharmacy', 'restaurant', 'cellphone', 'generic'] as const) {
      expect(plans[k].sign.lit, k).toBe(true);
      expect(plans[k].sign.depth, k).toBeGreaterThan(plans.church.sign.depth);
      expect(plans[k].door, k).not.toBeNull();
      expect(plans[k].glass.length, k).toBeGreaterThanOrEqual(1);
    }
    // stickers sit inside the glazing and never overlap
    for (const k of STORE_KINDS) {
      const run = plans[k].glass[0];
      const spans = plans[k].stickers.filter((s) => s.face === 'front').map((s) => [s.at - STICKER_SLOTS[s.kind].wM / 2, s.at + STICKER_SLOTS[s.kind].wM / 2]);
      spans.sort((a, b) => a[0] - b[0]);
      spans.forEach(([a, b], i) => {
        expect(a, k).toBeGreaterThanOrEqual(run.a);
        expect(b, k).toBeLessThanOrEqual(run.b);
        if (i) expect(a, k).toBeGreaterThanOrEqual(spans[i - 1][1] - 1e-9);
      });
    }
  });

  it('reads the storefront from the lot spec (string or object), then the POI, then picks deterministically', () => {
    const lot = lotOf('data-1', 8, 15, false);
    expect(resolveStorefront(lot, { storefront: 'laundromat' }).kind).toBe('laundromat');
    expect(resolveStorefront(lot, { storefront: 'chinese' })).toMatchObject({ kind: 'restaurant', cuisine: 'chinese' });
    expect(resolveStorefront(lot, { storefront: { archetype: 'caribbean', name: 'MY SHOP' } })).toMatchObject({ kind: 'restaurant', cuisine: 'caribbean', name: 'MY SHOP' });
    expect(resolveStorefront(lot, { storefront: 'cellphone' }).kind).toBe('cellphone');
    const poi: PoiDef = { id: 'p', block: 'r0c0', face: 'W', t: 0.1, archetype: 'barbershop', sign: 'GARVEY CUTZ', awningColor: '#111111' };
    const fromPoi = resolveStorefront({ ...lot, poi });
    expect(fromPoi).toMatchObject({ kind: 'barber', name: 'GARVEY CUTZ', awningColor: '#111111' });
    // floors: spec.floors counts storeys, so a 4-storey mixed lot has 3 above the shop
    expect(resolveStorefront(lot, { storefront: 'bodega', floors: 4 }).floorsAbove).toBe(3);
    // nothing given: stable by lot id, and every pooled kind is reachable across lots
    expect(resolveStorefront(lot)).toEqual(resolveStorefront(lot));
    const kinds = new Set<StoreKind>();
    for (let i = 0; i < 400; i++) kinds.add(resolveStorefront(lotOf(`x-${i}`, 8, 15, i % 3 === 0)).kind);
    expect(kinds.size).toBeGreaterThanOrEqual(10);
    // corner lots lean bodega
    let b = 0;
    for (let i = 0; i < 200; i++) if (resolveStorefront(lotOf(`k-${i}`, 10, 16, true)).kind === 'bodega') b++;
    expect(b).toBeGreaterThan(60);
  });

  it('the sign copy classifies back to its kind (restaurants by cuisine) and shops get parody names only', () => {
    for (const kind of STORE_KINDS) {
      for (let i = 0; i < 12; i++) {
        const s = resolveStorefront(lotOf(`n-${kind}-${i}`, 8, 15, false), { storefront: kind });
        expect(s.kind).toBe(kind);
        const art = classifyArchetype(s.name);
        if (kind === 'bodega' || kind === 'deli') expect(art).toBe('bodega');
        if (kind === 'barber') expect(art).toBe('barber');
        if (kind === 'church') expect(art).toBe('church');
        if (kind === 'restaurant') expect(['kitchen', 'pizza']).toContain(art);
      }
    }
  });

  it('every archetype builds finite geometry on both lot kinds', () => {
    for (const kind of STORE_KINDS) {
      for (const [cs, id] of [[null, 'f-mid'], ['left', 'f-l'], ['right', 'f-r']] as const) {
        const { geoms } = buildLot(lotOf(`${id}-${kind}`, cs ? 10.5 : 7.5, 15, !!cs), cs, { storefront: kind } as LotCtx['spec']);
        expect(geoms.length).toBeGreaterThan(5);
        for (const { g } of geoms) {
          for (const name of ['position', 'normal', 'uv']) {
            const a = g.getAttribute(name);
            for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) throw new Error(`NaN in ${name} for ${kind} ${cs}`);
          }
        }
        disposeStorefrontKits();
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------- corner wrap

describe('corner shops wrap the corner', () => {
  const W = 10.4, D = 16;

  it('plan: cross-street glazing, awning and sign on both faces, corner door instead of a set-back door', () => {
    for (const cs of ['left', 'right'] as const) {
      const p = planStorefront(SPEC('bodega'), W, D, cs, new Rng(3));
      expect(p.corner).toBe(true);
      expect(p.mirror).toBe(cs === 'right');
      expect(p.door).toBeNull();
      expect(p.cut).toBeGreaterThan(1);
      expect(p.sideGlass).not.toBeNull();
      expect(p.awning!.side).not.toBeNull();
      expect(p.sign.side).not.toBeNull();
      expect(p.sideGlass!.a).toBeGreaterThan(p.cut);
      expect(p.sideGlass!.b).toBeLessThan(D - 2);
      expect(p.glass[0].a).toBeGreaterThan(p.cut);
    }
    const mid = planStorefront(SPEC('bodega'), 7, D, null, new Rng(3));
    expect(mid.corner).toBe(false);
    expect(mid.door).not.toBeNull();
    expect(mid.sideGlass).toBeNull();
    expect(mid.awning!.side).toBeNull();
    expect(mid.sign.side).toBeNull();
    expect(mid.cut).toBe(0);
  });

  it('geometry: the awning mitres past the corner and the sign returns onto the cross street, on the right side', () => {
    for (const cs of ['left', 'right'] as const) {
      const { geoms } = buildLot(lotOf(`wrap-${cs}`, W, D, true), cs);
      const awnings = geoms.filter((x) => x.name.startsWith('sf:awning:')).flatMap((x) => verts(x.g));
      const signs = geoms.filter((x) => x.name.startsWith('sf:sign:')).flatMap((x) => verts(x.g));
      const cornerX = cs === 'left' ? 0 : W;
      const out = cs === 'left' ? -1 : 1;
      // the outer awning corner sits AWN_OUT out along both streets
      expect(awnings.some((v) => Math.abs(v.x - (cornerX + out * AWN_OUT)) < 1e-6 && Math.abs(v.z - AWN_OUT) < 1e-6), cs).toBe(true);
      // the cross-street awning and sign run back along the side wall
      expect(Math.min(...awnings.map((v) => v.z)), cs).toBeLessThan(-4);
      expect(Math.min(...signs.map((v) => v.z)), cs).toBeLessThan(-4);
      // sign face on the cross street plane (0.3 m proud of the side wall), front face on z = 0.3
      expect(signs.some((v) => Math.abs(v.x - (cornerX + out * 0.305)) < 1e-6), cs).toBe(true);
      expect(signs.some((v) => Math.abs(v.z - 0.305) < 1e-6), cs).toBe(true);
      // never beyond the opposite end of the lot
      for (const v of [...awnings, ...signs]) {
        expect(v.x, cs).toBeGreaterThan(-AWN_OUT - 0.4);
        expect(v.x, cs).toBeLessThan(W + AWN_OUT + 0.4);
      }
    }
  });

  it('a non-corner shop has nothing on the cross street', () => {
    const { geoms } = buildLot(lotOf('no-wrap', 8, 15, false), null);
    for (const x of geoms.filter((g) => /^sf:(awning|sign)/.test(g.name))) {
      for (const v of verts(x.g)) {
        expect(v.x).toBeGreaterThanOrEqual(-0.01);
        expect(v.x).toBeLessThanOrEqual(8.01);
      }
    }
  });

  it('the corner entrance is a diagonal glazed door wall between the two faces', () => {
    for (const cs of ['left', 'right'] as const) {
      const { geoms } = buildLot(lotOf(`diag-${cs}`, W, D, true), cs);
      const glass = geoms.find((x) => x.name.startsWith('storefrontGlass'))!;
      const p = glass.g.getAttribute('position'), n = glass.g.getAttribute('normal');
      const out = cs === 'left' ? -1 : 1;
      let diag = 0;
      for (let i = 0; i < p.count; i++) {
        if (Math.abs(n.getX(i) - out * Math.SQRT1_2) < 1e-3 && Math.abs(n.getZ(i) - Math.SQRT1_2) < 1e-3) diag++;
      }
      expect(diag, cs).toBeGreaterThanOrEqual(6);
    }
  });

  it('the chamfer leaves the corner open below the flats: no wall below the shop top inside the notch', () => {
    const { geoms } = buildLot(lotOf('notch', W, D, true), 'left');
    const brick = geoms.filter((x) => /^(brickRed|brickPainted):/.test(x.name)).flatMap((x) => {
      const p = x.g.getAttribute('position'), n = x.g.getAttribute('normal');
      const out: THREE.Vector3[] = [];
      for (let i = 0; i < p.count; i++) if (Math.abs(n.getZ(i)) > 0.99 && Math.abs(p.getZ(i)) < 1e-6) out.push(new THREE.Vector3().fromBufferAttribute(p, i));
      return out;
    });
    // front-plane brick vertices below the shop top never fall inside the notch (x in 0..1.5)
    for (const v of brick) if (v.y < SHOP_H - 0.01 && v.y > 0.01) expect(v.x >= 1.5 - 1e-6 || v.x <= 1e-6 + 0).toBe(true);
  });

  it('everything below the flats stays below the ground-floor height; the flats start where the shop ends', () => {
    const { geoms } = buildLot(lotOf('levels', W, D, true), 'left');
    const sheet = geoms.filter((x) => /^sf:/.test(x.name));
    for (const x of sheet) for (const v of verts(x.g)) expect(v.y, x.name).toBeLessThan(GROUND_FLOOR_H + 0.9);
    // no shop-front material above the sign box top
    const tops = geoms.filter((x) => x.name.startsWith('sf:sign:')).flatMap((x) => verts(x.g)).map((v) => v.y);
    expect(Math.max(...tops)).toBeLessThan(GROUND_FLOOR_H + 0.7);
  });
});

// ---------------------------------------------------------------------------------------------- night

describe('night state', () => {
  it('gate schedule: shops close at their hour, stay shut until 06:00, 24 h shops never close', () => {
    expect(isStoreClosed(22, 21.9)).toBe(false);
    expect(isStoreClosed(22, 22)).toBe(true);
    expect(isStoreClosed(22, 23.5)).toBe(true);
    expect(isStoreClosed(22, 3)).toBe(true);
    expect(isStoreClosed(22, 5.99)).toBe(true);
    expect(isStoreClosed(22, 6)).toBe(false);
    expect(isStoreClosed(22, 12)).toBe(false);
    expect(isStoreClosed(25, 0.5)).toBe(false); // 25 = 1 am
    expect(isStoreClosed(25, 1)).toBe(true);
    expect(isStoreClosed(25, 23)).toBe(false);
    expect(isStoreClosed(24, 24 + 0.1)).toBe(true);
    for (const h of [0, 3, 12, 22, 23.9]) expect(isStoreClosed(null, h)).toBe(false);
    expect(isNightHour(19.4)).toBe(false);
    expect(isNightHour(19.5)).toBe(true);
    expect(isNightHour(5.9)).toBe(true);
    expect(isNightHour(6)).toBe(false);
  });

  it('lit boxes and stickers glow only at night; gates appear after closing time and vanish at dawn', () => {
    const lib = new StubMaterials();
    const { geoms, kit } = buildLot(lotOf('night-1', 8, 15, false), null, { storefront: 'liquor' } as LotCtx['spec'], lib);
    const glow = geoms.map((x) => x.mat).filter((m): m is THREE.MeshStandardMaterial => /^sf:(sign|stickers)/.test(m.name));
    expect(glow.length).toBeGreaterThanOrEqual(2);
    const gate = geoms.map((x) => x.mat).find((m) => m.name.startsWith('rollGate:closes'));
    // liquor shops close (23:00 / 24:00 / 23:00 by hash), so a gate material exists for this lot
    const shop = resolveStorefront(lotOf('night-1', 8, 15, false), { storefront: 'liquor' });
    expect(shop.closesAt).not.toBeNull();
    expect(gate, 'gate material').toBeDefined();

    kit.setHour(12);
    for (const m of glow) expect(m.emissiveIntensity, m.name).toBe(0);
    expect(gate!.visible).toBe(false);

    kit.setHour(21);
    for (const m of glow) {
      expect(m.emissiveIntensity, m.name).toBeGreaterThan(0.2);
      expect(m.emissiveIntensity, m.name).toBeLessThanOrEqual(0.6); // L9: big flat lightbox faces <= 0.6 (night bloom threshold 0.9)
    }
    expect(gate!.visible).toBe(false); // still open at 21:00

    kit.setHour(shop.closesAt! + 0.25);
    expect(gate!.visible).toBe(true);
    for (const m of glow) expect(m.emissiveIntensity).toBeGreaterThan(0.2); // lit sign stays on over a closed shop

    kit.setHour(3);
    expect(gate!.visible).toBe(true);
    kit.setHour(6.5);
    expect(gate!.visible).toBe(false);
    for (const m of glow) expect(m.emissiveIntensity).toBe(0);
  });

  it('setStorefrontHour drives every kit, and MaterialLibrary.setNight keeps lights in step on its own', () => {
    const a = buildLot(lotOf('drive-a', 8, 15, false), null, { storefront: 'bodega' } as LotCtx['spec']);
    const b = buildLot(lotOf('drive-b', 8, 15, false), null, { storefront: 'deli' } as LotCtx['spec']);
    setStorefrontHour(23);
    expect(a.kit.night).toBe(true);
    expect(b.kit.night).toBe(true);
    setStorefrontHour(13);
    expect(a.kit.night).toBe(false);
    expect(b.kit.night).toBe(false);
    // the game flips the library's night flag; the kit follows (and the original setNight still runs)
    a.lib.setNight(true);
    expect(a.kit.night).toBe(true);
    expect(a.lib.nightCalls).toEqual([true]);
    a.lib.setNight(false);
    expect(a.kit.night).toBe(false);
    expect(b.kit.night).toBe(false);
  });

  it('24 h shops carry no gate; gate buckets stay few', () => {
    const open = buildLot(lotOf('o24', 8, 15, false), null, { storefront: { archetype: 'bodega', open24: true } } as unknown as LotCtx['spec']);
    expect(open.geoms.some((x) => x.name.startsWith('rollGate:closes'))).toBe(false);
    const names = new Set<string>();
    for (let i = 0; i < 80; i++) {
      for (const g of buildLot(lotOf(`bucket-${i}`, 8, 15, false), null, undefined, new StubMaterials()).geoms) if (g.name.startsWith('rollGate:closes')) names.add(g.name);
    }
    expect(names.size).toBeLessThanOrEqual(5);
    expect(names.size).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------------------------- city

describe('the whole city', () => {
  it('real data: every mixed-use lot builds, and all storefront art shares a few atlas materials', () => {
    const data = loadBedstuyData();
    const grid = buildGrid(data);
    const lots = subdivideLots(grid, data.pois, new Rng(data.seed).fork('lots'), getBedstuyFaces());
    const lib = new StubMaterials();
    const res = buildBuildings(lots, lib, new Rng(data.seed).fork('buildings'));
    const mixed = lots.filter((l) => l.type === 'mixeduse');
    expect(mixed.length).toBeGreaterThan(40);
    const names = new Set<string>();
    res.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) names.add(((o as THREE.Mesh).material as THREE.Material).name); });
    const sf = [...names].filter((n) => /^(sf:|rollGate:closes)/.test(n));
    // awning + sign + board sheets, stickers, gates, flat tiles for the whole city
    expect(sf.length).toBeLessThanOrEqual(30);
    const kit = getStorefrontKit(lib);
    expect(kit.tiles.length).toBeGreaterThan(mixed.length); // every shop got its own tiles
    // a one-material-per-shop design would be hundreds of materials; unique art is atlas tiles instead
    expect(sf.filter((n) => /^sf:awning/.test(n)).length).toBeLessThanOrEqual(12);
  });

  it('closed-down shops keep the gate down in daylight; open ones do not', () => {
    const closed = buildLot(lotOf('closed-1', 8, 15, false), null, { storefront: { archetype: 'generic', shuttered: true } } as unknown as LotCtx['spec']);
    // a closed-down shop's shutter is corrugated steel (T11) carrying a permanent graffiti decal, never hidden
    const gate = closed.geoms.find((x) => x.name.startsWith('corrugatedSteel:'));
    expect(gate).toBeDefined();
    expect(gate!.mat.visible).toBe(true);
    const tag = closed.geoms.find((x) => x.name.startsWith('graffiti:'));
    expect(tag).toBeDefined();
    expect(tag!.mat.visible).toBe(true);
    expect(closed.ctx.m.rollGate.visible).toBe(true);
    // its sign is dark: no lit sign sheet face is drawn for a shuttered shop
    expect(closed.kit.tiles.some((t) => t.kind === 'sign')).toBe(false);
  });

  it('about a third of night shutters carry a graffiti decal that shows only while the gate is down', () => {
    let tagged = 0;
    const total = 30;
    for (let i = 0; i < total; i++) {
      const lib = new StubMaterials();
      const { geoms, kit } = buildLot(lotOf(`tag-${i}`, 8, 15, false), null, { storefront: 'liquor' } as LotCtx['spec'], lib);
      const decal = geoms.find((x) => x.name.startsWith('graffiti:gate'));
      if (!decal) continue;
      tagged++;
      kit.setHour(12);
      expect(decal.mat.visible).toBe(false);
      kit.setHour(3);
      expect(decal.mat.visible).toBe(true);
      kit.setHour(7);
      expect(decal.mat.visible).toBe(false);
      // a decal sits just in front of the gate quad, inside the opening
      const vs = verts(decal.g);
      for (const v of vs) { expect(v.y).toBeGreaterThanOrEqual(0.1); expect(v.y).toBeLessThanOrEqual(SHOP_H); }
    }
    expect(tagged).toBeGreaterThan(total * 0.15);
    expect(tagged).toBeLessThan(total * 0.6);
  });
});
