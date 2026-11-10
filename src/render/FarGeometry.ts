/**
 * Far-distance geometry by vertex clustering: vertices snap to a grid of `cell` metres (every attribute is averaged per
 * cluster), triangles that collapse or repeat are dropped. Used for the far car proxies (CarLod) and for building cells
 * beyond the tier's far range (ChunkCuller). Pure geometry in, geometry out; no GPU.
 */
import * as THREE from 'three';

/** Dominant axis and sign of a normal: 0..5, so faces of different orientation never share a cluster. */
export function normalBucket(x: number, y: number, z: number): number {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  if (ax >= ay && ax >= az) return x >= 0 ? 0 : 1;
  return ay >= az ? (y >= 0 ? 2 : 3) : (z >= 0 ? 4 : 5);
}

/**
 * Clustered copy of `src` (indexed or not). With `byNormal` a cluster also needs one normal bucket, which keeps walls, reveals
 * and roofs apart. Returns an indexed geometry with the attributes of `src` (float attributes only; normals renormalised).
 */
export function clusterGeometry(src: THREE.BufferGeometry, cell: number, byNormal = false): THREE.BufferGeometry {
  const pos = src.getAttribute('position'), nor = src.getAttribute('normal');
  const names = Object.keys(src.attributes).filter((k) => src.attributes[k].array instanceof Float32Array);
  const attrs = names.map((k) => src.getAttribute(k) as THREE.BufferAttribute);
  const sizes = attrs.map((a) => a.itemSize);
  const stride = sizes.reduce((a, b) => a + b, 0) + 1;
  const n = pos.count;
  const ids = new Map<number, number>();
  const of = new Int32Array(n);
  // grid origin at the geometry's own minimum, so world-space coordinates far from 0 cannot overflow the 12-bit cell index
  let mx = Infinity, my = Infinity, mz = Infinity, ex = 0, ey = 0, ez = 0;
  for (let i = 0; i < n; i++) { mx = Math.min(mx, pos.getX(i)); my = Math.min(my, pos.getY(i)); mz = Math.min(mz, pos.getZ(i)); }
  for (let i = 0; i < n; i++) { ex = Math.max(ex, pos.getX(i) - mx); ey = Math.max(ey, pos.getY(i) - my); ez = Math.max(ez, pos.getZ(i) - mz); }
  cell = Math.max(cell, Math.max(ex, ey, ez) / 4000); // at most 4000 cells per axis
  let sum = new Float64Array(1024 * stride);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let key = (Math.floor((x - mx) / cell) * 4096 + Math.floor((y - my) / cell)) * 4096 + Math.floor((z - mz) / cell);
    if (byNormal && nor) key = key * 6 + normalBucket(nor.getX(i), nor.getY(i), nor.getZ(i));
    let id = ids.get(key);
    if (id === undefined) {
      id = ids.size; ids.set(key, id);
      if ((id + 1) * stride > sum.length) { const s2 = new Float64Array(sum.length * 2); s2.set(sum); sum = s2; }
    }
    of[i] = id;
    let o = id * stride;
    for (let a = 0; a < attrs.length; a++) for (let k = 0; k < sizes[a]; k++) sum[o++] += attrs[a].getComponent(i, k);
    sum[o] += 1;
  }
  const idx = src.index;
  const triCount = (idx ? idx.count : n) / 3;
  const seen = new Set<string>();
  const tri: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const a = of[idx ? idx.getX(t * 3) : t * 3], b = of[idx ? idx.getX(t * 3 + 1) : t * 3 + 1], c = of[idx ? idx.getX(t * 3 + 2) : t * 3 + 2];
    if (a === b || b === c || a === c) continue;
    const k = a < b ? (b < c ? `${a},${b},${c}` : a < c ? `${a},${c},${b}` : `${c},${a},${b}`) : (a < c ? `${b},${a},${c}` : b < c ? `${b},${c},${a}` : `${c},${b},${a}`);
    if (seen.has(k)) continue;
    seen.add(k);
    tri.push(a, b, c);
  }
  // compact: only clusters a kept triangle uses
  const remap = new Int32Array(ids.size).fill(-1);
  let m = 0;
  const index = new Uint32Array(tri.length);
  for (let i = 0; i < tri.length; i++) { if (remap[tri[i]] < 0) remap[tri[i]] = m++; index[i] = remap[tri[i]]; }
  const g = new THREE.BufferGeometry();
  const out = attrs.map((a, ai) => new Float32Array(m * sizes[ai]));
  for (let c = 0; c < ids.size; c++) {
    const r = remap[c];
    if (r < 0) continue;
    let o = c * stride;
    const k = 1 / sum[o + stride - 1];
    for (let a = 0; a < attrs.length; a++) for (let j = 0; j < sizes[a]; j++) out[a][r * sizes[a] + j] = sum[o++] * k;
  }
  names.forEach((name, ai) => {
    if (name === 'normal') {
      const v = out[ai];
      for (let i = 0; i < m; i++) { const l = Math.hypot(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]) || 1; v[i * 3] /= l; v[i * 3 + 1] /= l; v[i * 3 + 2] /= l; }
    }
    g.setAttribute(name, new THREE.BufferAttribute(out[ai], sizes[ai], attrs[ai].normalized));
  });
  g.setIndex(new THREE.BufferAttribute(index, 1));
  return g;
}

/** Triangles of a geometry. */
export const trisOf = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

/** `g` clustered to at most `max` triangles with the finest grid that fits (g itself when it already does); non-indexed. */
export function shrinkTo(g: THREE.BufferGeometry | null, max: number): THREE.BufferGeometry | null {
  if (!g || trisOf(g) <= max) return g;
  let lo = 0.02, hi = 2, best: THREE.BufferGeometry | null = null;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const c = clusterGeometry(g, mid);
    if (trisOf(c) <= max) { best = c; hi = mid; } else lo = mid;
  }
  return (best ?? clusterGeometry(g, hi)).toNonIndexed();
}
