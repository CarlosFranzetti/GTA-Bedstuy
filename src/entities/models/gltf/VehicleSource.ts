/**
 * glTF vehicle bodies (src/assets/models/vehicle-{sedan,suv,boxtruck,cop}.glb) in the `CarModel` shape that
 * Vehicle drives, so a file simply replaces buildCarModel for that type.
 *
 * Conventions applied to every instance:
 *  - the model is turned so its long axis is z and its front points to -z (decided from head/tail lights or
 *    front/rear wheels; glTF +z forward is assumed when nothing tells otherwise),
 *  - uniformly scaled so the length equals spec.length, centred on x/z, wheels resting on y = 0,
 *  - nodes named /wheel/i are wrapped in a roll pivot (rotate .x to spin); the two front ones are also wrapped in
 *    a steer pivot (rotate .y),
 *  - meshes named /head.*(light|lamp)/ and /tail.*(light|lamp)/ get their own emissive material clone
 *    (Vehicle drives emissiveIntensity), cop light-bar meshes (name or material contains bar / siren and red / blue) become the lightbar,
 *  - paint meshes = material name /paint|body/ (else the largest mesh); their material is tinted to spec.color
 *    unless it is textured.
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { VehicleSpec, VehicleType } from '@/world/types';
import type { CarModel } from '@/entities/models/carModel';
import { createGltfLoader, warnOnce, type GLTF } from './loader';
import { largestMesh } from './CharacterSource';

const HEAD_RE = /head[\s._-]*(light|lamp)/i;
const TAIL_RE = /tail[\s._-]*(light|lamp)|brake[\s._-]*light/i;
const WHEEL_RE = /wheel/i;
const FRONT_RE = /front|(^|[^a-z])f[lr]?([^a-z]|$)/i;
const PAINT_RE = /paint|body/i;
const HOOD_RE = /hood|bonnet/i;
const BAR_RE = /light[\s._-]*bar|siren|beacon|bar/i;

const HEAD_EMISSIVE = 0xfff2cc;
const TAIL_EMISSIVE = 0xff1a1a;

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

export class GltfVehicleSource {
  readonly ready = true;
  private readonly paint = new Map<string, THREE.Material>();

  private constructor(private readonly type: VehicleType, private readonly scene: THREE.Object3D) {
    scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false; });
  }

  static async load(url: string, type: VehicleType = 'sedan'): Promise<GltfVehicleSource> {
    const gltf = await createGltfLoader().loadAsync(url);
    return new GltfVehicleSource(type, gltf.scene);
  }

  static async parse(data: ArrayBuffer, type: VehicleType = 'sedan'): Promise<GltfVehicleSource> {
    const gltf = await createGltfLoader().parseAsync(data, '');
    return new GltfVehicleSource(type, gltf.scene);
  }

  static fromGltf(gltf: GLTF, type: VehicleType = 'sedan'): GltfVehicleSource {
    return new GltfVehicleSource(type, gltf.scene);
  }

  /** Build one car. Geometry and non-light materials are shared between instances. */
  instantiate(spec: VehicleSpec): CarModel {
    const content = cloneSkinned(this.scene);
    const group = new THREE.Group();
    group.name = `car:${spec.type}:gltf`;
    group.add(content);

    // 1. long axis -> z
    content.updateMatrixWorld(true);
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
    content.updateMatrixWorld(true);

    // 3. scale to spec.length, centre on x/z, wheels on the ground
    const box = boxOf(content);
    const size = box.getSize(new THREE.Vector3());
    const s = size.z > 1e-6 ? spec.length / size.z : 1;
    content.scale.setScalar(s);
    content.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
    group.updateMatrixWorld(true);

    const own: THREE.Material[] = [];

    // 4. lights with their own emissive materials
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
    const headlights = heads.map((m) => emissiveClone(m, HEAD_EMISSIVE)).filter((m): m is THREE.Mesh => !!m);
    const taillights = tails.map((m) => emissiveClone(m, TAIL_EMISSIVE)).filter((m): m is THREE.Mesh => !!m);

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
    }

    // 5. paint
    const lit = new Set<THREE.Mesh>([...headlights, ...taillights, ...(lightbar ? [lightbar.red, lightbar.blue] : [])]);
    let paintMeshes = all.filter((m) => !lit.has(m) && PAINT_RE.test(matName(m)));
    if (!paintMeshes.length) {
      const biggest = largestMesh(content);
      if (biggest) paintMeshes = [biggest];
    } else {
      for (const m of paintMeshes) this.tintPaint(m, spec.color);
    }

    // 6. wheels: roll pivot (+ steer pivot on the front pair)
    const wheelInfo = wheelNodes.map((node) => {
      const b = boxOf(node);
      return { node, centre: b.getCenter(new THREE.Vector3()), radius: (b.max.y - b.min.y) / 2 };
    });
    let frontSet = wheelInfo.filter((w) => FRONT_RE.test(names(w.node)));
    if (frontSet.length !== 2 && wheelInfo.length >= 4) {
      frontSet = [...wheelInfo].sort((a, b) => a.centre.z - b.centre.z).slice(0, 2); // most forward = smallest z
    }
    const wheels: THREE.Object3D[] = [];
    const steerPivots: THREE.Object3D[] = [];
    for (const w of wheelInfo) {
      const front = frontSet.includes(w);
      const roll = new THREE.Group();
      roll.name = `${names(w.node)}:roll`;
      if (front) {
        const steer = new THREE.Group();
        steer.name = `${names(w.node)}:steer`;
        steer.position.copy(w.centre);
        steer.add(roll);
        group.add(steer);
        group.updateMatrixWorld(true);
        steerPivots.push(steer);
      } else {
        roll.position.copy(w.centre);
        group.add(roll);
      }
      group.updateMatrixWorld(true);
      roll.attach(w.node); // keeps the world transform
      wheels.push(roll);
    }
    const wheelRadius = wheelInfo.length ? mean(wheelInfo.map((w) => w.radius)) : 0.33;

    // 7. hood hinge at the cowl (rear edge of the hood, lowest point)
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

  /** Dispose the shared tinted paint materials. */
  dispose(): void {
    for (const m of this.paint.values()) m.dispose();
    this.paint.clear();
  }

  private tintPaint(mesh: THREE.Mesh, colour: string): void {
    const src = matOf(mesh) as THREE.MeshStandardMaterial | null;
    if (!src || src.map || src.color === undefined) return;
    const key = `${src.uuid}|${colour}`;
    let m = this.paint.get(key);
    if (!m) {
      m = src.clone();
      (m as THREE.MeshStandardMaterial).color.set(colour);
      this.paint.set(key, m);
    }
    mesh.material = m;
  }
}

export type VehicleSources = Partial<Record<VehicleType, GltfVehicleSource>>;

const VEHICLE_FILES = import.meta.glob('@/assets/models/vehicle-{sedan,suv,boxtruck,cop}.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Load every bundled vehicle-<type>.glb. Types without a file (or whose file fails to load) are simply absent. */
export async function resolveVehicleSources(): Promise<VehicleSources> {
  const out: VehicleSources = {};
  await Promise.all(Object.entries(VEHICLE_FILES).map(async ([path, url]) => {
    const type = /vehicle-(sedan|suv|boxtruck|cop)\.glb$/.exec(path)?.[1] as VehicleType | undefined;
    if (!type) return;
    try {
      out[type] = await GltfVehicleSource.load(url, type);
    } catch (err) {
      warnOnce(`vehicle-${type}`, `[gltf] could not load vehicle-${type}.glb, using the procedural car`, err);
    }
  }));
  return out;
}
