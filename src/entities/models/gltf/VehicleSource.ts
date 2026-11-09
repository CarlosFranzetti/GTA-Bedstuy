/**
 * glTF vehicle bodies (src/assets/models/vehicle-{sedan,suv,boxtruck,cop}.glb) in the `CarModel` shape that
 * Vehicle drives, so a file simply replaces buildCarModel for that type.
 *
 * Conventions applied to every instance:
 *  - the model is turned so its long axis is z and its front points to -z (decided from head/tail lights or
 *    front/rear wheels; glTF +z forward is assumed when nothing tells otherwise),
 *  - fitted to the vehicle spec: the body is scaled per axis to spec.length x spec.width x spec.height (toy-proportioned
 *    packs like Kenney's are much wider and shorter than a real car, and the physics box is the spec), centred on x/z
 *    and standing on y = 0. Wheels are NOT stretched: they keep a uniform scale (the height factor) so they stay round
 *    and still touch the ground,
 *  - nodes named /wheel/i whose bottom is near the ground are wrapped in a roll pivot (rotate .x to spin); the two front
 *    ones are also wrapped in a steer pivot (rotate .y). Other "wheel" nodes (a spare tyre) stay part of the body,
 *  - meshes named /head.*(light|lamp)/ and /tail.*(light|lamp)/ get their own emissive material clone (Vehicle drives
 *    emissiveIntensity). Packs without light nodes (Kenney) get them synthesised: two lens quads laid on the body surface
 *    at the front corners and at the rear, found by casting rays at the body, plus licence plates. The police car also gets a
 *    two-halved light bar on the roof (the red and blue meshes Vehicle flashes) when the file has none,
 *  - paint: material name /paint|body/ (else the largest non-wheel mesh). Untextured paint is tinted to spec.color. Palette
 *    textured paint (Kenney: one colour-atlas texture for the whole car) is recoloured by PaletteCarPaint inside the
 *    paint cell of the atlas (see KENNEY_PAINT_CELLS), so the windows, trim and tyres keep their colours,
 *  - `lodParts()` builds the merged, instance-colourable far-car model that CarLod draws as one instanced mesh per type.
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { IMaterialLibrary, VehicleSpec, VehicleType } from '@/world/types';
import type { CarModel } from '@/entities/models/carModel';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import { createGltfLoader, warnOnce, type GLTF } from './loader';
import { PaletteCarPaint, type PaletteCell } from './PaletteCarPaint';

const HEAD_RE = /head[\s._-]*(light|lamp)/i;
const TAIL_RE = /tail[\s._-]*(light|lamp)|brake[\s._-]*light/i;
const WHEEL_RE = /wheel/i;
const FRONT_RE = /front|(^|[^a-z])f[lr]?([^a-z]|$)/i;
const PAINT_RE = /paint|body/i;
const HOOD_RE = /hood|bonnet/i;
const BAR_RE = /light[\s._-]*bar|siren|beacon|bar/i;

// same colours as carModel.ts (its materials are built inline there)
const HEAD_EMISSIVE = 0xfff2cc;
const TAIL_EMISSIVE = 0xff1a1a;

/** Paint cell of each shipped Kenney car in the shared 8 x 4 palette atlas (cop: keeps its livery). */
export const KENNEY_PAINT_CELLS: Record<VehicleType, PaletteCell | null> = {
  sedan: { col: 6, row: 1 }, // red
  suv: { col: 3, row: 1 }, // green
  boxtruck: { col: 3, row: 1 }, // green (the delivery van stands in for a box truck)
  cop: null,
  cab: null, // the taxi keeps its livery (procedural body)
};
const KENNEY_MATERIAL = 'colormap';

const names = (o: THREE.Object3D): string => o.name;
const matOf = (m: THREE.Mesh): THREE.Material | null => (Array.isArray(m.material) ? null : m.material);
const matName = (m: THREE.Mesh): string => (matOf(m)?.name ?? '');

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); });
  return out;
}

/** Topmost nodes whose own name matches (their descendants are part of them). */
function topmostByName(root: THREE.Object3D, re: RegExp): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const visit = (o: THREE.Object3D, inside: boolean): void => {
    const hit = !inside && o !== root && re.test(names(o));
    if (hit) out.push(o);
    for (const c of o.children) visit(c, inside || hit);
  };
  visit(root, false);
  return out;
}

function boxOf(o: THREE.Object3D): THREE.Box3 { return new THREE.Box3().setFromObject(o, true); }

/** Copies position / normal / uv of a geometry into float32 attributes (quantised, normalised glTF data is int16). */
export function floatGeometry(g: THREE.BufferGeometry): void {
  for (const key of ['position', 'normal', 'uv']) {
    const a = g.getAttribute(key) as THREE.BufferAttribute | undefined;
    if (!a) continue;
    if (a.array instanceof Float32Array && !a.normalized && !(a as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) {
      out[i * a.itemSize] = a.getX(i);
      if (a.itemSize > 1) out[i * a.itemSize + 1] = a.getY(i);
      if (a.itemSize > 2) out[i * a.itemSize + 2] = a.getZ(i);
    }
    g.setAttribute(key, new THREE.BufferAttribute(out, a.itemSize));
  }
}

/** Non-indexed copy with position / normal / uv only, transformed by `m`. */
function slim(src: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src.clone();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  g.groups.length = 0;
  g.applyMatrix4(m);
  return g;
}

/** UV of the centre of the atlas cell that most of a geometry's triangle area samples (for the far-car tyres). */
export function dominantCellUv(g: THREE.BufferGeometry, cols = 8, rows = 4): THREE.Vector2 {
  const uv = g.getAttribute('uv'), pos = g.getAttribute('position');
  const out = new THREE.Vector2(0.5, 0.5);
  if (!uv || !pos) return out;
  const area = new Map<number, number>();
  const n = g.index ? g.index.count : pos.count;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t + 2 < n; t += 3) {
    const i = g.index ? g.index.getX(t) : t, j = g.index ? g.index.getX(t + 1) : t + 1, k = g.index ? g.index.getX(t + 2) : t + 2;
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, j); c.fromBufferAttribute(pos, k);
    const ar = b.sub(a).cross(c.sub(a)).length() / 2;
    const u = (uv.getX(i) + uv.getX(j) + uv.getX(k)) / 3, v = (uv.getY(i) + uv.getY(j) + uv.getY(k)) / 3;
    const key = Math.min(rows - 1, Math.max(0, Math.floor(v * rows))) * cols + Math.min(cols - 1, Math.max(0, Math.floor(u * cols)));
    area.set(key, (area.get(key) ?? 0) + ar);
  }
  let best = -1, bestA = -1;
  for (const [key, ar] of area) if (ar > bestA) { bestA = ar; best = key; }
  if (best < 0) return out;
  return out.set(((best % cols) + 0.5) / cols, (Math.floor(best / cols) + 0.5) / rows);
}

/** The far-car model CarLod draws instanced (see GltfVehicleSource.lodParts). All geometry is in car space, rest pose. */
export interface GltfLodParts {
  /** body + wheels (+ spare, door ...), position / normal / uv; recoloured per instance through the instance colour */
  body: THREE.BufferGeometry;
  material: PaletteCarPaint;
  head: THREE.BufferGeometry | null;
  tail: THREE.BufferGeometry | null;
  /** position + normal only: stand-in for the shadow pass and the AO G-buffer */
  hull: THREE.BufferGeometry;
}

export interface InstantiateContext {
  /** the game's material library: licence plates use its textured `plate` material */
  materials?: IMaterialLibrary;
  /** licence plate text variant 0..3 (default: a counter, so cars differ) */
  variant?: number;
}

export interface VehicleLoadOptions {
  /** palette atlas cell holding the body paint; null = never recolour textured paint. Default: KENNEY_PAINT_CELLS[type] */
  paintCell?: PaletteCell | null;
}

/** Cached, shared geometry of the synthesised parts of one fitted car size (car space). */
interface LampLayout {
  head?: THREE.BufferGeometry;
  tail?: THREE.BufferGeometry;
  plateFront?: THREE.BufferGeometry;
  plateRear?: THREE.BufferGeometry;
  roof?: THREE.Vector3 | null;
}

const _ray = new THREE.Raycaster();
interface Surface { point: THREE.Vector3; normal: THREE.Vector3 }

/** First body surface hit by a ray, with its outward-facing normal in world space (null if nothing is hit). */
function surfaceHit(targets: THREE.Object3D[], origin: THREE.Vector3, dir: THREE.Vector3): Surface | null {
  _ray.set(origin, dir);
  _ray.near = 0;
  _ray.far = 100;
  const hit = _ray.intersectObjects(targets, false)[0];
  if (!hit) return null;
  const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : dir.clone().negate();
  if (n.dot(dir) > 0) n.negate();
  return { point: hit.point.clone(), normal: n };
}

/** A w x h quad lying on a surface, facing along its normal, 1 cm proud so it does not z-fight. */
function quadOn(s: Surface, w: number, h: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const o = new THREE.Object3D();
  o.position.copy(s.point).addScaledVector(s.normal, 0.012);
  o.lookAt(o.position.clone().add(s.normal));
  o.updateMatrix();
  g.applyMatrix4(o.matrix);
  return g;
}

/** Module state: the loaded sources (CarLod asks for LOD parts by type) and the material library for plates. */
const loaded: Partial<Record<VehicleType, GltfVehicleSource>> = {};
let plateMaterials: IMaterialLibrary | null = null;
/** Called by CarLod: hands the game's material library to the glTF cars (licence plates). */
export function setGltfMaterials(m: IMaterialLibrary | null): void { plateMaterials = m; }
/** LOD parts of the loaded glTF car of this type, or null (no file, or a model that cannot be instanced). */
export function gltfLodFor(type: string): GltfLodParts | null {
  return loaded[type as VehicleType]?.lodParts() ?? null;
}

export class GltfVehicleSource {
  readonly ready = true;
  private readonly paint = new Map<string, THREE.Material>();
  private readonly cell: PaletteCell | null;
  private plateSeq = 0;
  private lod: GltfLodParts | null | undefined;
  private fallbackPlate: THREE.Material | null = null;
  /** synthesised light / plate / bar geometry per fitted size (the ray casts run once per size, not once per car) */
  private readonly layouts = new Map<string, LampLayout>();

  private constructor(private readonly type: VehicleType, private readonly scene: THREE.Object3D, opts: VehicleLoadOptions = {}) {
    this.cell = opts.paintCell !== undefined ? opts.paintCell : KENNEY_PAINT_CELLS[type] ?? null;
    scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      floatGeometry(m.geometry);
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        // flat-shaded palette textures read as plastic at roughness 1
        if (mat.name === KENNEY_MATERIAL && (mat as THREE.MeshStandardMaterial).roughness !== undefined) (mat as THREE.MeshStandardMaterial).roughness = 0.6;
      }
    });
  }

  static async load(url: string, type: VehicleType = 'sedan', opts: VehicleLoadOptions = {}): Promise<GltfVehicleSource> {
    const gltf = await createGltfLoader().loadAsync(url);
    return new GltfVehicleSource(type, gltf.scene, opts);
  }

  static async parse(data: ArrayBuffer, type: VehicleType = 'sedan', opts: VehicleLoadOptions = {}): Promise<GltfVehicleSource> {
    const gltf = await createGltfLoader().parseAsync(data, '');
    return new GltfVehicleSource(type, gltf.scene, opts);
  }

  static fromGltf(gltf: GLTF, type: VehicleType = 'sedan', opts: VehicleLoadOptions = {}): GltfVehicleSource {
    return new GltfVehicleSource(type, gltf.scene, opts);
  }

  /** Build one car. Geometry and non-light materials are shared between instances. */
  instantiate(spec: VehicleSpec, ctx: InstantiateContext = {}): CarModel {
    const content = cloneSkinned(this.scene);
    const group = new THREE.Group();
    group.name = `car:${spec.type}:gltf`;
    const fit = new THREE.Group();
    fit.name = 'fit';
    group.add(fit);
    fit.add(content);

    // 1. long axis -> z
    group.updateMatrixWorld(true);
    const raw = boxOf(content).getSize(new THREE.Vector3());
    let yaw = raw.x > raw.z * 1.05 ? Math.PI / 2 : 0;
    content.rotation.y = yaw;
    group.updateMatrixWorld(true);

    // 2. which end is the front? (z of lights / wheels relative to the centre; +z is the glTF default)
    const all = meshes(content);
    const lightsOf = (re: RegExp) => all.filter((m) => re.test(names(m)) || re.test(matName(m)));
    const heads = lightsOf(HEAD_RE);
    const tails = lightsOf(TAIL_RE);
    const wheelNodes = topmostByName(content, WHEEL_RE);
    const zOf = (o: THREE.Object3D) => boxOf(o).getCenter(new THREE.Vector3()).z;
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    let frontIsPlusZ = true;
    if (heads.length && tails.length) frontIsPlusZ = mean(heads.map(zOf)) > mean(tails.map(zOf));
    else if (heads.length) frontIsPlusZ = mean(heads.map(zOf)) > boxOf(content).getCenter(new THREE.Vector3()).z;
    else if (tails.length) frontIsPlusZ = mean(tails.map(zOf)) < boxOf(content).getCenter(new THREE.Vector3()).z;
    else {
      const namedFront = wheelNodes.filter((w) => FRONT_RE.test(names(w)));
      if (namedFront.length && namedFront.length < wheelNodes.length) {
        const rear = wheelNodes.filter((w) => !namedFront.includes(w));
        frontIsPlusZ = mean(namedFront.map(zOf)) > mean(rear.map(zOf));
      }
    }
    if (frontIsPlusZ) yaw += Math.PI; // game front is -z
    content.rotation.y = yaw;
    group.updateMatrixWorld(true);

    // 3. road wheels (bottom near the ground) and their pre-fit transforms
    const box = boxOf(content);
    const size = box.getSize(new THREE.Vector3());
    const wheelInfo = wheelNodes
      .map((node) => {
        const b = boxOf(node);
        node.updateWorldMatrix(true, false);
        return { node, centre: b.getCenter(new THREE.Vector3()), radius: (b.max.y - b.min.y) / 2, m0: node.matrixWorld.clone(), minY: b.min.y };
      })
      .filter((w) => w.minY < box.min.y + 0.12 * size.y);
    const roadNodes = new Set(wheelInfo.map((w) => w.node));
    const inRoadWheel = (o: THREE.Object3D): boolean => { for (let p: THREE.Object3D | null = o; p; p = p.parent) if (roadNodes.has(p)) return true; return false; };
    const bodyMeshes = all.filter((m) => !inRoadWheel(m));

    // 4. fit: per-axis scale to the spec box, centred, standing on the ground (wheels get the height factor, uniform)
    const s = new THREE.Vector3(
      size.x > 1e-6 ? spec.width / size.x : 1,
      size.y > 1e-6 ? spec.height / size.y : 1,
      size.z > 1e-6 ? spec.length / size.z : 1,
    );
    fit.scale.copy(s);
    fit.position.set(-((box.min.x + box.max.x) / 2) * s.x, -box.min.y * s.y, -((box.min.z + box.max.z) / 2) * s.z);
    group.updateMatrixWorld(true);

    const own: THREE.Material[] = [];
    const W = spec.width, H = spec.height, L = spec.length;
    const lampScale = Math.min(1.4, W / 1.8);

    // 5. lights with their own emissive materials: found by name, else synthesised on the body surface
    const emissiveClone = (m: THREE.Mesh, colour: number): THREE.Mesh | null => {
      const src = matOf(m);
      if (!src) return null;
      const c = src.clone() as THREE.MeshStandardMaterial;
      if (c.emissive === undefined) return null; // not a standard material: cannot glow
      if (c.emissive.getHex() === 0) c.emissive.setHex(colour);
      c.emissiveIntensity = 0;
      m.material = c;
      own.push(c);
      return m;
    };
    let headlights = heads.map((m) => emissiveClone(m, HEAD_EMISSIVE)).filter((m): m is THREE.Mesh => !!m);
    let taillights = tails.map((m) => emissiveClone(m, TAIL_EMISSIVE)).filter((m): m is THREE.Mesh => !!m);
    for (const m of headlights) m.name = 'headlight';
    for (const m of taillights) m.name = 'taillight';

    const targets = bodyMeshes.filter((m) => !headlights.includes(m) && !taillights.includes(m));
    const up = new THREE.Vector3(0, 1, 0);
    const cast = (x: number, yFrac: number, dirZ: 1 | -1): Surface | null => {
      const o = new THREE.Vector3(x, yFrac * H, dirZ > 0 ? -L : L);
      return surfaceHit(targets, o, new THREE.Vector3(0, 0, dirZ));
    };
    /** first candidate height whose hit faces mostly along the car axis; else any hit; else a bounding-box fallback */
    const endPoint = (x: number, ys: number[], dirZ: 1 | -1): Surface => {
      let any: Surface | null = null;
      for (const y of ys) {
        const h = cast(x, y, dirZ);
        if (!h) continue;
        if (Math.abs(h.normal.z) > 0.55) return h;
        any ??= h;
      }
      return any ?? { point: new THREE.Vector3(x, ys[0] * H, dirZ > 0 ? -L / 2 : L / 2), normal: new THREE.Vector3(0, 0, -dirZ) };
    };
    const lay: LampLayout = this.layouts.get(`${W}|${H}|${L}`) ?? {};
    this.layouts.set(`${W}|${H}|${L}`, lay);
    const synthLamp = (g: THREE.BufferGeometry, colour: number, base: number, name: string): THREE.Mesh => {
      const mat = new THREE.MeshStandardMaterial({ color: base, emissive: colour, emissiveIntensity: 0, roughness: 0.25, metalness: 0.1, side: THREE.DoubleSide });
      own.push(mat);
      const m = new THREE.Mesh(g, mat);
      m.name = name;
      group.add(m);
      return m;
    };
    if (!headlights.length) {
      lay.head ??= mergeGeometries([-0.32 * W, 0.32 * W].map((x) => quadOn(endPoint(x, [0.42, 0.5, 0.34, 0.58, 0.28], 1), 0.3 * lampScale, 0.13 * lampScale)), false)!; // ray travels +z: hits the front (-z) face
      headlights = [synthLamp(lay.head, HEAD_EMISSIVE, 0xffffff, 'headlight')];
    }
    if (!taillights.length) {
      lay.tail ??= mergeGeometries([-0.34 * W, 0.34 * W].map((x) => quadOn(endPoint(x, [0.5, 0.42, 0.58, 0.34, 0.66], -1), 0.26 * lampScale, 0.11 * lampScale)), false)!;
      taillights = [synthLamp(lay.tail, TAIL_EMISSIVE, 0x7a1010, 'taillight')];
    }

    // 6. licence plates
    const plates = ctx.materials ?? plateMaterials;
    const plateMat = plates ? plates.get('plate', ctx.variant ?? this.plateSeq++) : this.blankPlate();
    lay.plateFront ??= quadOn(endPoint(0, [0.26, 0.3, 0.22, 0.36], 1), 0.34, 0.17);
    lay.plateRear ??= quadOn(endPoint(0, [0.26, 0.3, 0.22, 0.36], -1), 0.34, 0.17);
    for (const [name, g] of [['plateFront', lay.plateFront], ['plateRear', lay.plateRear]] as const) {
      const m = new THREE.Mesh(g, plateMat);
      m.name = name;
      group.add(m);
    }

    // 7. cop light bar: found by name, else two boxes on the roof (red / blue halves)
    let lightbar: CarModel['lightbar'];
    if (spec.type === 'cop') {
      const bars = all.filter((m) => BAR_RE.test(names(m)) || BAR_RE.test(matName(m)));
      const red = bars.find((m) => /red/i.test(names(m)) || /red/i.test(matName(m)));
      const blue = bars.find((m) => /blue/i.test(names(m)) || /blue/i.test(matName(m)));
      if (red && blue) {
        const r = emissiveClone(red, 0xff0000);
        const b = emissiveClone(blue, 0x0033ff);
        if (r && b) lightbar = { red: r, blue: b };
      }
      if (!lightbar) {
        if (lay.roof === undefined) lay.roof = surfaceHit(targets, new THREE.Vector3(0, H + 1, -0.04 * L), up.clone().negate())?.point ?? null;
        const roof = lay.roof ? { point: lay.roof } : null;
        if (roof) {
          const bw = 0.27 * W, bd = 0.14, bh = 0.09;
          const half = (sign: 1 | -1, name: string): THREE.Mesh => {
            const mat = new THREE.MeshStandardMaterial({ color: 0x202020, emissive: 0x000000, emissiveIntensity: 0, roughness: 0.3 });
            own.push(mat);
            const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
            m.name = name;
            m.position.set(sign * (bw / 2 + 0.01), roof.point.y + bh / 2 - 0.01, roof.point.z);
            group.add(m);
            return m;
          };
          lightbar = { red: half(-1, 'lightbarA'), blue: half(1, 'lightbarB') };
        }
      }
    }

    // 8. paint
    const lit = new Set<THREE.Mesh>([...headlights, ...taillights, ...(lightbar ? [lightbar.red, lightbar.blue] : [])]);
    let paintMeshes = bodyMeshes.filter((m) => !lit.has(m) && PAINT_RE.test(matName(m)));
    if (!paintMeshes.length) {
      const biggest = largestWorldMesh(bodyMeshes.filter((m) => !lit.has(m)));
      paintMeshes = biggest ? [biggest] : [];
    }
    for (const m of paintMeshes) { this.paintMesh(m, spec.color); m.name = 'body'; }

    // 9. wheels: roll pivot (+ steer pivot on the front pair); the wheel keeps a uniform scale and moves to the fitted centre
    const info = wheelInfo.map((w) => ({ ...w, c: w.centre.clone().multiply(s).add(fit.position) }));
    let frontSet = info.filter((w) => FRONT_RE.test(names(w.node)));
    if (frontSet.length !== 2 && info.length >= 4) frontSet = [...info].sort((a, b) => a.c.z - b.c.z).slice(0, 2); // most forward = smallest z
    const wheels: THREE.Object3D[] = [];
    const steerPivots: THREE.Object3D[] = [];
    const sw = s.y;
    for (const w of info) {
      const roll = new THREE.Group();
      roll.name = `${names(w.node)}:roll`;
      const rel = new THREE.Matrix4().makeScale(sw, sw, sw)
        .multiply(new THREE.Matrix4().makeTranslation(-w.centre.x, -w.centre.y, -w.centre.z))
        .multiply(w.m0);
      roll.add(w.node); // leaves the fitted body
      rel.decompose(w.node.position, w.node.quaternion, w.node.scale);
      if (frontSet.includes(w)) {
        const steer = new THREE.Group();
        steer.name = `${names(w.node)}:steer`;
        steer.position.copy(w.c);
        steer.add(roll);
        group.add(steer);
        steerPivots.push(steer);
      } else {
        roll.position.copy(w.c);
        group.add(roll);
      }
      wheels.push(roll);
    }
    const wheelRadius = info.length ? mean(info.map((w) => w.radius * sw)) : 0.33;
    group.updateMatrixWorld(true);

    // 10. hood hinge at the cowl (rear edge of the hood, lowest point)
    let hood: THREE.Object3D | undefined;
    if (spec.type !== 'boxtruck') {
      const node = topmostByName(content, HOOD_RE)[0];
      if (node) {
        const b = boxOf(node);
        const pivot = new THREE.Group();
        pivot.name = 'hood:pivot';
        pivot.position.set((b.min.x + b.max.x) / 2, b.min.y, b.max.z);
        group.add(pivot);
        group.updateMatrixWorld(true);
        pivot.attach(node);
        hood = pivot;
      }
    }

    return { group, wheels, steerPivots, lightbar, headlights, taillights, hood, paintMeshes, wheelRadius, ownMaterials: own };
  }

  /**
   * The far-car model: body + wheels merged into one geometry (tyres as 10-gons), drawn with the palette paint material
   * and an instance colour, plus lamp geometry. Null when the car is not palette-painted (CarLod then keeps the full model).
   */
  lodParts(): GltfLodParts | null {
    if (this.lod !== undefined) return this.lod;
    this.lod = null;
    if (!this.cell) return null;
    const spec = { ...VEHICLE_SPECS[this.type], color: '#ffffff' };
    const model = this.instantiate(spec, { variant: 0 });
    const body = model.paintMeshes[0];
    const src = body ? matOf(body) : null;
    if (!body || !src || !(src as THREE.MeshStandardMaterial).map) { for (const m of model.ownMaterials) m.dispose(); return null; }
    model.group.updateMatrixWorld(true);
    const wheelMeshes = new Set<THREE.Mesh>();
    for (const w of model.wheels) w.traverse((o) => { if ((o as THREE.Mesh).isMesh) wheelMeshes.add(o as THREE.Mesh); });
    const skip = new Set<THREE.Object3D>([...model.headlights, ...model.taillights, ...(model.lightbar ? [model.lightbar.red, model.lightbar.blue] : [])]);
    const parts: THREE.BufferGeometry[] = [];
    model.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || skip.has(m) || wheelMeshes.has(m) || /^plate/.test(m.name)) return;
      parts.push(slim(m.geometry, m.matrixWorld));
    });
    const tmp = new THREE.Box3();
    for (const roll of model.wheels) {
      const mesh = [...wheelMeshes].find((m) => { for (let p: THREE.Object3D | null = m; p; p = p.parent) if (p === roll) return true; return false; });
      if (!mesh) continue;
      tmp.setFromObject(roll, true);
      const sz = tmp.getSize(new THREE.Vector3()), c = tmp.getCenter(new THREE.Vector3());
      const r = Math.max(sz.y, sz.z) / 2;
      const g = new THREE.CylinderGeometry(r, r, sz.x, 10, 1).toNonIndexed();
      g.rotateZ(Math.PI / 2);
      g.translate(c.x, c.y, c.z);
      const uv = dominantCellUv(mesh.geometry, this.cell.cols ?? 8, this.cell.rows ?? 4);
      const arr = new Float32Array(g.getAttribute('position').count * 2);
      for (let i = 0; i < arr.length; i += 2) { arr[i] = uv.x; arr[i + 1] = uv.y; }
      g.setAttribute('uv', new THREE.BufferAttribute(arr, 2));
      parts.push(g);
    }
    const lamps = (list: THREE.Mesh[]): THREE.BufferGeometry | null => {
      const gs = list.map((m) => slim(m.geometry, m.matrixWorld));
      return gs.length ? mergeGeometries(gs, false) : null;
    };
    const merged = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    const head = lamps(model.headlights), tail = lamps(model.taillights);
    for (const m of model.ownMaterials) m.dispose();
    if (!merged) return null;
    const hull = new THREE.BufferGeometry();
    hull.setAttribute('position', merged.getAttribute('position'));
    hull.setAttribute('normal', merged.getAttribute('normal'));
    const material = new PaletteCarPaint().copy(src).setCell(this.cell).setPaint('#ffffff');
    this.lod = { body: merged, material, head, tail, hull };
    return this.lod;
  }

  /** Dispose the shared tinted paint materials. */
  dispose(): void {
    for (const m of this.paint.values()) m.dispose();
    this.paint.clear();
    this.fallbackPlate?.dispose();
    this.fallbackPlate = null;
    for (const l of this.layouts.values()) { l.head?.dispose(); l.tail?.dispose(); l.plateFront?.dispose(); l.plateRear?.dispose(); }
    this.layouts.clear();
    if (this.lod) { this.lod.body.dispose(); this.lod.hull.dispose(); this.lod.head?.dispose(); this.lod.tail?.dispose(); this.lod.material.dispose(); }
    this.lod = undefined;
  }

  private blankPlate(): THREE.Material {
    return this.fallbackPlate ??= new THREE.MeshStandardMaterial({ color: 0xe9e6da, roughness: 0.5, metalness: 0.2, name: 'plate-blank' });
  }

  /** Recolour one paint mesh to `colour` (shared material per source and colour). */
  private paintMesh(mesh: THREE.Mesh, colour: string): void {
    const src = matOf(mesh) as THREE.MeshStandardMaterial | null;
    if (!src || src.color === undefined) return;
    const key = `${src.uuid}|${colour}`;
    let m = this.paint.get(key);
    if (!m) {
      if (src.map) {
        // palette texture: recolour the paint cell only (only for the known Kenney atlas, or when a cell was given)
        if (!this.cell || (src.name !== KENNEY_MATERIAL && !this.explicitCell())) return;
        m = new PaletteCarPaint().copy(src).setCell(this.cell).setPaint(colour);
      } else {
        m = src.clone();
        (m as THREE.MeshStandardMaterial).color.set(colour);
      }
      this.paint.set(key, m);
    }
    mesh.material = m;
  }

  private explicitCell(): boolean { return this.cell !== KENNEY_PAINT_CELLS[this.type]; }
}

/** The mesh with the largest world-space bounding-box volume. */
function largestWorldMesh(list: THREE.Mesh[]): THREE.Mesh | null {
  let best: THREE.Mesh | null = null;
  let bestV = -1;
  const s = new THREE.Vector3();
  for (const m of list) {
    boxOf(m).getSize(s);
    const v = s.x * s.y * s.z;
    if (v > bestV) { bestV = v; best = m; }
  }
  return best;
}

export type VehicleSources = Partial<Record<VehicleType, GltfVehicleSource>>;

/**
 * The CC0 Kenney vehicle files are OPT-IN (`VITE_GLTF_CARS=1`): the procedural lofted bodies in carModel.ts / carBodies.ts are the
 * default (GTA3-era proportions, licence ours). Without the flag the glob is dead code, so the .glb files are not bundled at all.
 */
const VEHICLE_FILES = (import.meta.env?.VITE_GLTF_CARS === '1'
  ? import.meta.glob('@/assets/models/vehicle-{sedan,suv,boxtruck,cop}.glb', { eager: true, query: '?url', import: 'default' })
  : {}) as Record<string, string>;

/** Load every bundled vehicle-<type>.glb. Types without a file (or whose file fails to load) are simply absent. */
export async function resolveVehicleSources(): Promise<VehicleSources> {
  const out: VehicleSources = {};
  await Promise.all(Object.entries(VEHICLE_FILES).map(async ([path, url]) => {
    const type = /vehicle-(sedan|suv|boxtruck|cop)\.glb$/.exec(path)?.[1] as VehicleType | undefined;
    if (!type) return;
    try {
      out[type] = await GltfVehicleSource.load(url, type);
      loaded[type] = out[type];
    } catch (err) {
      warnOnce(`vehicle-${type}`, `[gltf] could not load vehicle-${type}.glb, using the procedural car`, err);
    }
  }));
  return out;
}
