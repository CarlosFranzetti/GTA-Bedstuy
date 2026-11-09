/**
 * Character sources: a skinned, animated glTF humanoid (src/assets/models/character*.glb) or the procedural
 * low-poly person as a fallback. Both hand out `CharacterRig`s (see world/types.ts).
 *
 * glTF rigs share geometry, skeleton bind data and animation clips through SkeletonUtils.clone; only the node
 * tree, the AnimationMixer and the actions are per instance. Cloth variants share eight tinted material clones.
 *
 * Orientation: glTF faces +z, the game faces -z, so the model sits inside a `flip` node rotated 180 degrees about y.
 * `rig.group` is an outer wrapper the owner can freely position / rotate (heading) / tip over (setDown).
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Rng } from '@/core/Rng';
import type { CharacterRig, CharacterSource, IMaterialLibrary } from '@/world/types';
import { animateWalk } from '@/entities/models/humanModel';
import { buildPedModel, CIVILIAN_COUNT } from '@/entities/models/pedBody';
import { createGltfLoader, firstUrl, warnOnce, type GLTF } from './loader';

export type { CharacterRig, CharacterSource };

export const WALK_THRESHOLD = 0.3;
export const RUN_THRESHOLD = 4.5;
const FADE = 0.2;
/** Ground speed at which the authored walk / run clips look right (used to scale clip playback). */
const WALK_REF_SPEED = 1.4;
const RUN_REF_SPEED = 5.5;

/** Eight cloth tints multiplied onto the base colour of the body material. */
export const CLOTH_TINTS: readonly number[] = [
  0xffffff, 0xd9534f, 0x4f8fd9, 0x59b86b, 0xe6c04a, 0x8e6bbf, 0x3d4a5c, 0xe08a3c,
];

type ClipName = 'idle' | 'walk' | 'run';

/** Clip name without an armature prefix ("CharacterArmature|Idle" -> "Idle") and without a "Man_" style rig prefix. */
export function baseClipName(name: string): string {
  return name.replace(/^.*[|/]/, '').replace(/^(man|woman|male|female|char|character)[_\s-]+/i, '');
}

const OTHER_ACTION_RE = /jump|slash|punch|kick|death|die|hit|roll|sit|shoot|gun|sword|wave|clap|interact|back|left|right|dance|spawn/i;

/**
 * Pick idle / walk / run clips by name (case-insensitive). An exact (prefix-stripped) match wins ("Run" over "RunningJump");
 * otherwise the first clip containing the word that is not obviously another action. One lone clip is the walk cycle.
 */
export function pickClips(animations: readonly THREE.AnimationClip[]): Record<ClipName, THREE.AnimationClip | null> {
  const out: Record<ClipName, THREE.AnimationClip | null> = { idle: null, walk: null, run: null };
  if (animations.length === 1) { out.walk = animations[0]; return out; }
  const find = (exact: RegExp, loose: RegExp): THREE.AnimationClip | null =>
    animations.find((c) => exact.test(baseClipName(c.name)))
    ?? animations.find((c) => loose.test(baseClipName(c.name)) && !OTHER_ACTION_RE.test(baseClipName(c.name).replace(loose, '')))
    ?? null;
  out.idle = find(/^idle$/i, /idle/i) ?? animations.find((c) => /^(idle_?neutral|standing|stand)$/i.test(baseClipName(c.name))) ?? null;
  out.run = find(/^(run|jog|sprint)$/i, /run|jog|sprint/i);
  out.walk = find(/^walk$/i, /walk/i);
  return out;
}

/** Weapon / prop nodes of rigged packs (the Quaternius adventurers carry a sword) that a pedestrian should not hold. */
const PROP_RE = /^(sword|weapon|pistol|gun|rifle|dagger|shield|axe|bow)\b/i;
/** Materials that are clearly not clothes (never tinted when a mesh has several). */
const NOT_CLOTH_RE = /skin|hair|eye|eyebrow|eyelash|teeth|mouth|face|sock|shoe|boot|feet|metal|gold|silver|glass|belt/i;
const SHIRT_RE = /shirt|top|cloth|hood|jacket|torso|coat|tee|sweat|jersey|uniform/i;

/** Which materials of a mesh are "clothes" (tinted per variant): shirt-like names, else everything that is not skin / hair / metal. */
export function clothMaterials(materials: readonly THREE.Material[]): Set<THREE.Material> {
  if (materials.length === 1) return new Set(materials);
  const shirts = materials.filter((m) => SHIRT_RE.test(m.name));
  if (shirts.length) return new Set(shirts);
  const rest = materials.filter((m) => !NOT_CLOTH_RE.test(m.name));
  return new Set(rest);
}

/** Multiplies `tint` onto a cloth colour; dark cloth (which multiplication would barely change) takes the tint instead. */
export function tintCloth(base: THREE.Color, tint: THREE.Color): THREE.Color {
  const l = 0.2126 * base.r + 0.7152 * base.g + 0.0722 * base.b;
  if (tint.r > 0.999 && tint.g > 0.999 && tint.b > 0.999) return base; // variant 0 keeps the authored colour
  if (l < 0.3) return base.copy(tint).multiplyScalar(0.55);
  return base.multiply(tint);
}

// ---------------------------------------------------------------- glTF

export interface GltfCharacterOptions {
  /** standing height in metres (default 1.75) */
  height?: number;
}

export class GltfCharacterSource implements CharacterSource {
  readonly ready = true;
  readonly height: number;
  private readonly scene: THREE.Object3D;
  private readonly clips: Record<ClipName, THREE.AnimationClip | null>;
  private readonly scale: number;
  private readonly offset = new THREE.Vector3();
  private readonly tinted = new Map<string, THREE.Material>();
  private readonly cloth: Set<THREE.Material>;
  /** Other people (casual, suit, worker ...) this source also hands out; see `variantCount`. */
  private alternates: GltfCharacterSource[] = [];

  private constructor(gltf: GLTF, opts: GltfCharacterOptions) {
    this.height = opts.height ?? 1.75;
    this.scene = gltf.scene;
    this.clips = pickClips(gltf.animations);
    const props: THREE.Object3D[] = [];
    this.scene.traverse((o) => { if (PROP_RE.test(o.name) && !(o as THREE.Bone).isBone) props.push(o); });
    for (const o of props) o.removeFromParent();

    // measure the bind pose (skinned meshes are measured through their skeleton by Box3.setFromObject)
    this.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.scene, true);
    const size = box.getSize(new THREE.Vector3());
    this.scale = size.y > 1e-6 ? this.height / size.y : 1;
    // feet on y = 0, centred over the origin (all in the unscaled model space)
    this.offset.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);

    const all = new Set<THREE.Material>();
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) for (const x of Array.isArray(m.material) ? m.material : [m.material]) all.add(x); });
    this.cloth = clothMaterials([...all]);
    mergeSkinnedMeshes(this.scene, this.cloth);
    // skinned bounds come from the bind pose and would cull animated limbs
    this.scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false; });
  }

  /** Load a .glb / .gltf from a URL. */
  static async load(url: string, opts: GltfCharacterOptions = {}): Promise<GltfCharacterSource> {
    const gltf = await createGltfLoader().loadAsync(url);
    return new GltfCharacterSource(gltf, opts);
  }

  /** Parse an in-memory GLB (tests, or bytes you fetched yourself). */
  static async parse(data: ArrayBuffer, opts: GltfCharacterOptions = {}, path = ''): Promise<GltfCharacterSource> {
    const gltf = await createGltfLoader().parseAsync(data, path);
    return new GltfCharacterSource(gltf, opts);
  }

  /** Wrap an already parsed glTF. */
  static fromGltf(gltf: GLTF, opts: GltfCharacterOptions = {}): GltfCharacterSource {
    return new GltfCharacterSource(gltf, opts);
  }

  /** Add other character models to this source (same orientation / clip rules; each is measured to its own height). */
  withAlternates(others: readonly GltfCharacterSource[]): this {
    this.alternates = others.filter((o) => o !== this);
    return this;
  }

  /** Number of distinct (model, cloth tint) variants: 8 tints per model. `instantiate(0)` is always this source's own model. */
  get variantCount(): number { return CLOTH_TINTS.length * (1 + this.alternates.length); }

  /** Variant = model * 8 + tint; model 0 is this source, 1.. are the alternates (so `instantiate(0..7)` is always the primary person). */
  instantiate(variant: number): CharacterRig {
    const v = Math.max(0, Math.trunc(variant));
    const model = Math.floor(v / CLOTH_TINTS.length) % (1 + this.alternates.length);
    if (model > 0) return this.alternates[model - 1].instantiateOwn(v % CLOTH_TINTS.length);
    return this.instantiateOwn(v);
  }

  private instantiateOwn(variant: number): CharacterRig {
    const model = cloneSkinned(this.scene);
    model.position.add(this.offset);
    this.applyVariant(model, variant);

    const flip = new THREE.Group();
    flip.name = 'gltfFlip';
    flip.rotation.y = Math.PI; // glTF forward +z -> game forward -z
    flip.scale.setScalar(this.scale);
    flip.add(model);
    const group = new THREE.Group();
    group.name = 'character';
    group.add(flip);

    return new GltfCharacterRig(group, model, this.clips, this.height);
  }

  /** Dispose the shared tinted materials (call when the source is discarded). */
  dispose(): void {
    for (const m of this.tinted.values()) m.dispose();
    this.tinted.clear();
    for (const a of this.alternates) a.dispose();
  }

  /**
   * Tints the cloth materials. glTF loading splits a multi-material mesh into one mesh per material, so cloth is decided per
   * material (see clothMaterials), over the whole model; skin, hair and eyes keep the shared source materials.
   */
  private applyVariant(model: THREE.Object3D, variant: number): void {
    if (!this.cloth.size) return;
    const v = ((Math.trunc(variant) % CLOTH_TINTS.length) + CLOTH_TINTS.length) % CLOTH_TINTS.length;
    const tint = new THREE.Color(CLOTH_TINTS[v]);
    const tintOne = (m: THREE.Material): THREE.Material => {
      if (!this.cloth.has(m)) return m;
      const key = `${v}|${m.uuid}`;
      let c = this.tinted.get(key);
      if (!c) {
        c = m.clone();
        const col = (c as THREE.MeshStandardMaterial).color;
        if (col) tintCloth(col, tint);
        this.tinted.set(key, c);
      }
      return c;
    };
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(tintOne) : tintOne(mesh.material);
    });
  }
}

/** Float32 position / normal, Uint16 skin indices, Float32 weights, 32-bit index: the common shape for merging. */
function uniformSkinGeometry(g: THREE.BufferGeometry, colour: THREE.Color | null): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const f = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, size: number, Ctor: typeof Float32Array | typeof Uint16Array): THREE.BufferAttribute => {
    const arr = new Ctor(a.count * size);
    for (let i = 0; i < a.count; i++) {
      arr[i * size] = a.getX(i);
      if (size > 1) arr[i * size + 1] = a.getY(i);
      if (size > 2) arr[i * size + 2] = a.getZ(i);
      if (size > 3) arr[i * size + 3] = a.getW(i);
    }
    return new THREE.BufferAttribute(arr, size);
  };
  const pos = g.getAttribute('position');
  out.setAttribute('position', f(pos, 3, Float32Array));
  const nor = g.getAttribute('normal');
  if (nor) out.setAttribute('normal', f(nor, 3, Float32Array));
  out.setAttribute('skinIndex', f(g.getAttribute('skinIndex'), 4, Uint16Array));
  out.setAttribute('skinWeight', f(g.getAttribute('skinWeight'), 4, Float32Array));
  if (colour) {
    const c = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { c[i * 3] = colour.r; c[i * 3 + 1] = colour.g; c[i * 3 + 2] = colour.b; }
    out.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  const idx = g.index ? Uint32Array.from(g.index.array as ArrayLike<number>) : Uint32Array.from({ length: pos.count }, (_, i) => i);
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/**
 * glTF loading splits a multi-material mesh into one SkinnedMesh per material (6 for the worker, 14 for the adventurer), and
 * every one is a draw call in the colour pass and again in each shadow cascade. Untextured meshes that share a skeleton and a
 * transform are merged into one mesh per cloth material (so the tint still reaches the shirt) plus ONE mesh for everything else,
 * with the material colours baked into vertex colours. Textured meshes are left alone.
 */
export function mergeSkinnedMeshes(scene: THREE.Object3D, cloth: ReadonlySet<THREE.Material>): void {
  scene.updateMatrixWorld(true);
  const groups = new Map<string, THREE.SkinnedMesh[]>();
  scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh || Array.isArray(m.material)) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat.map || mat.normalMap || mat.vertexColors || mat.transparent || mat.color === undefined) return;
    if (!m.geometry.getAttribute('skinIndex') || !m.geometry.getAttribute('skinWeight') || !m.geometry.getAttribute('position')) return;
    const key = `${m.skeleton.bones.map((b) => b.uuid).join(',')}|${m.skeleton.boneInverses.map((i) => i.elements.map((x) => x.toFixed(3)).join(',')).join(';')}|${m.bindMatrix.elements.map((x) => x.toFixed(4)).join(',')}|${m.matrixWorld.elements.map((x) => x.toFixed(4)).join(',')}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
  });
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const bySlot = new Map<THREE.Material | 'rest', THREE.SkinnedMesh[]>();
    for (const m of list) {
      const slot = cloth.has(m.material as THREE.Material) ? (m.material as THREE.Material) : 'rest';
      (bySlot.get(slot) ?? bySlot.set(slot, []).get(slot)!).push(m);
    }
    for (const [slot, ms] of bySlot) {
      if (ms.length < 2 && slot !== 'rest') continue;
      if (ms.length < 2) continue;
      const first = ms[0];
      const geoms = ms.map((m) => uniformSkinGeometry(m.geometry, slot === 'rest' ? (m.material as THREE.MeshStandardMaterial).color : null));
      const merged = mergeGeometries(geoms, false);
      for (const g of geoms) g.dispose();
      if (!merged) continue;
      if (slot === 'rest') {
        const rough = ms.reduce((a, m) => a + (m.material as THREE.MeshStandardMaterial).roughness, 0) / ms.length;
        first.material = new THREE.MeshStandardMaterial({ name: 'character-rest', vertexColors: true, roughness: rough, metalness: 0 });
      }
      first.geometry = merged;
      first.name = slot === 'rest' ? 'character-rest' : `character-${(slot as THREE.Material).name || 'cloth'}`;
      for (const m of ms) if (m !== first) m.removeFromParent();
    }
  }
}

/** Largest mesh by geometry bounding-box volume. */
export function largestMesh(root: THREE.Object3D): THREE.Mesh | null {
  let best: THREE.Mesh | null = null;
  let bestV = -1;
  const s = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    m.geometry.boundingBox!.getSize(s);
    const vol = s.x * s.y * s.z;
    if (vol > bestV) { bestV = vol; best = m; }
  });
  return best;
}

class GltfCharacterRig implements CharacterRig {
  readonly mixer: THREE.AnimationMixer;
  readonly clips: Record<ClipName, THREE.AnimationAction | null> = { idle: null, walk: null, run: null };
  private active: THREE.AnimationAction | null = null;
  private speed = 0;
  private down = false;

  constructor(
    readonly group: THREE.Group,
    private readonly root: THREE.Object3D,
    clips: Record<ClipName, THREE.AnimationClip | null>,
    readonly height: number,
  ) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const k of ['idle', 'walk', 'run'] as const) {
      const clip = clips[k];
      if (clip) this.clips[k] = this.mixer.clipAction(clip);
    }
    this.apply(true);
    this.mixer.update(0); // pose the skeleton right away (no bind-pose flash)
  }

  setSpeed(mps: number): void {
    this.speed = Math.max(0, mps);
    this.apply(false);
  }

  update(dt: number): void {
    if (this.down) return;
    this.mixer.update(dt);
  }

  setDown(down: boolean): void {
    if (down === this.down) return;
    this.down = down;
    this.mixer.timeScale = down ? 0 : 1;
    // same pose as the procedural pedestrian: on the back, head toward +z
    this.group.rotation.x = down ? Math.PI / 2 : 0;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.group.parent?.remove(this.group);
    this.active = null;
  }

  /** Choose the action for the current speed (falling back to what the file has) and crossfade to it. */
  private apply(instant: boolean): void {
    const c = this.clips;
    const sp = this.speed;
    const want: ClipName = sp > RUN_THRESHOLD ? 'run' : sp > WALK_THRESHOLD ? 'walk' : 'idle';
    const target = want === 'run' ? (c.run ?? c.walk ?? c.idle)
      : want === 'walk' ? (c.walk ?? c.run ?? c.idle)
        : (c.idle ?? c.walk ?? c.run);
    if (!target) return;
    // standing still without an idle clip: hold the first frame of the walk instead of snapping to the T pose
    const hold = want === 'idle' && !c.idle;
    if (target !== this.active) {
      const prev = this.active;
      target.reset();
      target.enabled = true;
      target.setEffectiveWeight(1);
      target.paused = false;
      target.play();
      if (prev) {
        if (instant) prev.stop();
        else prev.crossFadeTo(target, FADE, false);
      }
      this.active = target;
    }
    target.paused = hold;
    // match clip playback speed to ground speed so the feet do not slide
    if (target === c.walk) target.setEffectiveTimeScale(THREE.MathUtils.clamp(sp / WALK_REF_SPEED, 0.6, 1.8));
    else if (target === c.run) target.setEffectiveTimeScale(THREE.MathUtils.clamp(sp / RUN_REF_SPEED, 0.7, 1.6));
  }
}

// ---------------------------------------------------------------- procedural fallback

/** The procedural low-poly person behind the same interface. */
export class ProceduralCharacterSource implements CharacterSource {
  readonly ready = true;
  constructor(private readonly materials: IMaterialLibrary, private readonly rng: Rng) {}

  instantiate(variant: number): CharacterRig {
    const model = buildPedModel(this.materials, this.rng, { variant: ((Math.trunc(variant) % CIVILIAN_COUNT) + CIVILIAN_COUNT) % CIVILIAN_COUNT });
    const group = model.group;
    const height = 1.75 * group.scale.y;
    let phase = 0;
    let amp = 0;
    let speed = 0;
    let down = false;
    return {
      group,
      clips: { idle: null, walk: null, run: null },
      height,
      setSpeed(mps: number) { speed = Math.max(0, mps); },
      update(dt: number) {
        if (down) return;
        const moving = speed > WALK_THRESHOLD;
        if (moving) phase += dt * speed * 3.2;
        const target = moving ? THREE.MathUtils.clamp(speed / WALK_REF_SPEED, 0.6, 1.6) : 0;
        amp += (target - amp) * Math.min(1, dt * 10);
        if (amp < 0.01) amp = 0;
        animateWalk(model, phase, amp);
      },
      setDown(d: boolean) {
        down = d;
        group.rotation.x = d ? Math.PI / 2 : 0;
      },
      dispose() { group.parent?.remove(group); },
    };
  }
}

// ---------------------------------------------------------------- resolution

/**
 * The Quaternius glTF people are OPT-IN (`VITE_GLTF_PEDS=1`): the procedural GTA3-style people in pedBody.ts are the default
 * (our own painted atlases, our licence). Without the flag the glob is dead code, so the .glb files are not bundled at all.
 */
const CHARACTER_FILES = (import.meta.env?.VITE_GLTF_PEDS === '1'
  ? import.meta.glob('@/assets/models/character*.glb', { eager: true, query: '?url', import: 'default' })
  : {}) as Record<string, string>;

/** `character.glb` if present (the plain, modern person), else the first character*.glb by name. */
export function preferredCharacterUrl(files: Record<string, string>): string | null {
  const exact = Object.keys(files).find((k) => /(^|\/)character\.glb$/.test(k));
  return exact ? files[exact] : firstUrl(files);
}

/** Every character*.glb url except the preferred one, sorted by file name (so the order, and the pick per ped, is stable). */
export function alternateCharacterUrls(files: Record<string, string>): string[] {
  const main = preferredCharacterUrl(files);
  return Object.keys(files).sort().map((k) => files[k]).filter((u) => u !== main);
}

/**
 * The bundled character*.glb files if there are any and the first loads, else the procedural people. The preferred file is the
 * primary (the player, `instantiate(0)`); the others are alternates that pedestrians pick from. A broken alternate is skipped
 * with one warning.
 */
export async function resolveCharacterSource(materials: IMaterialLibrary, rng: Rng): Promise<CharacterSource> {
  const url = preferredCharacterUrl(CHARACTER_FILES);
  if (!url) return new ProceduralCharacterSource(materials, rng);
  try {
    const primary = await GltfCharacterSource.load(url);
    const alts = await Promise.all(alternateCharacterUrls(CHARACTER_FILES).map(async (u) => {
      try { return await GltfCharacterSource.load(u); } catch (err) { warnOnce(`character-alt-${u}`, '[gltf] could not load an extra character model, skipping it', err); return null; }
    }));
    return primary.withAlternates(alts.filter((a): a is GltfCharacterSource => a !== null));
  } catch (err) {
    warnOnce('character-load', '[gltf] could not load the character model, using procedural people', err);
    return new ProceduralCharacterSource(materials, rng);
  }
}
