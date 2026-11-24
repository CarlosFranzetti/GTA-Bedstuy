/** Byte writers for RenderWare .dff / .txd test files, written for these tests from the chunk layout. No third-party file is used anywhere. */
export const STAMP_SA = 0x1803ffff; // version 3.6.0.3
export const STAMP_III = 0x0800ffff; // an older stamp: geometry structs carry three lighting floats

class W {
  parts: Uint8Array[] = [];
  len = 0;
  push(b: Uint8Array): this { this.parts.push(b); this.len += b.length; return this; }
  u8(v: number): this { return this.push(Uint8Array.of(v & 255)); }
  u16(v: number): this { return this.push(Uint8Array.of(v & 255, (v >> 8) & 255)); }
  u32(v: number): this { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); return this.push(b); }
  i32(v: number): this { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v, true); return this.push(b); }
  f32(v: number): this { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v, true); return this.push(b); }
  str(s: string, n: number): this { const b = new Uint8Array(n); for (let i = 0; i < s.length && i < n - 1; i++) b[i] = s.charCodeAt(i); return this.push(b); }
  done(): Uint8Array { const o = new Uint8Array(this.len); let p = 0; for (const b of this.parts) { o.set(b, p); p += b.length; } return o; }
}
export const w = (): W => new W();

export function chunk(type: number, stamp: number, body: Uint8Array | Uint8Array[]): Uint8Array {
  const parts = Array.isArray(body) ? body : [body];
  const len = parts.reduce((n, p) => n + p.length, 0);
  const o = w().u32(type).u32(len).u32(stamp);
  for (const p of parts) o.push(p);
  return o.done();
}

const padString = (s: string): Uint8Array => { const n = Math.ceil((s.length + 1) / 4) * 4; return w().str(s, n).done(); };

export interface TestMaterial { color: [number, number, number, number]; texture?: string }
export interface TestGeo {
  positions: number[];
  normals?: number[];
  uvs?: number[];
  /** [v1, v2, v3, material] */
  tris: Array<[number, number, number, number]>;
  materials: TestMaterial[];
  /** write the triangles only as a Bin Mesh PLG (triangle count 0 in the struct) */
  binMesh?: { strip: boolean; meshes: Array<{ material: number; indices: number[] }> };
  native?: boolean;
  /** lie about the counts (for malformed-file tests) */
  claimVerts?: number;
  claimTris?: number;
}
export interface TestFrame { name: string; pos?: [number, number, number]; parent?: number }
export interface TestDff { stamp?: number; frames: TestFrame[]; geos: TestGeo[]; atomics?: Array<[number, number]> }

function materialChunk(stamp: number, m: TestMaterial): Uint8Array {
  const struct = chunk(1, stamp, w().u32(0).u8(m.color[0]).u8(m.color[1]).u8(m.color[2]).u8(m.color[3]).u32(0).u32(m.texture ? 1 : 0).f32(1).f32(0).f32(1).done());
  const kids = [struct];
  if (m.texture) {
    const tex = chunk(6, stamp, [chunk(1, stamp, w().u16(0x1106).u16(0).done()), chunk(2, stamp, padString(m.texture)), chunk(2, stamp, padString('')), chunk(3, stamp, new Uint8Array(0))]);
    kids.push(tex);
  }
  kids.push(chunk(3, stamp, new Uint8Array(0)));
  return chunk(7, stamp, kids);
}

function geometryChunk(stamp: number, g: TestGeo): Uint8Array {
  const verts = g.positions.length / 3;
  const textured = !!g.uvs;
  let flags = 0x2 | (textured ? 0x4 : 0) | (g.normals ? 0x10 : 0) | 0x20;
  if (g.native) flags |= 0x01000000;
  const triCount = g.binMesh ? 0 : g.tris.length;
  const s = w().u32(flags).u32(g.claimTris ?? triCount).u32(g.claimVerts ?? verts).u32(1);
  const old = (stamp & 0xffff0000) ? (((stamp >>> 14) & 0x3ff00) | ((stamp >>> 16) & 0x3f) | 0x30000) < 0x34000 : true;
  if (old) s.f32(1).f32(1).f32(1);
  if (g.uvs) for (const v of g.uvs) s.f32(v);
  if (!g.binMesh) for (const t of g.tris) s.u16(t[1]).u16(t[0]).u16(t[3]).u16(t[2]); // file order: v2, v1, material, v3
  s.f32(0).f32(0).f32(0).f32(1).u32(1).u32(g.normals ? 1 : 0);
  for (const v of g.positions) s.f32(v);
  if (g.normals) for (const v of g.normals) s.f32(v);
  const slots = g.materials.map(() => -1);
  const matList = chunk(8, stamp, [chunk(1, stamp, w().u32(g.materials.length).done()), ...g.materials.map((m) => materialChunk(stamp, m))]);
  // the slot array lives in the list's struct: rewrite it with the right count and indices
  const list = chunk(8, stamp, [chunk(1, stamp, (() => { const x = w().u32(slots.length); for (const sl of slots) x.i32(sl); return x.done(); })()), ...g.materials.map((m) => materialChunk(stamp, m))]);
  void matList;
  const ext: Uint8Array[] = [];
  if (g.binMesh) {
    const b = w().u32(g.binMesh.strip ? 1 : 0).u32(g.binMesh.meshes.length).u32(g.binMesh.meshes.reduce((n, m) => n + m.indices.length, 0));
    for (const m of g.binMesh.meshes) { b.u32(m.indices.length).u32(m.material); for (const i of m.indices) b.u32(i); }
    ext.push(chunk(0x50e, stamp, b.done()));
  }
  return chunk(0x0f, stamp, [chunk(1, stamp, s.done()), list, chunk(3, stamp, ext)]);
}

export function buildDff(d: TestDff): Uint8Array {
  const stamp = d.stamp ?? STAMP_SA;
  const fs = w().u32(d.frames.length);
  for (const f of d.frames) {
    fs.f32(1).f32(0).f32(0).f32(0).f32(1).f32(0).f32(0).f32(0).f32(1);
    const p = f.pos ?? [0, 0, 0];
    fs.f32(p[0]).f32(p[1]).f32(p[2]).i32(f.parent ?? -1).u32(0);
  }
  const frameList = chunk(0x0e, stamp, [chunk(1, stamp, fs.done()), ...d.frames.map((f) => chunk(3, stamp, chunk(0x253f2fe, stamp, padString(f.name))))]);
  const geoList = chunk(0x1a, stamp, [chunk(1, stamp, w().u32(d.geos.length).done()), ...d.geos.map((g) => geometryChunk(stamp, g))]);
  const atomics = (d.atomics ?? d.geos.map((_, i) => [Math.min(i + 1, d.frames.length - 1), i] as [number, number])).map(([f, g]) => chunk(0x14, stamp, [chunk(1, stamp, w().u32(f).u32(g).u32(5).u32(0).done()), chunk(3, stamp, new Uint8Array(0))]));
  return chunk(0x10, stamp, [chunk(1, stamp, w().u32(d.atomics?.length ?? d.geos.length).done()), frameList, geoList, ...atomics, chunk(3, stamp, new Uint8Array(0))]);
}

/** A box from (x0,y0,z0) to (x1,y1,z1): 8 vertices, 12 triangles, two materials (top and bottom faces use 1). */
export function cubeGeo(x0 = -1, y0 = -2, z0 = 0, x1 = 1, y1 = 2, z1 = 1, mats: TestMaterial[] = [{ color: [60, 255, 0, 255] }, { color: [200, 200, 200, 255], texture: 'glass' }]): TestGeo {
  const positions = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1];
  const uvs = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1];
  // outward-facing, counter-clockwise seen from outside, in a right-handed x right y forward z up space
  const q = (a: number, b: number, c: number, d: number, m: number): Array<[number, number, number, number]> => [[a, b, c, m], [a, c, d, m]];
  const tris = [...q(0, 3, 2, 1, 1), ...q(4, 5, 6, 7, 1), ...q(0, 1, 5, 4, 0), ...q(1, 2, 6, 5, 0), ...q(2, 3, 7, 6, 0), ...q(3, 0, 4, 7, 0)];
  return { positions, uvs, tris, materials: mats };
}

/* ---------- TXD ---------- */
export interface TestTexture {
  name: string;
  width: number;
  height: number;
  platform?: 8 | 9;
  /** 'pal8' | 'pal4' | 'bgra' | '565' | 'dxt1' | 'dxt3' */
  kind: string;
  /** pixel bytes exactly as stored (for pal8: indices; for bgra: B G R A ...; for dxt: blocks) */
  pixels: Uint8Array;
  palette?: Uint8Array;
  /** extra mip levels, each [bytes] */
  extraMips?: Uint8Array[];
}

export function buildTxd(textures: TestTexture[], stamp = STAMP_SA): Uint8Array {
  const natives = textures.map((t) => {
    const platform = t.platform ?? 9;
    const s = w().u32(platform).u32(0x1106).str(t.name, 32).str('', 32);
    let raster = 0, comp = 0, depth = 32, dxtByte = 0;
    if (t.kind === 'pal8') { raster = 0x500 | 0x2000; depth = 8; }
    else if (t.kind === 'pal4') { raster = 0x500 | 0x4000; depth = 4; }
    else if (t.kind === 'bgra') { raster = 0x500; }
    else if (t.kind === '565') { raster = 0x200; depth = 16; }
    else if (t.kind === 'dxt1' || t.kind === 'dxt3') {
      raster = 0x500; depth = 16;
      const n = t.kind === 'dxt1' ? 1 : 3;
      if (platform === 9) { comp = t.kind === 'dxt1' ? 0x31545844 : 0x33545844; dxtByte = 8 | 1; } else { comp = 1; dxtByte = n; }
    }
    if (t.extraMips?.length) raster |= 0x8000;
    s.u32(raster).u32(comp).u16(t.width).u16(t.height).u8(depth).u8(1 + (t.extraMips?.length ?? 0)).u8(4).u8(dxtByte);
    if (t.palette) s.push(t.palette);
    s.u32(t.pixels.length).push(t.pixels);
    for (const m of t.extraMips ?? []) s.u32(m.length).push(m);
    return chunk(0x15, stamp, [chunk(1, stamp, s.done()), chunk(3, stamp, new Uint8Array(0))]);
  });
  return chunk(0x16, stamp, [chunk(1, stamp, w().u16(textures.length).u16(0).done()), ...natives, chunk(3, stamp, new Uint8Array(0))]);
}

/** Packs a 565 colour. */
export const c565 = (r: number, g: number, b: number): number => ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
