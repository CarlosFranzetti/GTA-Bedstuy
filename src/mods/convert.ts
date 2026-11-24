/**
 * From parsed mod files to three.js objects. Pure three (no DOM) except `decodeImage`, which needs a browser.
 *
 * Coordinates: a RenderWare model is x right, y forward, z up. The game is y up with the car's front at -z, so a point
 * (x, y, z) becomes (x, z, -y). That is a rotation (no mirroring), so triangle winding is kept.
 */
import * as THREE from 'three';
import { ModError, type ModLimits } from './limits';
import type { DffClump, DffGeometry, DffMaterial } from './rw/dff';
import type { TxdTexture } from './rw/txd';

/** Colours the community car packs use to mark body paint (primary, secondary). The manifest's `paintColors` overrides them. */
export const DEFAULT_PAINT_COLORS: Array<[number, number, number]> = [[60, 255, 0], [255, 0, 175]];

export interface DffOptions {
  scale?: number;
  paintColors?: Array<[number, number, number]>;
  paintMaterial?: string | null;
  wheelFrames?: string[];
}

const WHEEL_DUMMY = /^wheel_(lf|rf|lb|rb|lr|rr|lm|rm)_dummy$/;
const WHEEL_MESH = /^wheel_(lf|rf|lb|rb|lr|rr|lm|rm)(_ok)?$/;
/** `ped_frontseat` / `ped_rearseat` are seat markers (a real car carries a small 8-triangle box on one of them), not parts to draw. */
const SKIP_FRAME = /(_dam|_vlo|_lo\b|_dummy$)|^(lodname|collision|ped_)/;

function wheelName(code: string): string {
  const side = code[0] === 'l' ? 'l' : 'r';
  const axle = code[1] === 'f' ? 'f' : code[1] === 'm' ? 'm' : 'r';
  return `wheel_${axle}_${side}`;
}

/** Frame world matrices (RenderWare space), parents first, cycle-safe. */
function frameWorlds(clump: DffClump): THREE.Matrix4[] {
  const n = clump.frames.length;
  const local = clump.frames.map((f) => {
    const [a, b, c, d, e, g, h, i, j] = f.rotation; // right, up, at (each x y z)
    return new THREE.Matrix4().set(a, d, h, f.position[0], b, e, i, f.position[1], c, g, j, f.position[2], 0, 0, 0, 1);
  });
  const world: Array<THREE.Matrix4 | null> = new Array(n).fill(null);
  const done = (i: number, depth: number): THREE.Matrix4 => {
    const have = world[i];
    if (have) return have;
    const p = clump.frames[i].parent;
    const m = p >= 0 && p !== i && depth < 64 ? done(p, depth + 1).clone().multiply(local[i]) : local[i].clone();
    world[i] = m;
    return m;
  };
  return clump.frames.map((_, i) => done(i, 0));
}

const SWAP = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);

function colourMatches(c: [number, number, number, number], list: Array<[number, number, number]>): boolean {
  return list.some((p) => Math.abs(p[0] - c[0]) < 3 && Math.abs(p[1] - c[1]) < 3 && Math.abs(p[2] - c[2]) < 3);
}

function windingFlipped(g: DffGeometry): boolean {
  if (!g.normals) return false;
  let score = 0;
  const p = g.positions, nm = g.normals;
  const step = Math.max(1, Math.floor(g.indices.length / 3 / 400));
  for (let t = 0; t < g.indices.length / 3; t += step) {
    const a = g.indices[t * 3] * 3, b = g.indices[t * 3 + 1] * 3, c = g.indices[t * 3 + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    score += fx * (nm[a] + nm[b] + nm[c]) + fy * (nm[a + 1] + nm[b + 1] + nm[c + 1]) + fz * (nm[a + 2] + nm[b + 2] + nm[c + 2]);
  }
  return score < 0;
}

export interface BuiltDff { root: THREE.Group; triangles: number; vertices: number; notes: string[] }

/**
 * Builds a car from a parsed clump. Parts are named so the game's glTF car source finds them: road wheels are groups named
 * `wheel_f_l`, `wheel_r_r` ... (copies of the single "wheel" mesh are put at each `wheel_xx_dummy` frame), body paint is the
 * material named `paint`, `headlights` / `taillights` keep their frame names. Damaged (`_dam`) and low-detail (`_vlo`) variants
 * are left out.
 */
export function buildDff(clump: DffClump, textures: Map<string, THREE.Texture>, opts: DffOptions = {}): BuiltDff {
  const root = new THREE.Group();
  root.name = 'dff';
  const notes: string[] = [];
  const worlds = frameWorlds(clump);
  const paintColours = opts.paintColors?.length ? opts.paintColors : DEFAULT_PAINT_COLORS;
  const wheelExtra = new Set((opts.wheelFrames ?? []).map((s) => s.toLowerCase()));
  const matCache = new Map<string, THREE.MeshStandardMaterial>();
  const scale = opts.scale ?? 1;
  const pre = new THREE.Matrix4().makeScale(scale, scale, scale).multiply(SWAP);
  let triangles = 0, vertices = 0;

  const material = (m: DffMaterial, index: number): THREE.MeshStandardMaterial => {
    const isPaint = (opts.paintMaterial ? m.texture === opts.paintMaterial.toLowerCase() : false) || (m.texture === null && colourMatches(m.color, paintColours));
    const key = `${isPaint ? 'P' : ''}${m.texture ?? ''}|${m.color.join(',')}`;
    let out = matCache.get(key);
    if (out) return out;
    const tex = m.texture ? textures.get(m.texture) : undefined;
    out = new THREE.MeshStandardMaterial({
      color: isPaint ? 0xc0c0c0 : new THREE.Color(m.color[0] / 255, m.color[1] / 255, m.color[2] / 255).convertSRGBToLinear(),
      map: tex ?? null, roughness: isPaint ? 0.35 : 0.7, metalness: isPaint ? 0.4 : 0.05,
    });
    if (tex) out.color.set(0xffffff);
    out.name = isPaint ? 'paint' : (m.texture ?? `material${index}`);
    if (m.color[3] < 250) { out.transparent = true; out.opacity = Math.max(0.2, m.color[3] / 255); }
    else if (tex && (tex.userData as { hasAlpha?: boolean }).hasAlpha) out.alphaTest = 0.4;
    matCache.set(key, out);
    return out;
  };

  const meshesFor = (g: DffGeometry, matrix: THREE.Matrix4, name: string): THREE.Mesh[] => {
    const flip = windingFlipped(g);
    const normalM = new THREE.Matrix3().getNormalMatrix(matrix);
    const out: THREE.Mesh[] = [];
    const byMat = new Map<number, number[]>();
    for (let t = 0; t < g.triMaterial.length; t++) {
      const k = g.triMaterial[t];
      let l = byMat.get(k);
      if (!l) byMat.set(k, l = []);
      l.push(t);
    }
    const v = new THREE.Vector3();
    for (const [mi, tris] of byMat) {
      const remap = new Map<number, number>();
      const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
      const take = (vi: number): number => {
        let n = remap.get(vi);
        if (n !== undefined) return n;
        n = remap.size; remap.set(vi, n);
        v.set(g.positions[vi * 3], g.positions[vi * 3 + 1], g.positions[vi * 3 + 2]).applyMatrix4(matrix);
        pos.push(v.x, v.y, v.z);
        if (g.normals) { v.set(g.normals[vi * 3], g.normals[vi * 3 + 1], g.normals[vi * 3 + 2]).applyMatrix3(normalM).normalize(); nor.push(v.x, v.y, v.z); }
        if (g.uvs) uv.push(g.uvs[vi * 2], g.uvs[vi * 2 + 1]);
        else uv.push(0, 0);
        return n;
      };
      for (const t of tris) {
        const a = take(g.indices[t * 3]), b = take(g.indices[t * 3 + 1]), c = take(g.indices[t * 3 + 2]);
        if (flip) idx.push(a, c, b); else idx.push(a, b, c);
      }
      void col;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
      geo.setIndex(idx);
      if (nor.length) geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3)); else geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, material(g.materials[mi] ?? g.materials[0], mi));
      mesh.name = name;
      out.push(mesh);
      triangles += tris.length; vertices += pos.length / 3;
    }
    return out;
  };

  const wheelDummies: Array<{ name: string; world: THREE.Matrix4 }> = [];
  clump.frames.forEach((f, i) => {
    const n = f.name.toLowerCase();
    const m = WHEEL_DUMMY.exec(n);
    if (m) wheelDummies.push({ name: wheelName(m[1]), world: worlds[i] });
  });
  // A car that carries its own wheel_lf / wheel_rf ... meshes is drawn from those. Its plain `wheel` atomic is then a merged
  // far copy of all four wheels (4,608 triangles spanning the whole car in the real file) and would double them.
  const hasExplicitWheels = clump.atomics.some((a) => WHEEL_MESH.test((clump.frames[a.frame]?.name ?? '').toLowerCase()));
  let genericWheel: { geometry: DffGeometry; world: THREE.Matrix4 } | null = null;

  for (const a of clump.atomics) {
    const frameName = (clump.frames[a.frame]?.name ?? '').toLowerCase();
    const g = clump.geometries[a.geometry];
    if (!g || SKIP_FRAME.test(frameName)) continue;
    const world = worlds[a.frame] ?? new THREE.Matrix4();
    if (frameName === 'wheel' && hasExplicitWheels) continue;
    if (frameName === 'wheel' && wheelDummies.length) { genericWheel = { geometry: g, world }; continue; }
    const explicit = WHEEL_MESH.exec(frameName);
    if (explicit) {
      const grp = new THREE.Group();
      grp.name = wheelName(explicit[1]);
      for (const mesh of meshesFor(g, pre.clone().multiply(world), grp.name)) grp.add(mesh);
      root.add(grp);
      continue;
    }
    if (wheelExtra.has(frameName)) {
      const grp = new THREE.Group();
      grp.name = `wheel_${frameName}`;
      for (const mesh of meshesFor(g, pre.clone().multiply(world), grp.name)) grp.add(mesh);
      root.add(grp);
      continue;
    }
    for (const mesh of meshesFor(g, pre.clone().multiply(world), frameName || `part${a.geometry}`)) root.add(mesh);
  }
  if (genericWheel) {
    // the wheel mesh lives at its own frame; copy its shape (rotation only) to every wheel dummy
    const rotOnly = genericWheel.world.clone().setPosition(0, 0, 0);
    for (const d of wheelDummies) {
      const at = new THREE.Matrix4().setPosition(new THREE.Vector3().setFromMatrixPosition(d.world));
      const grp = new THREE.Group();
      grp.name = d.name;
      for (const mesh of meshesFor(genericWheel.geometry, pre.clone().multiply(at).multiply(rotOnly), d.name)) grp.add(mesh);
      root.add(grp);
    }
  }
  if (!root.children.length) throw new ModError('The .dff has no visible parts (every part is a damaged or low-detail copy).', 'format');
  if (!wheelDummies.length && !root.children.some((c) => /wheel/i.test(c.name))) notes.push('No wheel frames found (wheel_lf_dummy ...): the car will have no turning wheels. Name them in mod.json "wheelFrames".');
  return { root, triangles, vertices, notes };
}

/** A decoded TXD texture as a three texture. `forGround` flips the rows so it matches three's bottom-up UVs. */
export function txdTexture(t: TxdTexture, forGround: boolean): THREE.DataTexture {
  let data = t.rgba;
  if (forGround) {
    data = new Uint8Array(t.rgba.length);
    const row = t.width * 4;
    for (let y = 0; y < t.height; y++) data.set(t.rgba.subarray(y * row, (y + 1) * row), (t.height - 1 - y) * row);
  }
  const tex = new THREE.DataTexture(data, t.width, t.height, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  tex.name = t.name;
  tex.userData = { hasAlpha: t.hasAlpha };
  return tex;
}

/* ---------- images: size sniffing before any decode ---------- */

/** Width and height read from the file header of a PNG, JPEG or WebP, or null. Reads only the first bytes. */
export function imageSize(b: Uint8Array): { width: number; height: number; type: 'png' | 'jpeg' | 'webp' } | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length >= 24 && dv.getUint32(0) === 0x89504e47 && dv.getUint32(4) === 0x0d0a1a0a) return { width: dv.getUint32(16), height: dv.getUint32(20), type: 'png' };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let p = 2;
    while (p + 9 < b.length) {
      if (b[p] !== 0xff) { p++; continue; }
      const m = b[p + 1];
      if (m === 0xff) { p++; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: dv.getUint16(p + 5), width: dv.getUint16(p + 7), type: 'jpeg' };
      p += 2 + dv.getUint16(p + 2);
    }
    return null;
  }
  const tag = (o: number): string => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (b.length > 30 && tag(0) === 'RIFF' && tag(8) === 'WEBP') {
    const k = tag(12);
    if (k === 'VP8 ') return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff, type: 'webp' };
    if (k === 'VP8L') { const v = dv.getUint32(21, true); return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1, type: 'webp' }; }
    if (k === 'VP8X') return { width: (b[24] | (b[25] << 8) | (b[26] << 16)) + 1, height: (b[27] | (b[28] << 8) | (b[29] << 16)) + 1, type: 'webp' };
  }
  return null;
}

/** Refuses an image whose header is unreadable or whose size is over the tier's limit; returns its size. */
export function checkImage(name: string, b: Uint8Array, limits: ModLimits): { width: number; height: number; type: string } {
  if (b.byteLength > limits.maxTextureFileBytes) throw new ModError(`"${name}" is ${(b.byteLength / 1048576).toFixed(1)} MB; this device allows ${(limits.maxTextureFileBytes / 1048576).toFixed(0)} MB per texture file.`, 'oversize');
  const s = imageSize(b);
  if (!s || s.width < 1 || s.height < 1) throw new ModError(`"${name}" is not a readable PNG, JPEG or WebP image.`, 'format');
  if (s.width > limits.maxTextureDim || s.height > limits.maxTextureDim) throw new ModError(`"${name}" is ${s.width} x ${s.height}; this device allows up to ${limits.maxTextureDim} x ${limits.maxTextureDim}.`, 'oversize');
  return s;
}

/** Browser only. Decodes after `checkImage` has passed. `flipY` for ground textures (three's UVs run bottom-up), false for glTF-style models. */
export async function decodeImage(name: string, b: Uint8Array, limits: ModLimits, flipY: boolean, colour: boolean): Promise<THREE.Texture> {
  const s = checkImage(name, b, limits);
  const mime = s.type === 'png' ? 'image/png' : s.type === 'webp' ? 'image/webp' : 'image/jpeg';
  const blob = new Blob([b as BlobPart], { type: mime });
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(blob, { imageOrientation: flipY ? 'flipY' : 'none', premultiplyAlpha: 'none' }); }
  catch { throw new ModError(`The browser could not decode "${name}".`, 'format'); }
  const tex = new THREE.Texture(bitmap as unknown as HTMLImageElement);
  tex.flipY = false;
  tex.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  tex.name = name;
  return tex;
}
