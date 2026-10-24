/**
 * Procedural pedestrian / player model, ~1.75 m tall, local forward = -z.
 *
 * Hierarchy (all pivots rotate about x for the walk cycle):
 *   group
 *    └ rig (bob)
 *       ├ hips mesh
 *       ├ torso pivot (twist)  ── torso mesh, neck+head pivot, hair/cap, shoulder pivots (arm → elbow → forearm/hand), backpack
 *       └ hip pivots (legL / legR) → thigh mesh → knee pivot → shin + shoe
 *
 * Geometries are shared by every human (module cache). Meshes are merged per pivot per material to
 * keep the draw-call count per person low (~16-20).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Rng } from '@/core/Rng';
import type { IMaterialLibrary } from '@/world/types';

export interface HumanModel {
  group: THREE.Group;
  /** hip pivots [left, right]; .rotation.x swings the leg */
  legs: THREE.Object3D[];
  /** shoulder pivots [left, right] */
  arms: THREE.Object3D[];
  head: THREE.Object3D;
  /** child pivots, same order as legs / arms */
  knees: THREE.Object3D[];
  elbows: THREE.Object3D[];
  /** upper body pivot (twists while walking) */
  torso: THREE.Object3D;
  /** whole-body bob node */
  rig: THREE.Object3D;
}

export interface HumanOptions {
  /** cloth variant for the top (player = 0, red) */
  shirt?: number;
  skin?: number;
  pants?: number;
  outfit?: 'tee' | 'hoodie';
  hat?: 'none' | 'cap' | 'hair';
  accessory?: 'none' | 'backpack' | 'bag';
  /** uniform scale of the whole figure (default: random 0.96..1.04) */
  heightScale?: number;
}

// ---------------------------------------------------------------- shared geometry

const HIP_Y = 0.9;
const THIGH = 0.43;
const SHIN = 0.38;
const LEG = HIP_Y;
const KNEE_Y = HIP_Y - THIGH;
const SHOULDER_Y = 0.54; // relative to torso pivot (at HIP_Y + 0.02)
const UPPER_ARM = 0.28;
const FOREARM = 0.26;

function ni(g: THREE.BufferGeometry): THREE.BufferGeometry { return g.index ? g.toNonIndexed() : g; }
function mergeAll(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(gs.map(ni), false);
  if (!m) throw new Error('humanModel: merge failed');
  return m;
}
function box(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

/** Box tapered in x (wider at the top) and slightly in z. */
function taper(wTop: number, wBot: number, h: number, dTop: number, dBot: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, h, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 0;
    p.setX(i, p.getX(i) * (top ? wTop : wBot));
    p.setZ(i, p.getZ(i) * (top ? dTop : dBot));
  }
  g.computeVertexNormals();
  return g;
}

interface Shared {
  hips: THREE.BufferGeometry;
  torsoTee: THREE.BufferGeometry;
  torsoHoodie: THREE.BufferGeometry;
  hoodieExtras: THREE.BufferGeometry; // hem + hood + pocket, jacket cloth
  head: THREE.BufferGeometry;         // head + neck (skin)
  hair: THREE.BufferGeometry;
  cap: THREE.BufferGeometry;
  thigh: THREE.BufferGeometry;
  shin: THREE.BufferGeometry;
  shoe: THREE.BufferGeometry;
  upperArm: THREE.BufferGeometry;
  foreSleeve: THREE.BufferGeometry;
  foreSkin: THREE.BufferGeometry;     // bare forearm + hand
  hand: THREE.BufferGeometry;
  backpack: THREE.BufferGeometry;
  bag: THREE.BufferGeometry;
}

let shared: Shared | null = null;

function sharedGeos(): Shared {
  if (shared) return shared;
  const headSphere = new THREE.SphereGeometry(0.1, 14, 10).scale(0.95, 1.1, 1.02).translate(0, 0.0, 0);
  const nose = box(0.03, 0.04, 0.03, 0, -0.01, -0.105);
  const neck = new THREE.CylinderGeometry(0.045, 0.05, 0.1, 8).translate(0, -0.11, 0);
  const ears = mergeAll([box(0.02, 0.05, 0.03, -0.1, 0, 0), box(0.02, 0.05, 0.03, 0.1, 0, 0)]);
  shared = {
    hips: box(0.33, 0.17, 0.2, 0, 0.0, 0),
    torsoTee: taper(0.4, 0.31, 0.56, 0.22, 0.2).translate(0, 0.27, 0),
    torsoHoodie: taper(0.43, 0.38, 0.56, 0.25, 0.24).translate(0, 0.27, 0),
    hoodieExtras: mergeAll([
      box(0.4, 0.07, 0.25, 0, 0.0, 0),                       // hem
      box(0.26, 0.1, 0.12, 0, 0.55, 0.1),                    // hood bunched at the neck
      box(0.22, 0.1, 0.03, 0, 0.12, -0.125),                 // kangaroo pocket
    ]),
    head: mergeAll([headSphere, nose, neck, ears]),
    hair: new THREE.SphereGeometry(0.108, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.97, 1.04, 1.06).translate(0, 0.004, 0.01),
    cap: mergeAll([
      new THREE.SphereGeometry(0.114, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.97, 1.02, 1.05).translate(0, 0.01, 0.005),
      box(0.17, 0.012, 0.11, 0, 0.03, -0.14),
    ]),
    thigh: box(0.15, THIGH, 0.17, 0, -THIGH / 2, 0),
    shin: box(0.125, SHIN, 0.14, 0, -SHIN / 2, 0.0),
    shoe: box(0.125, 0.09, 0.27, 0, -(KNEE_Y - 0.045), -0.06),
    upperArm: box(0.09, UPPER_ARM, 0.1, 0, -UPPER_ARM / 2 + 0.03, 0),
    foreSleeve: box(0.08, FOREARM, 0.09, 0, -FOREARM / 2, 0),
    foreSkin: mergeAll([box(0.07, FOREARM, 0.08, 0, -FOREARM / 2, 0), box(0.075, 0.09, 0.09, 0, -FOREARM - 0.03, 0)]),
    hand: box(0.075, 0.09, 0.09, 0, -FOREARM - 0.03, 0),
    backpack: mergeAll([box(0.3, 0.38, 0.14, 0, 0.3, 0.2), box(0.05, 0.3, 0.02, -0.12, 0.34, -0.12), box(0.05, 0.3, 0.02, 0.12, 0.34, -0.12)]),
    bag: box(0.2, 0.26, 0.1, 0, -FOREARM - 0.2, -0.02),
  };
  return shared;
}

// ---------------------------------------------------------------- builder

const PANTS_VARIANTS = [1, 8, 10, 1, 8, 5, 2];
const SHOE_VARIANTS = [1, 5, 10, 8];
const BAG_VARIANTS = [3, 0, 6, 4, 11, 7];

export function buildHumanModel(materials: IMaterialLibrary, rng: Rng, opts: HumanOptions = {}): HumanModel {
  const S = sharedGeos();
  const shirtV = opts.shirt ?? rng.int(0, 11);
  const skinV = opts.skin ?? rng.int(0, 5);
  const pantsV = opts.pants ?? rng.pick(PANTS_VARIANTS);
  const outfit = opts.outfit ?? (rng.chance(0.45) ? 'hoodie' : 'tee');
  const hat = opts.hat ?? (rng.chance(0.25) ? 'cap' : rng.chance(0.8) ? 'hair' : 'none');
  const accessory = opts.accessory ?? (rng.chance(0.22) ? 'backpack' : rng.chance(0.18) ? 'bag' : 'none');

  const shirt = materials.get('cloth', shirtV);
  const skin = materials.get('skin', skinV);
  const pants = materials.get('cloth', pantsV);
  const shoes = materials.get('cloth', rng.pick(SHOE_VARIANTS));
  const hairMat = materials.get('cloth', rng.chance(0.7) ? 1 : 10);
  const capMat = materials.get('cloth', rng.int(0, 11));

  const group = new THREE.Group();
  group.name = 'human';
  group.scale.setScalar(opts.heightScale ?? rng.range(0.96, 1.04));
  const rig = new THREE.Group();
  rig.name = 'rig';
  group.add(rig);

  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, name = ''): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    if (name) m.name = name;
    parent.add(m);
    return m;
  };

  // hips
  const hips = mesh(S.hips, pants, rig, 'hips');
  hips.position.y = HIP_Y + 0.03;

  // torso pivot
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = HIP_Y + 0.02;
  rig.add(torso);
  mesh(outfit === 'hoodie' ? S.torsoHoodie : S.torsoTee, shirt, torso, 'chest');
  if (outfit === 'hoodie') mesh(S.hoodieExtras, shirt, torso, 'hoodie');

  // head (+ neck) and headwear
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.64;
  rig.add(head);
  mesh(S.head, skin, head, 'skull');
  if (hat === 'cap') mesh(S.cap, capMat, head, 'cap');
  else if (hat === 'hair') mesh(S.hair, hairMat, head, 'hair');

  if (accessory === 'backpack') mesh(S.backpack, materials.get('cloth', rng.pick(BAG_VARIANTS)), torso, 'backpack');

  // arms
  const legs: THREE.Object3D[] = [];
  const knees: THREE.Object3D[] = [];
  const arms: THREE.Object3D[] = [];
  const elbows: THREE.Object3D[] = [];
  const bagSide = rng.chance(0.5) ? 1 : -1;
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group();
    arm.name = sx < 0 ? 'armL' : 'armR';
    arm.position.set(sx * 0.255, SHOULDER_Y, 0);
    torso.add(arm);
    mesh(S.upperArm, shirt, arm, 'upperArm');
    const elbow = new THREE.Group();
    elbow.name = 'elbow';
    elbow.position.y = -UPPER_ARM + 0.03;
    arm.add(elbow);
    if (outfit === 'hoodie') {
      mesh(S.foreSleeve, shirt, elbow, 'sleeve');
      mesh(S.hand, skin, elbow, 'hand');
    } else {
      mesh(S.foreSkin, skin, elbow, 'forearm');
    }
    if (accessory === 'bag' && sx === bagSide) mesh(S.bag, materials.get('cloth', rng.pick(BAG_VARIANTS)), elbow, 'bag');
    arms.push(arm);
    elbows.push(elbow);

    // legs
    const leg = new THREE.Group();
    leg.name = sx < 0 ? 'legL' : 'legR';
    leg.position.set(sx * 0.095, HIP_Y, 0);
    rig.add(leg);
    mesh(S.thigh, pants, leg, 'thigh');
    const knee = new THREE.Group();
    knee.name = 'knee';
    knee.position.y = -THIGH;
    leg.add(knee);
    mesh(S.shin, pants, knee, 'shin');
    mesh(S.shoe, shoes, knee, 'shoe');
    legs.push(leg);
    knees.push(knee);
  }

  return { group, legs, arms, head, knees, elbows, torso, rig };
}

/**
 * Pose the walk cycle. `phase` in radians (advance it with speed), `amplitude` ~0..1 (0 = standing,
 * 1 = brisk walk; > 1 reads as running). Legs swing at the hip with a knee bend on the forward swing, arms
 * counter-swing with a soft elbow, torso bobs and twists slightly.
 */
export function animateWalk(model: HumanModel, phase: number, amplitude: number): void {
  const a = amplitude;
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const swing = 0.42 * a;
  // left leg forward when s > 0
  model.legs[0].rotation.x = s * swing;
  model.legs[1].rotation.x = -s * swing;
  // knee flexes while the leg swings forward (cos > 0 for the left, < 0 for the right)
  model.knees[0].rotation.x = -(Math.max(0, c) + 0.05) * a;
  model.knees[1].rotation.x = -(Math.max(0, -c) + 0.05) * a;
  // arms oppose the legs
  model.arms[0].rotation.x = -s * swing * 0.9;
  model.arms[1].rotation.x = s * swing * 0.9;
  model.elbows[0].rotation.x = (0.25 + Math.max(0, s) * 0.35) * a;
  model.elbows[1].rotation.x = (0.25 + Math.max(0, -s) * 0.35) * a;
  // slight twist against the hips, forward lean, and the hips dip as the legs spread (keeps the feet planted)
  model.torso.rotation.y = -s * 0.1 * a;
  model.torso.rotation.x = -0.04 * a;
  model.rig.position.y = -LEG * (1 - Math.cos(swing * s));
}
