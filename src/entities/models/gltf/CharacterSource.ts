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

/** Pick idle / walk / run clips by name (case-insensitive). One lone clip is treated as the walk cycle. */
export function pickClips(animations: readonly THREE.AnimationClip[]): Record<ClipName, THREE.AnimationClip | null> {
  const out: Record<ClipName, THREE.AnimationClip | null> = { idle: null, walk: null, run: null };
  if (animations.length === 1) { out.walk = animations[0]; return out; }
  for (const c of animations) {
    if (!out.idle && /idle/i.test(c.name)) out.idle = c;
    else if (!out.run && /run|jog/i.test(c.name)) out.run = c;
    else if (!out.walk && /walk/i.test(c.name)) out.walk = c;
  }
  return out;
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
  private readonly bodyGeometry: THREE.BufferGeometry | null;
  private readonly tinted = new Map<number, THREE.Material | THREE.Material[]>();

  private constructor(gltf: GLTF, opts: GltfCharacterOptions) {
    this.height = opts.height ?? 1.75;
    this.scene = gltf.scene;
    this.clips = pickClips(gltf.animations);

    // measure the bind pose (skinned meshes are measured through their skeleton by Box3.setFromObject)
    this.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.scene, true);
    const size = box.getSize(new THREE.Vector3());
    this.scale = size.y > 1e-6 ? this.height / size.y : 1;
    // feet on y = 0, centred over the origin (all in the unscaled model space)
    this.offset.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);

    this.bodyGeometry = largestMesh(this.scene)?.geometry ?? null;
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
    for (const m of this.tinted.values()) for (const x of Array.isArray(m) ? m : [m]) x.dispose();
    this.tinted.clear();
  }

  private applyVariant(model: THREE.Object3D, variant: number): void {
    if (!this.bodyGeometry) return;
    const v = ((Math.trunc(variant) % CLOTH_TINTS.length) + CLOTH_TINTS.length) % CLOTH_TINTS.length;
    let mat = this.tinted.get(v);
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.geometry !== this.bodyGeometry) return;
      if (!mat) {
        const tint = new THREE.Color(CLOTH_TINTS[v]);
        const tintOne = (m: THREE.Material): THREE.Material => {
          const c = m.clone();
          (c as THREE.MeshStandardMaterial).color?.multiply(tint);
          return c;
        };
        mat = Array.isArray(mesh.material) ? mesh.material.map(tintOne) : tintOne(mesh.material);
        this.tinted.set(v, mat);
      }
      mesh.material = mat;
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
