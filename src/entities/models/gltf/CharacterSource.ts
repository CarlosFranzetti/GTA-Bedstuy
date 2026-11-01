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
import type { Rng } from '@/core/Rng';
import type { CharacterRig, CharacterSource, IMaterialLibrary } from '@/world/types';
import { animateWalk, buildHumanModel } from '@/entities/models/humanModel';
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

  instantiate(variant: number): CharacterRig {
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
    const model = buildHumanModel(this.materials, this.rng, { shirt: ((Math.trunc(variant) % 12) + 12) % 12 });
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

const CHARACTER_FILES = import.meta.glob('@/assets/models/character*.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** The bundled character*.glb if there is one and it loads, else the procedural people. */
export async function resolveCharacterSource(materials: IMaterialLibrary, rng: Rng): Promise<CharacterSource> {
  const url = firstUrl(CHARACTER_FILES);
  if (!url) return new ProceduralCharacterSource(materials, rng);
  try {
    return await GltfCharacterSource.load(url);
  } catch (err) {
    warnOnce('character-load', '[gltf] could not load the character model, using procedural people', err);
    return new ProceduralCharacterSource(materials, rng);
  }
}
