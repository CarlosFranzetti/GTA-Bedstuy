/**
 * Procedural pedestrian / player model, a 1.75 m 7.5-head figure, local forward = -z.
 *
 * Hierarchy (all pivots rotate about x for the walk cycle):
 *   group
 *    └ rig (bob, sway)
 *       ├ hips mesh (pelvis loft, twists against the torso)
 *       ├ torso pivot  ── lofted chest/waist/hip ring stack, jacket extras, backpack, shoulder pivots
 *       │                  (arm → elbow → forearm / handL|handR), shoulders are wider than the hips
 *       ├ head pivot   ── skull + jaw + neck, hair / cap / durag / afro / braids
 *       └ hip pivots (legL / legR) → thigh mesh → knee pivot → shin (+ cuff) + shoe + sole
 *
 * Geometries are shared by every human (module cache) and smooth-shaded. Meshes are merged per pivot per
 * material to keep the draw-call count per person at ~18-22.
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
  /** pelvis (twists against the torso while walking) */
  hips: THREE.Object3D;
}

export interface HumanOptions {
  /** cloth variant for the top (player = 0, red) */
  shirt?: number;
  skin?: number;
  pants?: number;
  outfit?: 'tee' | 'hoodie';
  hat?: 'none' | 'cap' | 'hair' | 'afro' | 'braids' | 'durag';
  accessory?: 'none' | 'backpack' | 'bag';
  /** uniform scale of the whole figure (default: random 0.96..1.04) */
  heightScale?: number;
}

// ---------------------------------------------------------------- proportions (metres, 1.75 m total)

const HIP_Y = 0.9;
const THIGH = 0.44;
const SHIN = 0.39;
const LEG = HIP_Y;
const KNEE_Y = HIP_Y - THIGH;       // 0.46
const ANKLE = KNEE_Y - SHIN;        // 0.07
const TORSO_Y = HIP_Y + 0.02;       // torso pivot (world)
const SHOULDER_Y = 0.49;            // relative to the torso pivot -> 1.41 m
const SHOULDER_X = 0.215;
const UPPER_ARM = 0.3;
const FOREARM = 0.25;
const HEAD_Y = 1.61;                // head centre

type P2 = [number, number];

function ni(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  return n;
}
function mergeAll(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(gs.map(ni), false);
  if (!m) throw new Error('humanModel: merge failed');
  return m;
}
function box(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}
function ellipsoid(rx: number, ry: number, rz: number, x = 0, y = 0, z = 0, seg = 12): THREE.BufferGeometry {
  return new THREE.SphereGeometry(1, seg, Math.max(6, seg - 4)).scale(rx, ry, rz).translate(x, y, z);
}

/** Mirror across x = 0 (winding fixed). */
function mirrorX(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g.clone();
  for (const name of Object.keys(n.attributes)) {
    const a = n.attributes[name] as THREE.BufferAttribute;
    const arr = a.array as Float32Array;
    const s = a.itemSize;
    if (name === 'position' || name === 'normal') for (let i = 0; i < a.count; i++) arr[i * s] = -arr[i * s];
    for (let t = 0; t < a.count; t += 3) {
      for (let k = 0; k < s; k++) {
        const tmp = arr[(t + 1) * s + k];
        arr[(t + 1) * s + k] = arr[(t + 2) * s + k];
        arr[(t + 2) * s + k] = tmp;
      }
    }
  }
  return n;
}

interface Ring { y: number; rx: number; rz: number; zc?: number; xc?: number; }

/** Lofted stack of elliptical rings (smooth-shaded, closed at both ends). */
function loft(rings: Ring[], seg = 16): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const r of rings) {
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      pos.push((r.xc ?? 0) + r.rx * Math.cos(a), r.y, (r.zc ?? 0) + r.rz * Math.sin(a));
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      const a = i * seg + k;
      const b = i * seg + k1;
      const c = (i + 1) * seg + k;
      const d = (i + 1) * seg + k1;
      idx.push(a, d, b, a, c, d);
    }
  }
  // end caps
  for (const [ri, flip] of [[0, true], [rings.length - 1, false]] as const) {
    const ci = pos.length / 3;
    const r = rings[ri];
    pos.push(r.xc ?? 0, r.y, r.zc ?? 0);
    for (let k = 0; k < seg; k++) {
      const a = ri * seg + k;
      const b = ri * seg + ((k + 1) % seg);
      if (flip) idx.push(ci, a, b); else idx.push(ci, b, a);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Tapered capsule hanging from y = 0 down to y = -len (lathe; `stops` are [radius, depth below the top]). */
function limb(stops: P2[], zScale = 1): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const last = stops[stops.length - 1];
  const first = stops[0];
  // bottom cap, bottom -> top
  pts.push(new THREE.Vector2(0.001, -last[1] - last[0] * 0.9));
  pts.push(new THREE.Vector2(last[0] * 0.55, -last[1] - last[0] * 0.75));
  pts.push(new THREE.Vector2(last[0] * 0.88, -last[1] - last[0] * 0.38));
  for (let i = stops.length - 1; i >= 0; i--) pts.push(new THREE.Vector2(stops[i][0], -stops[i][1]));
  pts.push(new THREE.Vector2(first[0] * 0.85, first[0] * 0.42));
  pts.push(new THREE.Vector2(first[0] * 0.5, first[0] * 0.75));
  pts.push(new THREE.Vector2(0.001, first[0] * 0.9));
  const g = new THREE.LatheGeometry(pts, 12);
  if (zScale !== 1) g.scale(1, 1, zScale);
  return g;
}

// ---------------------------------------------------------------- shared geometry

interface Shared {
  hips: THREE.BufferGeometry;
  torsoTee: THREE.BufferGeometry;
  torsoHoodie: THREE.BufferGeometry;
  hoodieExtras: THREE.BufferGeometry; // hem + hood + collar + pocket, jacket cloth
  head: THREE.BufferGeometry;         // skull + jaw + neck + ears (skin)
  hair: THREE.BufferGeometry;
  afro: THREE.BufferGeometry;
  braids: THREE.BufferGeometry;
  durag: THREE.BufferGeometry;
  cap: THREE.BufferGeometry;
  thigh: THREE.BufferGeometry;
  shin: THREE.BufferGeometry;         // pants shin with cuff
  shoe: THREE.BufferGeometry;
  sole: THREE.BufferGeometry;
  upperSleeve: THREE.BufferGeometry;  // hoodie: full sleeve
  shortSleeve: THREE.BufferGeometry;  // tee: short sleeve
  upperSkin: THREE.BufferGeometry;    // tee: bare upper arm
  foreSleeve: THREE.BufferGeometry;
  foreSkin: THREE.BufferGeometry;
  handR: THREE.BufferGeometry;
  handL: THREE.BufferGeometry;
  backpack: THREE.BufferGeometry;
  bag: THREE.BufferGeometry;
}

let shared: Shared | null = null;

function torsoLoft(k: number, kz: number, hem: number): THREE.BufferGeometry {
  return loft([
    { y: -0.07, rx: 0.165 * k, rz: 0.105 * kz },
    { y: 0.0, rx: 0.17 * k, rz: 0.108 * kz },
    { y: 0.13, rx: (0.145 + hem) * k, rz: (0.096 + hem * 0.5) * kz },
    { y: 0.26, rx: 0.16 * k, rz: 0.108 * kz, zc: -0.004 },
    { y: 0.36, rx: 0.18 * k, rz: 0.118 * kz, zc: -0.008 },
    { y: 0.45, rx: 0.2 * k, rz: 0.105 * kz },
    { y: 0.5, rx: 0.205 * k, rz: 0.088 * kz },
    { y: 0.535, rx: 0.12 * k, rz: 0.07 * kz },
    { y: 0.56, rx: 0.055, rz: 0.055 },
    { y: 0.58, rx: 0.05, rz: 0.05 },
  ], 18);
}

function sharedGeos(): Shared {
  if (shared) return shared;

  const ear = (s: number): THREE.BufferGeometry => ellipsoid(0.012, 0.03, 0.02, s * 0.079, -0.005, 0.01, 8);
  const head = mergeAll([
    ellipsoid(0.078, 0.113, 0.097, 0, 0, 0, 16),                // skull, slightly elongated
    ellipsoid(0.062, 0.05, 0.078, 0, -0.07, -0.022, 12),        // jaw / chin
    box(0.026, 0.04, 0.03, 0, -0.025, -0.097),                  // nose
    ear(-1), ear(1),
    new THREE.CylinderGeometry(0.043, 0.05, 0.12, 10).translate(0, -0.14, 0.005), // neck
  ]);

  const capBase = (ry: number, k: number) => new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.56).scale(0.085 * k, ry, 0.105 * k).translate(0, 0.005, 0.01);

  const braids = (): THREE.BufferGeometry => {
    const parts: THREE.BufferGeometry[] = [capBase(0.12, 1.0)];
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.28 + (i / 8) * 1.44); // spread around the back half of the head
      const px = Math.sin(a) * 0.082;
      const pz = Math.cos(a) * 0.1 + 0.015;
      const c = new THREE.CylinderGeometry(0.009, 0.007, 0.24, 5).translate(0, -0.12, 0);
      c.rotateX(Math.cos(a) * 0.12);
      c.translate(px, -0.005, pz);
      parts.push(c);
    }
    return mergeAll(parts);
  };

  shared = {
    hips: loft([
      { y: -0.2, rx: 0.1, rz: 0.08 },
      { y: -0.12, rx: 0.17, rz: 0.1 },
      { y: -0.04, rx: 0.18, rz: 0.108 },
      { y: 0.05, rx: 0.172, rz: 0.104 },
      { y: 0.09, rx: 0.166, rz: 0.1 },
    ], 16),
    torsoTee: torsoLoft(1, 1, 0),
    torsoHoodie: torsoLoft(1.1, 1.14, 0.02),
    hoodieExtras: mergeAll([
      loft([{ y: -0.085, rx: 0.19, rz: 0.125 }, { y: -0.03, rx: 0.188, rz: 0.123 }], 18),      // hem band
      ellipsoid(0.115, 0.065, 0.085, 0, 0.525, 0.07, 12),                                       // hood bunched behind the neck
      new THREE.TorusGeometry(0.075, 0.022, 6, 16).rotateX(Math.PI / 2).translate(0, 0.54, -0.005), // collar
      box(0.24, 0.1, 0.03, 0, 0.08, -0.135),                                                     // kangaroo pocket
      box(0.012, 0.3, 0.01, 0, 0.3, -0.148),                                                     // zip line
    ]),
    head,
    hair: new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.087, 0.125, 0.108).translate(0, 0.004, 0.012),
    afro: mergeAll([
      ellipsoid(0.125, 0.115, 0.13, 0, 0.035, 0.015, 14),
      ellipsoid(0.07, 0.07, 0.07, -0.09, 0.0, 0.0, 8),
      ellipsoid(0.07, 0.07, 0.07, 0.09, 0.0, 0.0, 8),
      ellipsoid(0.075, 0.07, 0.075, 0, 0.0, 0.1, 8),
      ellipsoid(0.065, 0.065, 0.065, -0.06, 0.1, 0.03, 8),
      ellipsoid(0.065, 0.065, 0.065, 0.06, 0.1, 0.03, 8),
    ]),
    braids: braids(),
    durag: mergeAll([
      capBase(0.122, 1.03),
      ellipsoid(0.03, 0.03, 0.03, 0, -0.02, 0.105, 8),
      box(0.03, 0.2, 0.012, -0.015, -0.12, 0.115).rotateX(0.1),
      box(0.03, 0.18, 0.012, 0.018, -0.11, 0.118).rotateX(0.14),
    ]),
    cap: mergeAll([
      new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52).scale(0.092, 0.122, 0.112).translate(0, 0.012, 0.008),
      new THREE.CylinderGeometry(0.1, 0.1, 0.014, 14, 1, false, -Math.PI * 0.5, Math.PI).scale(1, 1, 1.25).rotateY(Math.PI).translate(0, 0.03, -0.1),
    ]),
    // thigh: wide at the hip, tapering to the knee
    thigh: limb([[0.083, 0], [0.081, 0.12], [0.068, 0.3], [0.056, THIGH - 0.02]], 0.95),
    // shin: calf bulge, ankle, trouser cuff
    shin: mergeAll([
      limb([[0.056, 0], [0.058, 0.09], [0.05, 0.25], [0.045, SHIN - 0.06]], 0.95).translate(0, -KNEE_Y + KNEE_Y, 0),
      loft([{ y: -SHIN + 0.055, rx: 0.052, rz: 0.052 }, { y: -SHIN + 0.0, rx: 0.056, rz: 0.058 }], 12),
    ]),
    shoe: mergeAll([
      ellipsoid(0.05, 0.043, 0.135, 0, -(KNEE_Y - 0.062), -0.065, 12),
      ellipsoid(0.044, 0.05, 0.06, 0, -(KNEE_Y - 0.075), 0.03, 10),
    ]),
    sole: box(0.108, 0.026, 0.29, 0, -(KNEE_Y - 0.013), -0.062),
    upperSleeve: limb([[0.054, 0], [0.052, 0.12], [0.048, UPPER_ARM]], 1),
    shortSleeve: limb([[0.058, 0], [0.059, 0.08], [0.056, 0.13]], 1),
    upperSkin: limb([[0.044, 0], [0.042, 0.15], [0.038, UPPER_ARM]], 1),
    foreSleeve: mergeAll([
      limb([[0.046, 0], [0.043, 0.12], [0.04, FOREARM - 0.02]], 1),
      loft([{ y: -FOREARM + 0.03, rx: 0.04, rz: 0.04 }, { y: -FOREARM + 0.0, rx: 0.044, rz: 0.044 }], 10),
    ]),
    foreSkin: limb([[0.04, 0], [0.036, 0.12], [0.03, FOREARM - 0.01]], 1),
    handR: handGeo(),
    handL: mirrorX(handGeo()),
    backpack: mergeAll([
      box(0.3, 0.4, 0.13, 0, 0.3, 0.19),
      box(0.22, 0.2, 0.06, 0, 0.2, 0.28),
      ellipsoid(0.15, 0.05, 0.07, 0, 0.5, 0.19, 8),
      box(0.045, 0.34, 0.02, -0.11, 0.33, -0.1),
      box(0.045, 0.34, 0.02, 0.11, 0.33, -0.1),
      box(0.045, 0.02, 0.28, -0.11, 0.5, 0.05),
      box(0.045, 0.02, 0.28, 0.11, 0.5, 0.05),
    ]),
    bag: mergeAll([
      box(0.2, 0.24, 0.09, 0, -FOREARM - 0.2, -0.02),
      new THREE.TorusGeometry(0.05, 0.007, 5, 12, Math.PI).translate(0, -FOREARM - 0.08, -0.02),
    ]),
  };
  return shared;
}

/** Right hand hanging below the wrist (y = 0): palm, fingers and a thumb on the inside (-x). */
function handGeo(): THREE.BufferGeometry {
  return mergeAll([
    box(0.038, 0.09, 0.085, 0, -0.05, 0),
    box(0.032, 0.075, 0.08, 0, -0.125, -0.008).rotateX(0),
    box(0.022, 0.06, 0.03, -0.028, -0.075, -0.045),
  ]);
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
  const hat = opts.hat ?? (rng.chance(0.2)
    ? 'cap'
    : rng.chance(0.15) ? 'afro' : rng.chance(0.1) ? 'braids' : rng.chance(0.08) ? 'durag' : rng.chance(0.85) ? 'hair' : 'none');
  const accessory = opts.accessory ?? (rng.chance(0.22) ? 'backpack' : rng.chance(0.18) ? 'bag' : 'none');

  // Fabric textures (R5): hoodies get heathered fleece, most pants denim, most shoes sneakers.
  // An explicitly requested shirt/pants variant (the player) keeps the flat cloth colour.
  const shirt = outfit === 'hoodie' && opts.shirt === undefined ? materials.get('clothHoodie', rng.int(0, 7)) : materials.get('cloth', shirtV);
  const skin = materials.get('skin', skinV);
  const pants = opts.pants === undefined && rng.chance(0.6) ? materials.get('clothDenim', rng.int(0, 5)) : materials.get('cloth', pantsV);
  const shoes = rng.chance(0.7) ? materials.get('clothSneaker', rng.int(0, 5)) : materials.get('cloth', rng.pick(SHOE_VARIANTS));
  const soleMat = materials.get('tire');
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

  // hips (pelvis in trousers)
  const hips = mesh(S.hips, pants, rig, 'hips');
  hips.position.y = HIP_Y;

  // torso pivot
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = TORSO_Y;
  rig.add(torso);
  mesh(outfit === 'hoodie' ? S.torsoHoodie : S.torsoTee, shirt, torso, 'chest');
  if (outfit === 'hoodie') mesh(S.hoodieExtras, shirt, torso, 'hoodie');

  // head (+ jaw, neck) and headwear
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = HEAD_Y;
  rig.add(head);
  mesh(S.head, skin, head, 'skull');
  if (hat === 'cap') mesh(S.cap, capMat, head, 'cap');
  else if (hat === 'hair') mesh(S.hair, hairMat, head, 'hair');
  else if (hat === 'afro') mesh(S.afro, hairMat, head, 'afro');
  else if (hat === 'braids') mesh(S.braids, hairMat, head, 'braids');
  else if (hat === 'durag') mesh(S.durag, capMat, head, 'durag');

  if (accessory === 'backpack') mesh(S.backpack, materials.get('cloth', rng.pick(BAG_VARIANTS)), torso, 'backpack');

  const legs: THREE.Object3D[] = [];
  const knees: THREE.Object3D[] = [];
  const arms: THREE.Object3D[] = [];
  const elbows: THREE.Object3D[] = [];
  const bagSide = rng.chance(0.5) ? 1 : -1;
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'L' : 'R';
    // arm: shoulder -> upper arm -> elbow -> forearm -> hand
    const arm = new THREE.Group();
    arm.name = `arm${side}`;
    arm.position.set(sx * SHOULDER_X, SHOULDER_Y, 0);
    torso.add(arm);
    const elbow = new THREE.Group();
    elbow.name = 'elbow';
    elbow.position.y = -UPPER_ARM;
    arm.add(elbow);
    if (outfit === 'hoodie') {
      mesh(S.upperSleeve, shirt, arm, 'upperArm');
      mesh(S.foreSleeve, shirt, elbow, 'sleeve');
    } else {
      mesh(S.upperSkin, skin, arm, 'upperArm');
      mesh(S.shortSleeve, shirt, arm, 'sleeve');
      mesh(S.foreSkin, skin, elbow, 'forearm');
    }
    const hand = mesh(sx < 0 ? S.handL : S.handR, skin, elbow, `hand${side}`);
    hand.position.y = -FOREARM;
    if (accessory === 'bag' && sx === bagSide) mesh(S.bag, materials.get('cloth', rng.pick(BAG_VARIANTS)), elbow, 'bag');
    arms.push(arm);
    elbows.push(elbow);

    // leg: hip -> thigh -> knee -> shin + shoe
    const leg = new THREE.Group();
    leg.name = `leg${side}`;
    leg.position.set(sx * 0.095, HIP_Y, 0);
    rig.add(leg);
    mesh(S.thigh, pants, leg, 'thigh');
    const knee = new THREE.Group();
    knee.name = 'knee';
    knee.position.y = -THIGH;
    leg.add(knee);
    const shin = mesh(S.shin, pants, knee, 'shin');
    shin.position.y = 0;
    mesh(S.shoe, shoes, knee, 'shoe');
    mesh(S.sole, soleMat, knee, 'sole');
    legs.push(leg);
    knees.push(knee);
  }

  return { group, legs, arms, head, knees, elbows, torso, rig, hips };
}

/**
 * Pose the walk cycle. `phase` in radians (advance it with speed), `amplitude` ~0..1 (0 = standing,
 * 1 = brisk walk; > 1 reads as running). Legs swing at the hip with a knee bend on the forward swing, arms
 * counter-swing with a soft elbow; the pelvis twists with the leading leg while the shoulders counter-rotate,
 * the hips dip and the body sways side to side.
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
  // pelvis rotates with the stride, shoulders counter-rotate, subtle lateral sway and a forward lean
  model.hips.rotation.y = s * 0.09 * a;
  model.hips.rotation.z = c * 0.03 * a;
  model.torso.rotation.y = -s * 0.13 * a;
  model.torso.rotation.z = -c * 0.02 * a;
  const stoop = (model.torso.userData.stoop as number | undefined) ?? 0;   // elders lean forward
  model.torso.rotation.x = -0.04 * a + stoop;
  // the head drifts a little (looking about), a slight nod on each footfall
  model.head.rotation.y = s * 0.05 * a + Math.sin(phase * 0.23) * 0.1 * a;
  model.head.rotation.x = Math.abs(c) * 0.025 * a - 0.01 * a - ((model.torso.userData.stoop as number | undefined) ?? 0) * 0.7;
  model.rig.position.x = c * 0.01 * a;
  // the hips dip as the legs spread (keeps the feet planted)
  model.rig.position.y = -LEG * (1 - Math.cos(swing * s));
}

/** Height of the ankle joint above the ground (exposed for tests / future ik). */
export const ANKLE_HEIGHT = ANKLE;
