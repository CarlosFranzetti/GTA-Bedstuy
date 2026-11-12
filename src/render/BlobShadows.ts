/**
 * Blob shadows for the phone tier: one soft dark decal under every car and one under every pedestrian / the player,
 * drawn as TWO instanced meshes (2 draw calls and 4 triangles per blob, whatever the traffic count). They give the
 * contact darkening a shadow map would (cars and people no longer float on the road) without re-drawing any geometry.
 *
 * Usage, once per rendered frame after the entities were placed:
 *   blobs.beginFrame();
 *   blobs.addCar(x, z, heading, spec.length, spec.width);   // per visible car (heading as in Body2D: 0 = -z, clockwise)
 *   blobs.addPed(x, z);                                     // per visible pedestrian and the player on foot
 *   blobs.endFrame();
 * A blob "removes itself" by simply not being added the next frame (culled or despawned entities never leave a ghost).
 * Slots past the capacity are dropped (counted in `droppedCars` / `droppedPeds`), never an error.
 */
import * as THREE from 'three';
import { phoneSunCasters } from './Shadows';
import { splitGeometryByCell } from './Culling';
import { browserTier } from './StartTier';

export const BLOB_CAR_CAPACITY = 96;
export const BLOB_PED_CAPACITY = 96;
/** Blob height above the ground (m): above the road/sidewalk top, below decals that use polygonOffset. */
export const BLOB_Y = 0.045;
/** A car blob is its spec box times this (so the soft edge reaches past the wheels). */
export const CAR_BLOB_SCALE_W = 1.28;
export const CAR_BLOB_SCALE_L = 1.18;
/** Pedestrian blob diameter (m). */
export const PED_BLOB_SIZE = 0.95;
/** Peak opacity per blob kind at full daylight; `setStrength` scales both. */
export const CAR_BLOB_OPACITY = 0.62;
export const PED_BLOB_OPACITY = 0.5;
/** Blob weight while the real sun shadow is on (the blob then only grounds the wheels and feet). */
export const SUN_SHADOW_BLOB_WEIGHT = 0.6;

/** Writes translate(x, y, z) * rotateY(yaw) * scale(sx, 1, sz) (column-major) into `out` at element offset `o`. */
export function writeBlobMatrix(out: Float32Array | number[], o: number, x: number, z: number, yaw: number, sx: number, sz: number, y = BLOB_Y): void {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  out[o] = c * sx; out[o + 1] = 0; out[o + 2] = -s * sx; out[o + 3] = 0;
  out[o + 4] = 0; out[o + 5] = 1; out[o + 6] = 0; out[o + 7] = 0;
  out[o + 8] = s * sz; out[o + 9] = 0; out[o + 10] = c * sz; out[o + 11] = 0;
  out[o + 12] = x; out[o + 13] = y; out[o + 14] = z; out[o + 15] = 1;
}

/** Opacity (0..1) of a pixel at normalised position (u, v in -1..1) of the car decal: a rounded box with a dark core. */
export function carBlobAlpha(u: number, v: number): number {
  // signed distance to a rounded rectangle (half-extents 0.62 x 0.72, corner radius 0.3), soft falloff to the edge
  const qx = Math.abs(u) - (0.62 - 0.3), qy = Math.abs(v) - (0.72 - 0.3);
  const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 0.3;
  const t = Math.min(1, Math.max(0, 1 - (d + 0.34) / 0.34)); // 1 inside d <= -0.34, 0 at d >= 0
  return t * t * (3 - 2 * t);
}

/** Opacity of the pedestrian decal: a plain radial falloff. */
export function pedBlobAlpha(u: number, v: number): number {
  const r = Math.min(1, Math.hypot(u, v));
  const t = 1 - r;
  return t * t * (3 - 2 * t);
}

function gradientTexture(size: number, alphaAt: (u: number, v: number) => number): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = alphaAt(((x + 0.5) / size) * 2 - 1, ((y + 0.5) / size) * 2 - 1);
      const i = (y * size + x) * 4;
      img.data[i] = 0; img.data[i + 1] = 0; img.data[i + 2] = 0; img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

interface BlobSet { mesh: THREE.InstancedMesh; caster: THREE.InstancedMesh | null; n: number; dropped: number; capacity: number; }

/** Approximate roof height (m) of a lot type, for the sun-shadow caster prisms (0 = no caster: vacant lot, scaffold). */
export const LOT_CASTER_HEIGHT: Readonly<Record<string, number>> = { brownstone: 13, rowhouse: 10, mixeduse: 11, church: 18, apartment: 22, vacant: 0, scaffold: 0 };
/** The caster prism is pulled this far in from the building line / side walls so it never shadows its own facade (no acne). */
export const CASTER_INSET = 0.3;
/** Car caster box height (m) and pedestrian caster box (w, h, d). */
export const CAR_CASTER_HEIGHT = 1.45;
export const PED_CASTER = { w: 0.5, h: 1.75, d: 0.35 };

export interface LotFootprint {
  frontA: { x: number; z: number };
  frontB: { x: number; z: number };
  depth: number;
  /** unit normal from the lot towards the street */
  outward: { x: number; z: number };
  type: string;
}

/**
 * One merged position-only geometry of box prisms, one per building lot: the "building fronts" that cast the phone sun
 * shadow (12 triangles a lot; clutter, trees, signs and fences never cast). Returns the geometry and the lot count.
 */
export function buildLotCasterGeometry(lots: ReadonlyArray<LotFootprint>): { geometry: THREE.BufferGeometry; lots: number } {
  const pos: number[] = [], idx: number[] = [];
  let n = 0;
  for (const l of lots) {
    const h = LOT_CASTER_HEIGHT[l.type] ?? 0;
    if (h <= 0) continue;
    const dx = l.frontB.x - l.frontA.x, dz = l.frontB.z - l.frontA.z;
    const len = Math.hypot(dx, dz);
    if (len < 1) continue;
    const ux = dx / len, uz = dz / len;
    const a = { x: l.frontA.x + ux * CASTER_INSET - l.outward.x * CASTER_INSET, z: l.frontA.z + uz * CASTER_INSET - l.outward.z * CASTER_INSET };
    const w = Math.max(0.5, len - 2 * CASTER_INSET), d = Math.max(0.5, l.depth - 2 * CASTER_INSET);
    const c = [
      [a.x, a.z], [a.x + ux * w, a.z + uz * w],
      [a.x + ux * w - l.outward.x * d, a.z + uz * w - l.outward.z * d], [a.x - l.outward.x * d, a.z - l.outward.z * d],
    ];
    const base = pos.length / 3;
    for (const y of [0, h]) for (const [x, z] of c) pos.push(x, y, z);
    // 4 walls + top (bottom omitted: never seen from above)
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; idx.push(base + i, base + j, base + 4 + j, base + i, base + 4 + j, base + 4 + i); }
    idx.push(base + 4, base + 5, base + 6, base + 4, base + 6, base + 7);
    n++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return { geometry: g, lots: n };
}

/** Unit box from y = 0 to `height`, footprint scaled by 1/sx, 1/sz so that an instance matrix scaled for the blob gives the exact box. */
function casterBox(width: number, height: number, depth: number, sx: number, sz: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(width / sx, height, depth / sz);
  g.translate(0, height / 2, 0);
  return g;
}

/** Cell size (m) of the building shadow-caster prisms. */
const CASTER_CELL_M = 100;

export class BlobShadows {
  /** Add this to the scene. */
  readonly group = new THREE.Group();
  private readonly cars: BlobSet;
  private readonly peds: BlobSet;
  private readonly carMat: THREE.MeshBasicMaterial;
  private readonly pedMat: THREE.MeshBasicMaterial;
  private readonly textures: THREE.Texture[] = [];
  private strength = 1;
  private on = true;

  constructor(carCapacity = BLOB_CAR_CAPACITY, pedCapacity = BLOB_PED_CAPACITY) {
    this.group.name = 'blob-shadows';
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2); // lies flat, faces up; local x = width, local z = length
    const carTex = gradientTexture(64, carBlobAlpha);
    const pedTex = gradientTexture(32, pedBlobAlpha);
    if (carTex) this.textures.push(carTex);
    if (pedTex) this.textures.push(pedTex);
    const mat = (map: THREE.Texture | null): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({
      color: 0x000000, map, transparent: true, depthWrite: false, opacity: 1,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false,
    });
    this.carMat = mat(carTex);
    this.pedMat = mat(pedTex);
    this.cars = this.makeSet(geo, this.carMat, carCapacity, 'blob:cars');
    this.peds = this.makeSet(geo, this.pedMat, pedCapacity, 'blob:peds');
    this.casterMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, colorWrite: false, depthWrite: false, name: 'blob-caster' });
    this.casterGroup.name = 'phone-sun-casters';
    this.casterGroup.visible = false;
    this.applyStrength();
  }

  /** Sun-shadow casters (cars, pedestrians, building prisms): shown only while the shadow map renders. Add to the scene. */
  readonly casterGroup = new THREE.Group();
  private readonly casterMat: THREE.MeshBasicMaterial;
  private casterOn = false;
  /** tiers with a real sun shadow draw the (inset, low) building prisms for the geometry beyond the detailed proxies' reach */
  farBuildings = false;
  private buildingCaster: THREE.Group | null = null;
  private casterTriangles = 0;

  /**
   * Builds the phone sun-shadow casters: a box under every car and pedestrian blob (sharing the blob instance matrices, so no
   * extra upload) plus one merged prism mesh for the building lots. 3 draws in the shadow pass, a few thousand triangles.
   */
  buildSunCasters(lots: ReadonlyArray<LotFootprint>): { triangles: number; lots: number } {
    if (this.buildingCaster) return { triangles: this.casterTriangles, lots: 0 };
    phoneSunCasters.ready = true;
    const make = (set: BlobSet, geo: THREE.BufferGeometry, name: string): void => {
      const m = new THREE.InstancedMesh(geo, this.casterMat, set.capacity);
      m.instanceMatrix = set.mesh.instanceMatrix;
      m.count = 0; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = false; m.name = name;
      set.caster = m;
      this.casterGroup.add(m);
    };
    make(this.cars, casterBox(1, CAR_CASTER_HEIGHT, 1, CAR_BLOB_SCALE_W, CAR_BLOB_SCALE_L), 'caster:cars');
    make(this.peds, casterBox(PED_CASTER.w, PED_CASTER.h, PED_CASTER.d, PED_BLOB_SIZE, PED_BLOB_SIZE), 'caster:peds');
    const b = buildLotCasterGeometry(lots);
    // one prism mesh per 100 m cell: the shadow pass culls each against the sun's box, so only the few cells around the player draw
    // (the city-wide mesh was 31 k triangles in every shadow pass whatever the box covered)
    this.buildingCaster = new THREE.Group();
    this.buildingCaster.name = 'caster:buildings';
    this.buildingCaster.matrixAutoUpdate = false;
    // phone keeps the single mesh: its budget is draws (3 shadow draws), and 31 k triangles fit; low and up are the other way round
    const cells = browserTier() === 'phone' ? null : splitGeometryByCell(b.geometry, CASTER_CELL_M, CASTER_CELL_M);
    for (const g of cells ? cells.values() : [b.geometry]) {
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, this.casterMat);
      m.castShadow = true; m.receiveShadow = false; m.name = 'caster:buildings:cell'; m.matrixAutoUpdate = false;
      this.buildingCaster.add(m);
    }
    if (cells) b.geometry.dispose();
    this.casterGroup.add(this.buildingCaster);
    this.casterTriangles = (b.geometry.index?.count ?? 0) / 3 + 12 + 12;
    return { triangles: this.casterTriangles, lots: b.lots };
  }

  /** Whether the sun-shadow casters are active (they only render while the shadow map does). */
  get sunCasters(): boolean { return this.casterOn && !!this.buildingCaster; }
  setSunCasters(on: boolean): void {
    this.casterOn = on;
    this.farBuildings = !on; // main.ts calls this for every tier: off = a tier with a real sun shadow map
    // with a real sun shadow the blob only needs to ground the wheels / feet: halve its weight
    this.applyStrength();
  }

  /** Makes the caster group visible exactly while the shadow map renders. Returns an undo function. */
  wrapShadowRender(renderer: { shadowMap: { render: (...a: never[]) => void } }): () => void {
    const orig = renderer.shadowMap.render;
    renderer.shadowMap.render = ((...a: never[]) => {
      // phone: every caster. Other tiers: only the building prisms, as the far stand-in for the detailed cell proxies (RenderProxies keeps those to the shadow box's surroundings)
      const all = this.sunCasters;
      this.casterGroup.visible = all || (this.farBuildings && !!this.buildingCaster);
      for (const s of [this.cars, this.peds]) if (s.caster) s.caster.visible = all && s.n > 0;
      try { orig.apply(renderer.shadowMap, a); } finally { this.casterGroup.visible = false; }
    }) as never;
    return () => { renderer.shadowMap.render = orig; };
  }

  private makeSet(geo: THREE.BufferGeometry, material: THREE.Material, capacity: number, name: string): BlobSet {
    const mesh = new THREE.InstancedMesh(geo, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.renderOrder = 2;
    mesh.name = name;
    this.group.add(mesh);
    return { mesh, caster: null, n: 0, dropped: 0, capacity };
  }

  /** Instances written this frame. */
  get carCount(): number { return this.cars.n; }
  get pedCount(): number { return this.peds.n; }
  /** Instances that did not fit (since the last beginFrame). */
  get droppedCars(): number { return this.cars.dropped; }
  get droppedPeds(): number { return this.peds.dropped; }
  /** Draw calls the blobs add to a frame (0 when nothing is added or the set is disabled). */
  get drawCalls(): number {
    return this.on ? (this.cars.n > 0 ? 1 : 0) + (this.peds.n > 0 ? 1 : 0) : 0;
  }
  get enabled(): boolean { return this.on; }

  /** Tier switch: the blobs are for tiers WITHOUT a sun shadow map (they would double the shadow under cars otherwise). */
  setEnabled(on: boolean): void {
    this.on = on;
    this.group.visible = on;
  }

  /** Daylight strength 0..1 (sun shadows fade at night; the blob keeps a floor of 0.45 so cars stay grounded under street lamps). */
  setStrength(s: number): void {
    this.strength = Math.min(1, Math.max(0, Number.isFinite(s) ? s : 1));
    this.applyStrength();
  }
  private applyStrength(): void {
    const k = (0.45 + 0.55 * this.strength) * (this.sunCasters ? SUN_SHADOW_BLOB_WEIGHT : 1);
    this.carMat.opacity = CAR_BLOB_OPACITY * k;
    this.pedMat.opacity = PED_BLOB_OPACITY * k;
  }

  beginFrame(): void {
    this.cars.n = 0; this.cars.dropped = 0;
    this.peds.n = 0; this.peds.dropped = 0;
  }

  /** `heading` as in Body2D (0 = north / -z, radians clockwise from above); `length` / `width` from the vehicle spec. Returns false when full. */
  addCar(x: number, z: number, heading: number, length: number, width: number): boolean {
    const s = this.cars;
    if (s.n >= s.capacity) { s.dropped++; return false; }
    writeBlobMatrix(s.mesh.instanceMatrix.array as Float32Array, s.n * 16, x, z, -heading, width * CAR_BLOB_SCALE_W, length * CAR_BLOB_SCALE_L);
    s.n++;
    return true;
  }

  /** A pedestrian or the player on foot; `size` scales the decal (1 = adult). */
  addPed(x: number, z: number, size = 1): boolean {
    const s = this.peds;
    if (s.n >= s.capacity) { s.dropped++; return false; }
    const d = PED_BLOB_SIZE * size;
    writeBlobMatrix(s.mesh.instanceMatrix.array as Float32Array, s.n * 16, x, z, 0, d, d);
    s.n++;
    return true;
  }

  endFrame(): void {
    for (const s of [this.cars, this.peds]) {
      s.mesh.count = s.n;
      s.mesh.visible = s.n > 0;
      if (s.caster) { s.caster.count = s.n; s.caster.visible = s.n > 0; }
      if (s.n > 0) {
        const a = s.mesh.instanceMatrix;
        a.clearUpdateRanges(); a.addUpdateRange(0, s.n * 16); a.needsUpdate = true;
      }
    }
  }

  dispose(): void {
    this.cars.mesh.geometry.dispose();
    this.carMat.dispose(); this.pedMat.dispose();
    this.cars.mesh.dispose(); this.peds.mesh.dispose();
    this.casterMat.dispose();
    this.cars.caster?.geometry.dispose(); this.peds.caster?.geometry.dispose(); this.buildingCaster?.children.forEach((c) => (c as THREE.Mesh).geometry.dispose());
    this.casterGroup.removeFromParent();
    for (const t of this.textures) t.dispose();
    this.group.removeFromParent();
  }
}
