/**
 * RenderWare .dff (clump) reader, PC files of the versions the early-2000s open-world games used (3.1 to 3.6).
 *
 * Written from the publicly documented chunk layout (a chunk is: type u32, size u32, library stamp u32, then `size` bytes;
 * a chunk of children holds more chunks). Reads: frames (name, 3x3 rotation, position, parent), geometries (positions,
 * normals, first UV set, vertex colours, triangles with material ids; the Bin Mesh PLG when the plain triangle list is
 * empty), materials (colour, texture name) and atomics (frame -> geometry). Anything else (skin, morph targets beyond the
 * first, effects, PlayStation 2 or Xbox native geometry) is skipped or refused. It never throws anything but ModError and
 * checks every count against the file's own size and the tier's limits before it allocates.
 */
import { ByteReader } from '../binary';
import { ModError, type ModLimits } from '../limits';

export const RW = {
  STRUCT: 0x01, STRING: 0x02, EXTENSION: 0x03, TEXTURE: 0x06, MATERIAL: 0x07, MATERIAL_LIST: 0x08,
  FRAME_LIST: 0x0e, GEOMETRY: 0x0f, CLUMP: 0x10, ATOMIC: 0x14, TEXTURE_NATIVE: 0x15, TEXTURE_DICTIONARY: 0x16,
  GEOMETRY_LIST: 0x1a, BIN_MESH: 0x50e, FRAME_NAME: 0x253f2fe,
} as const;

const GEO_TRISTRIP = 0x1, GEO_TEXTURED = 0x4, GEO_PRELIT = 0x8, GEO_NORMALS = 0x10, GEO_TEXTURED2 = 0x80, GEO_NATIVE = 0x01000000;

export interface RwHeader { type: number; size: number; stamp: number; /** offset of the body */ body: number; /** offset after the body */ end: number }

/** Library stamp -> version like 0x34003 (3.4.0.3). */
export function rwVersion(stamp: number): number {
  return (stamp & 0xffff0000) ? ((stamp >>> 14) & 0x3ff00) | ((stamp >>> 16) & 0x3f) | 0x30000 : (stamp << 8) >>> 0;
}

/** Reads one chunk header and checks the body fits inside `limit`. */
export function readHeader(r: ByteReader, limit: number): RwHeader {
  if (r.pos + 12 > limit) throw new ModError('The file is cut short (a chunk header is missing).', 'truncated');
  const type = r.u32(), size = r.u32(), stamp = r.u32();
  const body = r.pos, end = body + size;
  if (end > limit || end < body) throw new ModError('A chunk in the file claims to be larger than the file.', 'truncated');
  return { type, size, stamp, body, end };
}

/** Child chunks of the span [from, to). */
export function eachChunk(r: ByteReader, from: number, to: number, fn: (h: RwHeader) => void): void {
  r.pos = from;
  let guard = 0;
  while (r.pos + 12 <= to) {
    if (++guard > 100_000) throw new ModError('Too many chunks in one block.', 'oversize');
    const h = readHeader(r, to);
    fn(h);
    r.pos = h.end;
  }
}

function readString(r: ByteReader, h: RwHeader): string {
  const n = Math.min(h.size, 256);
  r.pos = h.body;
  return r.fixedString(n);
}

export interface DffMaterial { color: [number, number, number, number]; texture: string | null; mask: string | null }
export interface DffFrame { name: string; rotation: number[]; position: [number, number, number]; parent: number }
export interface DffGeometry {
  vertexCount: number;
  /** x y z per vertex, as in the file (the game's Z is up) */
  positions: Float32Array;
  normals: Float32Array | null;
  /** first UV set, u v per vertex, v as in the file (top down) */
  uvs: Float32Array | null;
  /** r g b a bytes per vertex */
  colors: Uint8Array | null;
  /** three vertex indices per triangle */
  indices: Uint32Array;
  /** material index per triangle */
  triMaterial: Uint16Array;
  materials: DffMaterial[];
}
export interface DffAtomic { frame: number; geometry: number }
export interface DffClump { version: number; frames: DffFrame[]; geometries: DffGeometry[]; atomics: DffAtomic[] }

export function parseDff(data: ArrayBuffer | Uint8Array, limits: ModLimits): DffClump {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (u8.byteLength > limits.maxModelFileBytes) throw new ModError(`This model file is too large for this device (${(u8.byteLength / 1048576).toFixed(1)} MB; the limit is ${(limits.maxModelFileBytes / 1048576).toFixed(0)} MB).`, 'oversize');
  if (u8.byteLength < 24) throw new ModError('This is not a RenderWare .dff file (too short).', 'format');
  const r = new ByteReader(u8);
  const top = readHeader(r, u8.byteLength);
  if (top.type !== RW.CLUMP) throw new ModError('This is not a RenderWare .dff clump (the first chunk is not a Clump).', 'format');
  const version = rwVersion(top.stamp);
  if (version < 0x30000 || version > 0x3ffff) throw new ModError(`Unsupported RenderWare version 0x${version.toString(16)}; this loader reads 3.x files.`, 'format');

  const out: DffClump = { version, frames: [], geometries: [], atomics: [] };
  eachChunk(r, top.body, top.end, (h) => {
    if (h.type === RW.FRAME_LIST) out.frames = parseFrameList(r, h, limits);
    else if (h.type === RW.GEOMETRY_LIST) out.geometries = parseGeometryList(r, h, version, limits);
    else if (h.type === RW.ATOMIC) out.atomics.push(parseAtomic(r, h));
  });
  if (!out.geometries.length) throw new ModError('The .dff has no geometry.', 'format');
  if (!out.frames.length) out.frames.push({ name: '', rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], position: [0, 0, 0], parent: -1 });
  if (!out.atomics.length) out.atomics = out.geometries.map((_, i) => ({ frame: 0, geometry: i })); // some files leave the atomics out
  let tris = 0, verts = 0;
  for (const g of out.geometries) { tris += g.indices.length / 3; verts += g.vertexCount; }
  if (tris > limits.maxTriangles) throw new ModError(`The model has ${tris} triangles; this device allows ${limits.maxTriangles}.`, 'oversize');
  if (verts > limits.maxVertices) throw new ModError(`The model has ${verts} vertices; this device allows ${limits.maxVertices}.`, 'oversize');
  for (const a of out.atomics) {
    if (a.geometry < 0 || a.geometry >= out.geometries.length) throw new ModError('An atomic points at a geometry that is not in the file.', 'format');
    if (a.frame < 0 || a.frame >= out.frames.length) a.frame = 0;
  }
  return out;
}

function parseAtomic(r: ByteReader, h: RwHeader): DffAtomic {
  let frame = 0, geometry = 0;
  eachChunk(r, h.body, h.end, (c) => {
    if (c.type === RW.STRUCT && c.size >= 8) { r.pos = c.body; frame = r.u32(); geometry = r.u32(); }
  });
  return { frame, geometry };
}

function parseFrameList(r: ByteReader, h: RwHeader, limits: ModLimits): DffFrame[] {
  const frames: DffFrame[] = [];
  let names: string[] = [];
  let seenStruct = false;
  eachChunk(r, h.body, h.end, (c) => {
    if (c.type === RW.STRUCT && !seenStruct) {
      seenStruct = true;
      r.pos = c.body;
      const n = r.u32();
      if (n > limits.maxFrames) throw new ModError(`The model has ${n} frames; this device allows ${limits.maxFrames}.`, 'oversize');
      if (n * 56 > c.size - 4) throw new ModError('The frame list is shorter than its own count.', 'truncated');
      for (let i = 0; i < n; i++) {
        const rotation: number[] = [];
        for (let k = 0; k < 9; k++) rotation.push(r.f32());
        const position: [number, number, number] = [r.f32(), r.f32(), r.f32()];
        const parent = r.i32();
        r.u32(); // flags
        frames.push({ name: '', rotation, position, parent: parent >= 0 && parent < n ? parent : -1 });
      }
    } else if (c.type === RW.EXTENSION) {
      // one Extension per frame, in frame order; the name is chunk 0x253F2FE inside it
      let name = '';
      eachChunk(r, c.body, c.end, (e) => { if (e.type === RW.FRAME_NAME) name = readString(r, e); });
      names.push(name);
    }
  });
  names = names.slice(0, frames.length);
  names.forEach((n, i) => { frames[i].name = n; });
  return frames;
}

function parseGeometryList(r: ByteReader, h: RwHeader, version: number, limits: ModLimits): DffGeometry[] {
  const geos: DffGeometry[] = [];
  let count = 0;
  let totalTris = 0, totalVerts = 0;
  eachChunk(r, h.body, h.end, (c) => {
    if (c.type === RW.STRUCT && c.size >= 4) { r.pos = c.body; count = r.u32(); if (count > 256) throw new ModError('The model has too many geometries.', 'oversize'); }
    else if (c.type === RW.GEOMETRY) {
      if (geos.length >= Math.max(count, 1)) return;
      const g = parseGeometry(r, c, version, limits, limits.maxTriangles - totalTris, limits.maxVertices - totalVerts);
      totalTris += g.indices.length / 3; totalVerts += g.vertexCount;
      geos.push(g);
    }
  });
  return geos;
}

function parseGeometry(r: ByteReader, h: RwHeader, version: number, limits: ModLimits, triBudget: number, vertBudget: number): DffGeometry {
  let g: Omit<DffGeometry, 'materials'> | null = null;
  let materials: DffMaterial[] = [];
  let binMesh: { strip: boolean; meshes: Array<{ material: number; indices: Uint32Array }> } | null = null;
  eachChunk(r, h.body, h.end, (c) => {
    if (c.type === RW.STRUCT && !g) g = parseGeometryStruct(new ByteReader(r.buf, c.body, c.end), version, limits, triBudget, vertBudget);
    else if (c.type === RW.MATERIAL_LIST) materials = parseMaterialList(r, c, version, limits);
    else if (c.type === RW.EXTENSION) {
      eachChunk(r, c.body, c.end, (e) => { if (e.type === RW.BIN_MESH) binMesh = parseBinMesh(r, e, limits); });
    }
  });
  if (!g) throw new ModError('A geometry has no data block.', 'format');
  const geo = g as Omit<DffGeometry, 'materials'>;
  if (geo.indices.length === 0 && binMesh) {
    const bm = binMesh as { strip: boolean; meshes: Array<{ material: number; indices: Uint32Array }> };
    const idx: number[] = [], mat: number[] = [];
    for (const m of bm.meshes) {
      const ix = m.indices;
      if (!bm.strip) for (let i = 0; i + 2 < ix.length; i += 3) { idx.push(ix[i], ix[i + 1], ix[i + 2]); mat.push(m.material); }
      else for (let i = 0; i + 2 < ix.length; i++) {
        const a = ix[i], b = ix[i + 1], c = ix[i + 2];
        if (a === b || b === c || a === c) continue; // degenerate joins
        if (i & 1) idx.push(b, a, c); else idx.push(a, b, c);
        mat.push(m.material);
      }
      if (idx.length / 3 > triBudget) throw new ModError(`The model has more than ${triBudget} triangles left in this device's budget.`, 'oversize');
    }
    for (const v of idx) if (v >= geo.vertexCount) throw new ModError('A triangle points past the end of the vertex list.', 'format');
    geo.indices = Uint32Array.from(idx);
    geo.triMaterial = Uint16Array.from(mat);
  }
  for (let i = 0; i < geo.triMaterial.length; i++) if (geo.triMaterial[i] >= Math.max(materials.length, 1)) geo.triMaterial[i] = 0;
  if (!materials.length) materials = [{ color: [200, 200, 200, 255], texture: null, mask: null }];
  return { ...geo, materials };
}

function parseGeometryStruct(r: ByteReader, version: number, limits: ModLimits, triBudget: number, vertBudget: number): Omit<DffGeometry, 'materials'> {
  const flags = r.u32();
  const triCount = r.u32();
  const vertCount = r.u32();
  const morphCount = r.u32();
  if (flags & GEO_NATIVE) throw new ModError('This .dff holds console-native (PlayStation 2 or Xbox) geometry; only PC files are supported.', 'format');
  if (vertCount > vertBudget || vertCount > limits.maxVertices) throw new ModError(`The model has ${vertCount} vertices; this device allows ${limits.maxVertices}.`, 'oversize');
  if (triCount > triBudget || triCount > limits.maxTriangles) throw new ModError(`The model has ${triCount} triangles; this device allows ${limits.maxTriangles}.`, 'oversize');
  if (morphCount < 1 || morphCount > 64) throw new ModError('A geometry has an unusable number of morph targets.', 'format');
  if (version < 0x34000) r.skip(12); // ambient, diffuse, specular
  // sizes the file must be able to hold, checked before allocating
  const uvSets = ((flags >>> 16) & 0xff) || ((flags & GEO_TEXTURED) ? 1 : (flags & GEO_TEXTURED2) ? 2 : 0);
  const need = (flags & GEO_PRELIT ? vertCount * 4 : 0) + uvSets * vertCount * 8 + triCount * 8 + vertCount * 12 + 16;
  if (need > r.remaining) throw new ModError('The geometry is shorter than its own vertex and triangle counts say.', 'truncated');

  let colors: Uint8Array | null = null;
  if (flags & GEO_PRELIT) colors = Uint8Array.from(r.bytes(vertCount * 4));
  let uvs: Float32Array | null = null;
  for (let s = 0; s < uvSets; s++) {
    const a = new Float32Array(vertCount * 2);
    for (let i = 0; i < a.length; i++) a[i] = r.f32();
    if (s === 0) uvs = a;
  }
  const indices = new Uint32Array(triCount * 3);
  const triMaterial = new Uint16Array(triCount);
  for (let t = 0; t < triCount; t++) {
    const v2 = r.u16(), v1 = r.u16(), m = r.u16(), v3 = r.u16();
    if (v1 >= vertCount || v2 >= vertCount || v3 >= vertCount) throw new ModError('A triangle points past the end of the vertex list.', 'format');
    indices[t * 3] = v1; indices[t * 3 + 1] = v2; indices[t * 3 + 2] = v3;
    triMaterial[t] = m;
  }
  // first morph target: bounding sphere, flags, then positions and normals
  r.skip(16);
  const hasVerts = r.u32(), hasNormals = r.u32();
  const positions = new Float32Array(vertCount * 3);
  if (hasVerts) for (let i = 0; i < positions.length; i++) positions[i] = r.f32();
  else throw new ModError('The geometry has no vertex positions.', 'format');
  let normals: Float32Array | null = null;
  if (hasNormals) { normals = new Float32Array(vertCount * 3); for (let i = 0; i < normals.length; i++) normals[i] = r.f32(); }
  return { vertexCount: vertCount, positions, normals, uvs, colors, indices, triMaterial };
}

function parseMaterialList(r: ByteReader, h: RwHeader, version: number, limits: ModLimits): DffMaterial[] {
  const list: DffMaterial[] = [];
  let slots: number[] = [];
  eachChunk(r, h.body, h.end, (c) => {
    if (c.type === RW.STRUCT && slots.length === 0) {
      r.pos = c.body;
      const n = r.u32();
      if (n > limits.maxMaterials) throw new ModError(`The model has ${n} materials; this device allows ${limits.maxMaterials}.`, 'oversize');
      if (n * 4 > c.size - 4) throw new ModError('The material list is shorter than its own count.', 'truncated');
      for (let i = 0; i < n; i++) slots.push(r.i32());
    } else if (c.type === RW.MATERIAL) {
      list.push(parseMaterial(r, c, version));
    }
  });
  // slot -1 = a new material (taken from the chunks in order); n >= 0 = a second use of material n
  const out: DffMaterial[] = [];
  let next = 0;
  slots = slots.slice(0, limits.maxMaterials);
  for (const s of slots) {
    if (s < 0) out.push(list[next++] ?? { color: [200, 200, 200, 255], texture: null, mask: null });
    else out.push(out[s] ?? { color: [200, 200, 200, 255], texture: null, mask: null });
  }
  return out;
}

function parseMaterial(r: ByteReader, h: RwHeader, version: number): DffMaterial {
  const m: DffMaterial = { color: [255, 255, 255, 255], texture: null, mask: null };
  let isTextured = false;
  eachChunk(r, h.body, h.end, (c) => {
    if (c.type === RW.STRUCT && c.size >= 16) {
      r.pos = c.body;
      r.u32(); // flags
      m.color = [r.u8(), r.u8(), r.u8(), r.u8()];
      r.u32(); // unused
      isTextured = r.u32() !== 0;
      void version;
    } else if (c.type === RW.TEXTURE && isTextured) {
      eachChunk(r, c.body, c.end, (t) => {
        if (t.type === RW.STRING) { const s = readString(r, t); if (m.texture === null) m.texture = s.toLowerCase(); else m.mask = s.toLowerCase(); }
      });
    }
  });
  return m;
}

function parseBinMesh(r: ByteReader, h: RwHeader, limits: ModLimits): { strip: boolean; meshes: Array<{ material: number; indices: Uint32Array }> } {
  r.pos = h.body;
  const flags = r.u32(), meshCount = r.u32(), total = r.u32();
  if (total > limits.maxTriangles * 3 + 3 || meshCount > limits.maxMaterials * 4) throw new ModError('The mesh index lists are too large for this device.', 'oversize');
  if (total * 4 + meshCount * 8 > h.size) throw new ModError('The mesh index lists are shorter than their own count.', 'truncated');
  const meshes: Array<{ material: number; indices: Uint32Array }> = [];
  for (let i = 0; i < meshCount; i++) {
    const n = r.u32(), material = r.u32();
    if (n * 4 > r.remaining || n > total) throw new ModError('A mesh index list is longer than the file.', 'truncated');
    const indices = new Uint32Array(n);
    for (let k = 0; k < n; k++) indices[k] = r.u32();
    meshes.push({ material, indices });
  }
  return { strip: (flags & GEO_TRISTRIP) !== 0 || flags === 1, meshes };
}
