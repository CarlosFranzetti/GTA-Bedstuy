/**
 * Far skyline: a ring of cheap proxy buildings beyond the edge of the modelled ten blocks, so the horizon is a city rather than
 * a void. ONE merged mesh and ONE material (vertex-coloured, so six facade colours share a draw call):
 *
 *  - walls sample a 512 x 512 window-grid atlas (8 bays x 8 floors, repeating); each building starts at a random cell so
 *    neighbours do not match. The matching emissive map lights about 45 % of the windows (a few cool TV-blue ones) and is
 *    switched on at night by watching the library's window material (no hook in main.ts needed),
 *  - every block has a cornice band, a raised parapet lip and a dark roof; some carry a water tank on legs or a mast,
 *  - nothing here casts or receives shadows, so it adds one scene draw and no shadow draws; it hides itself when the
 *    tier fog (phone: 100 m) swallows the whole ring.
 *
 * `planSkyline` (pure) decides the blocks, `buildSkylineGeometry` turns a plan into geometry, `createSkyline` makes the mesh.
 */
import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import type { GridBounds, IMaterialLibrary } from '@/world/types';

/** The ring starts this far outside the paved bounds (the near ground ends 60 m outside them) and ends `RING_END` out. */
export const RING_START = 70;
export const RING_END = 640;
const CELL = 36;
const BAY_W = 3.2;
const FLOOR_H = 3.4;
const ATLAS = 512;
const TILE = 64;
const TILES = ATLAS / TILE;
/** the fog far value below which the ring is invisible anyway (phone), so the mesh is not drawn */
export const HIDE_BELOW_FOG_FAR = 260;

/** Six facade colours (sRGB): brick, tan brick, dark brick, limestone, concrete, painted. */
export const FACADE_COLOURS: readonly (readonly [number, number, number])[] = [
  [0.66, 0.36, 0.29], [0.74, 0.64, 0.5], [0.46, 0.32, 0.27], [0.84, 0.8, 0.7], [0.6, 0.62, 0.66], [0.55, 0.62, 0.58],
];
const ROOF_COLOUR: readonly [number, number, number] = [0.2, 0.2, 0.21];
const GROUND_COLOUR: readonly [number, number, number] = [0.3, 0.29, 0.27];

export interface SkylineBlock {
  x: number; z: number; w: number; d: number; h: number;
  /** index into FACADE_COLOURS */
  colour: number;
  /** atlas start cell for the window grid */
  cu: number; cv: number;
  tank: boolean;
  /** mast height in metres, 0 = none */
  mast: number;
}

/** Decides the blocks of the ring around `bounds`. Deterministic for a given rng. */
export function planSkyline(bounds: GridBounds, rng: Rng): SkylineBlock[] {
  const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
  const hx = (bounds.maxX - bounds.minX) / 2, hz = (bounds.maxZ - bounds.minZ) / 2;
  const out: SkylineBlock[] = [];
  const n = Math.ceil((RING_END + Math.max(hx, hz)) / CELL);
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const x = cx + i * CELL + rng.range(-4, 4), z = cz + j * CELL + rng.range(-4, 4);
      const out2 = Math.max(Math.abs(x - cx) - hx, Math.abs(z - cz) - hz); // Chebyshev distance outside the bounds
      if (out2 < RING_START || out2 > RING_END) continue;
      // street gaps every fourth line, thinning with distance
      if (i % 4 === 0 || j % 4 === 0) continue;
      if (rng.next() < 0.18 + 0.45 * (out2 / RING_END)) continue;
      const far = out2 / RING_END;
      const w = rng.range(18, 30), d = rng.range(18, 30);
      let h = rng.range(13, 30 + 14 * far);
      if (out2 > 220 && rng.chance(0.03 + 0.03 * far)) h = rng.range(50, 100); // a few towers, never close in
      const colour = rng.int(0, FACADE_COLOURS.length - 1);
      const tank = h < 45 && rng.chance(0.22);
      const mast = h > 38 && rng.chance(0.35) ? rng.range(7, 22) : 0;
      out.push({ x, z, w, d, h, colour, cu: rng.int(0, TILES - 1), cv: rng.int(0, TILES - 1), tank, mast });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- geometry

class Buf {
  pos: number[] = []; uv: number[] = []; col: number[] = []; idx: number[] = [];
  private readonly c = new THREE.Color();
  rgb(t: readonly [number, number, number], k = 1): [number, number, number] {
    this.c.setRGB(t[0] * k, t[1] * k, t[2] * k, THREE.SRGBColorSpace);
    return [this.c.r, this.c.g, this.c.b];
  }
  /** a quad a-b-c-d (counter-clockwise seen from the front) with uv (u0,v0)-(u1,v1) */
  quad(a: number[], b: number[], c: number[], d: number[], uv: readonly [number, number, number, number], colour: [number, number, number]): void {
    const o = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c, ...d);
    this.uv.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]);
    for (let k = 0; k < 4; k++) this.col.push(...colour);
    this.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
}

/** UV of one solid wall-colour texel (corner of a tile, outside the window), used by anything that is not a window wall. */
const SOLID_U = 2.5 / ATLAS, SOLID_V = 1 - 2.5 / ATLAS;
const SOLID: readonly [number, number, number, number] = [SOLID_U, SOLID_V, SOLID_U, SOLID_V];

function box4(buf: Buf, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, uvOf: (len: number, hgt: number) => readonly [number, number, number, number], colour: [number, number, number]): void {
  // south (+z), east (+x), north (-z), west (-x), outward faces
  buf.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], uvOf(x1 - x0, y1 - y0), colour);
  buf.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], uvOf(z1 - z0, y1 - y0), colour);
  buf.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], uvOf(x1 - x0, y1 - y0), colour);
  buf.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], uvOf(z1 - z0, y1 - y0), colour);
}

export function buildSkylineGeometry(blocks: readonly SkylineBlock[], bounds: GridBounds): THREE.BufferGeometry {
  const buf = new Buf();
  const rng = new Rng('skyline-uv');
  for (const b of blocks) {
    const fc = FACADE_COLOURS[b.colour % FACADE_COLOURS.length];
    const wall = buf.rgb(fc), band = buf.rgb(fc, 1.12), lip = buf.rgb(fc, 0.8), roof = buf.rgb(ROOF_COLOUR);
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
    const hw = Math.max(2, b.h - 1);
    // windowed walls: each wall starts at its own random cell of the atlas
    const startU = b.cu, startV = b.cv;
    let k = 0;
    box4(buf, x0, z0, x1, z1, 0, hw, (len, hgt) => {
      const bays = Math.max(2, Math.round(len / BAY_W)), floors = Math.max(1, Math.round(hgt / FLOOR_H));
      const u0 = ((startU + k * 3) % TILES) / TILES, v0 = ((startV + k) % TILES) / TILES;
      k++;
      return [u0, v0, u0 + bays / TILES, v0 + floors / TILES] as const;
    }, wall);
    // cornice band, slightly proud
    const o = 0.4;
    box4(buf, x0 - o, z0 - o, x1 + o, z1 + o, hw, b.h, () => SOLID, band);
    // parapet lip above the cornice, set back a touch
    const li = 0.25;
    box4(buf, x0 + li, z0 + li, x1 - li, z1 - li, b.h, b.h + 0.9, () => SOLID, lip);
    // roof
    buf.quad([x0 - o, b.h, z1 + o], [x1 + o, b.h, z1 + o], [x1 + o, b.h, z0 - o], [x0 - o, b.h, z0 - o], SOLID, roof);
    if (b.tank) {
      // water tank on legs: 8-sided drum + cone lid on a box, in rusty brown
      const tc = buf.rgb([0.4, 0.27, 0.2]), lc = buf.rgb([0.3, 0.2, 0.16]);
      const tx = b.x + rng.range(-b.w * 0.25, b.w * 0.25), tz = b.z + rng.range(-b.d * 0.25, b.d * 0.25);
      const r = 2.3, y0 = b.h + 0.9, y1 = y0 + 1.4, y2 = y1 + 4.2, y3 = y2 + 1.8;
      box4(buf, tx - 1.6, tz - 1.6, tx + 1.6, tz + 1.6, y0, y1, () => SOLID, lc); // legs / platform block
      const seg = 8;
      for (let s = 0; s < seg; s++) {
        const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
        const p0 = [tx + Math.cos(a0) * r, tz + Math.sin(a0) * r], p1 = [tx + Math.cos(a1) * r, tz + Math.sin(a1) * r];
        buf.quad([p1[0], y1, p1[1]], [p0[0], y1, p0[1]], [p0[0], y2, p0[1]], [p1[0], y2, p1[1]], SOLID, tc);
        // cone lid triangle as a degenerate quad (apex doubled)
        buf.quad([p1[0], y2, p1[1]], [p0[0], y2, p0[1]], [tx, y3, tz], [tx, y3, tz], SOLID, lc);
      }
    }
    if (b.mast > 0) {
      const mc = buf.rgb([0.35, 0.35, 0.38]);
      const mx = b.x + rng.range(-b.w * 0.3, b.w * 0.3), mz = b.z + rng.range(-b.d * 0.3, b.d * 0.3);
      box4(buf, mx - 0.35, mz - 0.35, mx + 0.35, mz + 0.35, b.h + 0.9, b.h + 0.9 + b.mast, () => SOLID, mc);
    }
  }
  // dust-coloured apron under the ring, below the near ground so the two never fight
  const e = RING_END + 120;
  const gc = buf.rgb(GROUND_COLOUR);
  const gx0 = bounds.minX - e, gx1 = bounds.maxX + e, gz0 = bounds.minZ - e, gz1 = bounds.maxZ + e;
  buf.quad([gx0, -0.4, gz1], [gx1, -0.4, gz1], [gx1, -0.4, gz0], [gx0, -0.4, gz0], SOLID, gc);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
  g.setIndex(buf.idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------------------------------- textures

/** Paints the colour atlas (grey wall, dark glass) and the emissive atlas (lit windows). Needs a DOM canvas. */
export function paintSkylineAtlas(make: (w: number, h: number) => HTMLCanvasElement, rng: Rng): { map: HTMLCanvasElement; emissive: HTMLCanvasElement } {
  const mc = make(ATLAS, ATLAS), ec = make(ATLAS, ATLAS);
  const m = mc.getContext('2d')!, e = ec.getContext('2d')!;
  m.fillStyle = '#d6d3cc'; m.fillRect(0, 0, ATLAS, ATLAS);
  e.fillStyle = '#000'; e.fillRect(0, 0, ATLAS, ATLAS);
  for (let ty = 0; ty < TILES; ty++) {
    for (let tx = 0; tx < TILES; tx++) {
      const x = tx * TILE, y = ty * TILE;
      // window: dark glass with a lighter sill and a centre mullion
      m.fillStyle = '#9d9a92'; m.fillRect(x + 12, y + 10, 40, 4); // lintel shadow
      m.fillStyle = '#26303d'; m.fillRect(x + 14, y + 14, 36, 36);
      m.fillStyle = '#3a4656'; m.fillRect(x + 14, y + 14, 36, 8);
      m.fillStyle = '#cfcbc2'; m.fillRect(x + 31, y + 14, 2, 36); m.fillRect(x + 12, y + 50, 40, 3);
      const r = rng.next();
      if (r < 0.46) {
        e.fillStyle = rng.chance(0.14) ? '#8fb2ff' : rng.chance(0.5) ? '#ffc878' : '#ffd9a0';
        e.fillRect(x + 15, y + 15, 34, 34);
      }
    }
  }
  return { map: mc, emissive: ec };
}

export const SKYLINE_NIGHT_INTENSITY = 0.75;

/** The skyline mesh: hides itself when the fog is too near to show it, and lights its windows when the library's windows glow. */
export class SkylineMesh extends THREE.Mesh {
  private readonly probe: THREE.Material | null;
  constructor(geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial, probe: THREE.Material | null) {
    super(geometry, material);
    this.probe = probe;
    this.name = 'skyline';
    this.castShadow = false;
    this.receiveShadow = false;
    this.frustumCulled = false; // one mesh around the whole city; it is always (partly) in view
    this.matrixAutoUpdate = false;
  }
  override updateMatrixWorld(force?: boolean): void {
    let root: THREE.Object3D = this;
    while (root.parent) root = root.parent;
    const fog = (root as THREE.Scene).fog as THREE.Fog | null | undefined;
    this.visible = !fog || fog.far >= HIDE_BELOW_FOG_FAR;
    const mat = this.material as THREE.MeshStandardMaterial;
    const night = !!this.probe && ((this.probe as THREE.MeshStandardMaterial).emissiveIntensity ?? 0) > 0;
    const want = night ? SKYLINE_NIGHT_INTENSITY : 0;
    if (mat.emissiveIntensity !== want) mat.emissiveIntensity = want;
    super.updateMatrixWorld(force);
  }
}

/** Builds the skyline mesh, or null without a DOM canvas (unit tests build the geometry directly). */
export function createSkyline(bounds: GridBounds, materials: IMaterialLibrary, rng: Rng): THREE.Mesh | null {
  const blocks = planSkyline(bounds, rng.fork('plan'));
  const geometry = buildSkylineGeometry(blocks, bounds);
  let map: THREE.Texture, emissiveMap: THREE.Texture;
  if (typeof document !== 'undefined') {
    const c = paintSkylineAtlas((w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; }, rng.fork('atlas'));
    map = new THREE.CanvasTexture(c.map); emissiveMap = new THREE.CanvasTexture(c.emissive);
  } else {
    map = new THREE.DataTexture(new Uint8Array([214, 211, 204, 255]), 1, 1); map.needsUpdate = true;
    emissiveMap = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); emissiveMap.needsUpdate = true;
  }
  for (const t of [map, emissiveMap]) {
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
  }
  const material = new THREE.MeshStandardMaterial({
    name: 'skyline', map, emissiveMap, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0, vertexColors: true, roughness: 0.92, metalness: 0,
  });
  return new SkylineMesh(geometry, material, materials.get('window', 0));
}
