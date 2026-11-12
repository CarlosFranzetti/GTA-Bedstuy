import { beforeAll, describe, expect, it } from 'vitest';
import { PED_SPECS, type PedSpec } from '@/textures/painters/ped';
import { BODY_TYPES, bodyTypeId, bodyTypeOf, type BodyTypeId } from '@/entities/models/pedBodyTypes';
import { dressLod, jointFor, parseShape, shapeFor, type MhShape } from '@/entities/models/pedMesh';
import { makeCtx, penetration, SWATCH, NEUTRAL, type Ctx, type Piece } from '@/entities/models/pedPiecesKit';
import { ACCESSORY_IDS, ACC_HEAD, BEARD_IDS, HAIR_IDS, HAT_IDS, SHOE_IDS, accessoryIdsFor, beardIdsFor, hairIdFor, hatIdFor, personPieces, shoeIdFor, hairPiece, beardPiece, hatPiece, accessoryPiece, shoePieces } from '@/entities/models/pedPieces';

type Fs = { readFileSync(p: URL): { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }; readdirSync(p: URL): string[] };
const nodeFs = async (): Promise<Fs> => (await import(/* @vite-ignore */ 'node:' + 'fs')) as unknown as Fs;
const DIR = new URL('../../../src/assets/models/people/', import.meta.url);

const shapes = new Map<string, MhShape>();
const ctxOf = (spec: PedSpec, detail: 'hi' | 'mid' = 'hi'): Ctx => {
  const s = shapes.get(shapeFor(spec))!, bt = bodyTypeOf(spec);
  const L0 = dressLod(s, spec, s.lods.hi, true), rig: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(s.rig)) rig[k] = jointFor(k, v, bt);
  return makeCtx(s, spec, bt, L0, rig, detail);
};
/** the first civilian of each body type, one man and one woman where the roster has them */
const TYPES: BodyTypeId[] = ['avg', 'slim', 'athletic', 'heavy', 'tall-thin', 'short-stocky', 'broad', 'pear', 'petite', 'elder', 'teen', 'kid'];
const specsOfType = (t: BodyTypeId): PedSpec[] => {
  const all = PED_SPECS.filter((s) => (s.role === 'civilian' || s.role === 'player') && bodyTypeId(s) === t);
  const m = all.find((s) => s.sex !== 'f'), f = all.find((s) => s.sex === 'f');
  return [m, f].filter(Boolean) as PedSpec[];
};
const HEAD_SLOT = (p: Piece): boolean => p.slot === 'hair' || p.slot === 'hat' || (p.slot === 'accessory' && ACC_HEAD.some((h) => p.id === 'acc:' + h));
const ALLOWED = [SWATCH.hair, SWATCH.hat, SWATCH.gear, SWATCH.torso, SWATCH.pelvis, SWATCH.shoe, NEUTRAL, { x: 256, y: 256, w: 128, h: 64 }];
const inRects = (u: number, v: number): boolean => { const px = u * 512, py = (1 - v) * 512; return ALLOWED.some((r) => px >= r.x - 0.5 && px <= r.x + r.w + 0.5 && py >= r.y - 0.5 && py <= r.y + r.h + 0.5); };

function allPieces(ctx: Ctx): Piece[] {
  ctx.underHat = false;
  const out: Piece[] = [];
  for (const id of HAIR_IDS) out.push(hairPiece(id, ctx));
  for (const id of BEARD_IDS) out.push(beardPiece(id, ctx));
  for (const id of HAT_IDS) out.push(hatPiece(id, ctx));
  for (const id of ACCESSORY_IDS) out.push(accessoryPiece(id, ctx));
  for (const id of SHOE_IDS) out.push(...shoePieces(id, ctx));
  return out;
}
const verts = (p: Piece): Float32Array => p.geo.getAttribute('position').array as Float32Array;

beforeAll(async () => {
  const fs = await nodeFs();
  for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.glb')).sort()) {
    const b = fs.readFileSync(new URL(f, DIR));
    const s = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    shapes.set(s.name, s);
  }
}, 60000);

describe('PEDHAIR pieces: the roster only names pieces that exist', () => {
  it('every roster person maps to known hair, hat, beard, accessory and shoe ids', () => {
    for (const s of PED_SPECS) {
      const h = hairIdFor(s), hat = hatIdFor(s);
      if (h) expect(HAIR_IDS as readonly string[], s.id).toContain(h);
      if (hat) expect(HAT_IDS as readonly string[], s.id).toContain(hat);
      for (const b of beardIdsFor(s)) expect(BEARD_IDS as readonly string[]).toContain(b);
      for (const a of accessoryIdsFor(s)) expect(ACCESSORY_IDS as readonly string[], s.id).toContain(a);
      expect(SHOE_IDS as readonly string[]).toContain(shoeIdFor(s));
    }
  });
  it('has the pieces the brief lists', () => {
    for (const h of ['lowFade', 'highTop', 'curls', 'afro', 'afroLarge', 'locsShort', 'locs', 'boxBraids', 'cornrows', 'bun', 'ponytail', 'bob', 'long', 'wavy', 'receding', 'baldFringe']) expect(HAIR_IDS as readonly string[]).toContain(h);
    for (const h of ['fitted', 'snapback', 'beanie', 'bucket', 'flatCap', 'kufi', 'kippah', 'fedora', 'headscarf', 'hijab', 'durag', 'hoodUp', 'hoodDown', 'hardHat', 'bikeHelmet']) expect(HAT_IDS as readonly string[]).toContain(h);
    for (const h of ['glasses', 'sunglasses', 'headphones', 'earbuds', 'backpack', 'tote', 'messenger', 'shoppingBag', 'handbag', 'cane', 'scarf', 'chain']) expect(ACCESSORY_IDS as readonly string[]).toContain(h);
    expect(SHOE_IDS.length).toBe(6);
  });
});

describe('PEDHAIR pieces: every piece fits every body type', () => {
  for (const t of TYPES) {
    it(`${t}: pieces are finite, inside the swatches, rigid, and no vertex is more than 1 cm inside the head or torso`, () => {
      const specs = specsOfType(t), bad: string[] = [];
      expect(specs.length).toBeGreaterThan(0);
      for (const spec of specs) {
        const ctx = ctxOf(spec);
        for (const p of allPieces(ctx)) {
          const pos = verts(p), uv = p.geo.getAttribute('uv').array as Float32Array, si = p.geo.getAttribute('skinIndex').array as Uint16Array, sw = p.geo.getAttribute('skinWeight').array as Float32Array;
          expect(p.tris, `${spec.id} ${p.id}`).toBeGreaterThan(0);
          let worst = 0, worstAt = '';
          for (let i = 0; i < pos.length / 3; i++) {
            const v: [number, number, number] = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
            expect(Number.isFinite(v[0] + v[1] + v[2]), `${spec.id} ${p.id} vertex ${i}`).toBe(true);
            expect(inRects(uv[i * 2], uv[i * 2 + 1]), `${spec.id} ${p.id} uv ${i}`).toBe(true);
            const w = sw[i * 4] + sw[i * 4 + 1];
            expect(Math.abs(w - 1), `${spec.id} ${p.id} weights`).toBeLessThan(1e-4);
            expect(si[i * 4]).toBeLessThan(12); expect(si[i * 4 + 1]).toBeLessThan(12);
            if (p.slot !== 'shoe') { const d = penetration(ctx, v); if (d > worst) { worst = d; worstAt = `#${i} (${v.map((x) => x.toFixed(3)).join(',')})`; } }
          }
          if (p.lifted > Math.max(4, pos.length / 3 * 0.08)) bad.push(`${spec.id} ${p.id} the safety pass lifted ${p.lifted} of ${pos.length / 3} vertices`);
          if (worst >= 0.01) bad.push(`${spec.id} ${p.id} ${(worst * 100).toFixed(1)}cm at ${worstAt}`);
        }
      }
      expect(bad).toEqual([]);
    }, 120000);
  }
});

describe('PEDHAIR pieces: bones, budget, lettering', () => {
  it('head pieces are rigid to the head (long hair and the cloth over the shoulders blend head to torso); shoes to their knee', () => {
    const ctx = ctxOf(PED_SPECS.find((s) => s.id === 'ba-hoodie-fade')!);
    for (const p of allPieces(ctx)) {
      const si = p.geo.getAttribute('skinIndex').array as Uint16Array, sw = p.geo.getAttribute('skinWeight').array as Float32Array;
      const used = new Set<number>();
      for (let i = 0; i < si.length / 4; i++) { if (sw[i * 4] > 0) used.add(si[i * 4]); if (sw[i * 4 + 1] > 0) used.add(si[i * 4 + 1]); }
      if (p.slot === 'shoe') expect([...used].every((b) => b === 9 || b === 11), p.id).toBe(true);
      else if (HEAD_SLOT(p)) expect([...used].every((b) => b === 3 || b === 2), p.id).toBe(true);
      expect(used.size, p.id).toBeLessThanOrEqual(2);
    }
  });
  it('a piece stays inside its triangle allowance, and a whole person under about 4,500', () => {
    const limits: Record<Piece['slot'], number> = { hair: 380, hat: 300, accessory: 200, bag: 140, shoe: 200 };
    const ctx = ctxOf(PED_SPECS.find((s) => s.id === 'ba-hoodie-fade')!);
    for (const p of allPieces(ctx)) expect(p.tris, p.id).toBeLessThanOrEqual(limits[p.slot]);
    let worst = 0, worstId = '';
    for (const spec of PED_SPECS) {
      const c = ctxOf(spec), skin = c.skin.index.length / 3, tris = personPieces(c).pieces.reduce((a, p) => a + p.tris, 0);
      if (skin + tris > worst) { worst = skin + tris; worstId = spec.id; }
    }
    expect(worst, worstId).toBeLessThanOrEqual(4650);
  }, 120000);
  it('has no lettering: no text drawing in the piece code, no logo fields read, nothing maps outside the swatches', async () => {
    const fs = (await nodeFs()) as unknown as { readFileSync(p: URL, enc: string): string };
    for (const f of ['pedPiecesKit', 'pedHairPieces', 'pedHeadwear', 'pedGear', 'pedShoes', 'pedPieces']) {
      const src = fs.readFileSync(new URL(`../../../src/entities/models/${f}.ts`, import.meta.url), 'utf8');
      expect(src, f).not.toMatch(/fillText|strokeText|measureText|hatLogo|printText|\.font\b/);
    }
    for (const t of Object.values(BODY_TYPES)) expect(t.head).toBeGreaterThan(0);
  });
  it('the mid level is lighter than the hi level', () => {
    const spec = PED_SPECS.find((s) => s.id === 'ba-puffer-braids')!;
    const hi = personPieces(ctxOf(spec, 'hi')).pieces.reduce((a, p) => a + p.tris, 0), mid = personPieces(ctxOf(spec, 'mid')).pieces.reduce((a, p) => a + p.tris, 0);
    expect(mid).toBeLessThan(hi);
  });
});

describe('PEDHAIR pieces: report', () => {
  it('prints the triangle counts', () => {
    const rows: string[] = [];
    for (const spec of PED_SPECS) { const c = ctxOf(spec), pp = personPieces(c); rows.push(`${spec.id}: skin ${c.skin.index.length / 3} + ${pp.pieces.map((p) => p.id.replace(/^[a-z]+:/, '') + ' ' + p.tris).join(', ')} = ${c.skin.index.length / 3 + pp.pieces.reduce((a, p) => a + p.tris, 0)}`); }
    rows.sort((a, b) => Number(b.split('= ')[1]) - Number(a.split('= ')[1]));
    console.log('BUDGET\n' + rows.slice(0, 12).join('\n') + '\n...\n' + rows.slice(-3).join('\n'));
    const c = ctxOf(PED_SPECS.find((s) => s.id === 'ba-hoodie-fade')!); c.underHat = false;
    const per = [...HAIR_IDS.map((i) => hairPiece(i, c)), ...BEARD_IDS.map((i) => beardPiece(i, c)), ...HAT_IDS.map((i) => hatPiece(i, c)), ...ACCESSORY_IDS.map((i) => accessoryPiece(i, c)), ...SHOE_IDS.map((i) => shoePieces(i, c)[0])];
    console.log('PIECES ' + per.map((p) => `${p.id.replace(/^[a-z]+:/, '')}=${p.tris}`).join(' '));
    expect(rows.length).toBeGreaterThan(0);
  }, 120000);
});
