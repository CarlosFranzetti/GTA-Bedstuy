/**
 * Body types: the street needs to read as different people in silhouette alone. A type is a set of factors applied to the MakeHuman
 * base shape of a person (pedMesh.ts deforms the vertices AND the rig joints with the same function, so arms still pivot at the shoulders).
 * Fractions are multipliers (1 = the base shape) except `belly` and `stoop`, which are metres / radians.
 */
import type { PedSpec } from '@/textures/painters/ped';

export type BodyTypeId = 'avg' | 'slim' | 'athletic' | 'heavy' | 'tall-thin' | 'short-stocky' | 'broad' | 'pear' | 'petite' | 'elder' | 'teen' | 'kid'
  /** PEOPLE6: lanky (very tall, long thin limbs), swimmer (broad-shouldered athletic woman), stoop-slim (slim older man, stooped), elder-heavy (heavy older woman), big-tall (large tall man), pregnant, lean-teen, stout (short, round), slight (very small, light woman) */
  | 'lanky' | 'swimmer' | 'stoop-slim' | 'elder-heavy' | 'big-tall' | 'pregnant' | 'lean-teen' | 'stout' | 'slight';
export interface BodyType {
  /** stature factor on the shape's own height */
  h: number;
  /** shoulder and upper-chest width */
  shoulders: number;
  /** chest depth */
  chest: number;
  /** belly bulge forward (m) at the waist, and its width factor */
  belly: number;
  /** waist width (1 = the base shape; men get another 5 % off in dressLod, women 1.5 %) */
  waist: number;
  /** hip and upper-thigh width */
  hips: number;
  /** arm thickness, leg thickness */
  arms: number; legs: number;
  /** head size on the neck */
  head: number;
  /** forward lean of the torso (rad, negative = forward as in torso.userData.stoop) */
  stoop: number;
  /** MakeHuman weight shape strength (negative = thinner) and muscle shape strength: the body is shaped by the base mesh's own targets, not inflated */
  weight: number; muscle: number;
}
const T = (o: Partial<BodyType>): BodyType => ({ h: 1, shoulders: 1, chest: 1, belly: 0, waist: 1, hips: 1, arms: 1, legs: 1, head: 1, stoop: 0, weight: 0, muscle: 0, ...o });
export const BODY_TYPES: Record<BodyTypeId, BodyType> = {
  avg: T({}),
  slim: T({ h: 1.02, weight: -0.8, shoulders: 0.97 }),
  athletic: T({ h: 1.03, muscle: 1.0, weight: -0.2, shoulders: 1.06 }),
  heavy: T({ h: 0.98, weight: 1.2, belly: 0.03, shoulders: 1.0 }),
  'tall-thin': T({ h: 1.11, weight: -1.0, shoulders: 0.96 }),
  'short-stocky': T({ h: 0.88, weight: 0.8, muscle: 0.6, shoulders: 1.02, head: 1.05 }),
  broad: T({ h: 1.05, muscle: 1.0, weight: 0.3, shoulders: 1.06 }),
  pear: T({ h: 0.99, weight: 0.9, hips: 1.08, shoulders: 0.97 }),
  petite: T({ h: 0.92, weight: -0.5, shoulders: 0.95, head: 1.03 }),
  elder: T({ h: 0.96, weight: 0.5, shoulders: 0.96, stoop: -0.22 }),
  teen: T({ h: 0.95, weight: -0.2, shoulders: 0.95, head: 1.07 }),
  kid: T({ h: 0.78, head: 1.22 }),
  lanky: T({ h: 1.15, weight: -1.0, shoulders: 0.93, arms: 0.9, legs: 0.9, head: 0.97, waist: 0.97, stoop: -0.06 }),
  swimmer: T({ h: 1.04, muscle: 0.9, weight: -0.3, shoulders: 1.11, chest: 1.02, hips: 0.97, waist: 0.97, arms: 1.06 }),
  'stoop-slim': T({ h: 1.0, weight: -0.7, shoulders: 0.94, stoop: -0.3, arms: 0.93, legs: 0.93, waist: 1.02 }),
  'elder-heavy': T({ h: 0.94, weight: 1.3, belly: 0.05, shoulders: 0.98, hips: 1.1, stoop: -0.14, chest: 1.06 }),
  'big-tall': T({ h: 1.09, weight: 1.1, muscle: 0.6, shoulders: 1.1, belly: 0.045, chest: 1.08, arms: 1.1, legs: 1.04 }),
  pregnant: T({ h: 0.98, weight: 0.15, belly: 0.1, waist: 1.04, shoulders: 0.97, hips: 1.03, chest: 1.04, stoop: 0.06 }),
  'lean-teen': T({ h: 1.0, weight: -0.9, shoulders: 0.92, arms: 0.9, legs: 0.92, head: 1.05, waist: 1.0 }),
  stout: T({ h: 0.9, weight: 1.0, belly: 0.05, shoulders: 1.03, head: 1.05, hips: 1.05, legs: 1.04 }),
  slight: T({ h: 0.88, weight: -0.9, shoulders: 0.92, arms: 0.9, legs: 0.92, head: 1.05, hips: 0.97 }),
};
/** BODY seat: measured bideltoid width of the bases was 9 to 10 percent under ANSUR II (0.462 against 0.510 m, men): every type's shoulders are widened to match; children and teens by less */
for (const [id, b] of Object.entries(BODY_TYPES)) b.shoulders *= id === 'kid' ? 1.0 : id === 'teen' || id === 'lean-teen' ? 1.04 : 1.08;
/** the types a generated person may have, by age and sex, with weights (pedWardrobe.ts) */
export const BODY_POOLS: Record<string, Array<[BodyTypeId, number]>> = {
  'adult-m': [['avg', 3], ['athletic', 2], ['heavy', 1.2], ['lanky', 1.1], ['tall-thin', 0.8], ['short-stocky', 1], ['broad', 1], ['slim', 1.5], ['big-tall', 1.2], ['stout', 0.9]],
  'adult-f': [['avg', 3], ['slim', 1.5], ['pear', 2], ['swimmer', 1], ['petite', 1.1], ['slight', 0.9], ['heavy', 1.4], ['tall-thin', 0.9], ['pregnant', 0.55]],
  'adult-x': [['avg', 3], ['slim', 2], ['lanky', 1], ['athletic', 1], ['petite', 1]],
  'old-m': [['elder', 2], ['stoop-slim', 1.6], ['heavy', 0.8], ['stout', 0.8]],
  'old-f': [['elder', 2], ['elder-heavy', 1.6], ['petite', 0.7], ['slight', 0.8]],
  'old-x': [['elder', 1]],
  'teen-m': [['teen', 2], ['lean-teen', 1.6], ['athletic', 0.5]],
  'teen-f': [['teen', 2], ['lean-teen', 1.2], ['petite', 0.5]],
  'teen-x': [['teen', 1], ['lean-teen', 1]],
  'kid-m': [['kid', 1]], 'kid-f': [['kid', 1]], 'kid-x': [['kid', 1]],
};

const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const MALE_TYPES: BodyTypeId[] = ['avg', 'athletic', 'heavy', 'tall-thin', 'short-stocky', 'broad', 'slim', 'avg', 'athletic'];
const FEMALE_TYPES: BodyTypeId[] = ['avg', 'slim', 'pear', 'athletic', 'petite', 'heavy', 'tall-thin', 'pear', 'avg'];

/** a person's body type: explicit (`spec.body`), else by age, build and a stable pick from their id (so the same person always looks the same) */
export function bodyTypeId(spec: Pick<PedSpec, 'id' | 'build' | 'sex' | 'age' | 'role'> & { body?: BodyTypeId }): BodyTypeId {
  if (spec.body) return spec.body;
  const age = spec.age ?? 'adult';
  if (spec.role === 'player' && age !== 'kid') return spec.sex === 'f' ? 'avg' : 'athletic';      // the player is the model the camera sits behind: a fit build
  if (age === 'kid' || spec.build === 'kid') return 'kid';
  if (age === 'teen') return 'teen';
  if (age === 'old') return 'elder';
  if (spec.role !== 'civilian' && spec.role !== 'player') return spec.build === 'stocky' ? 'short-stocky' : spec.build === 'tall' ? 'tall-thin' : spec.build === 'slim' ? 'slim' : 'avg';
  const r = hash(spec.id + ':b');
  if (spec.build === 'stocky') return spec.sex === 'f' ? (r < 0.5 ? 'pear' : 'heavy') : r < 0.4 ? 'short-stocky' : r < 0.7 ? 'broad' : 'heavy';
  if (spec.build === 'tall') return spec.sex === 'f' ? 'tall-thin' : r < 0.5 ? 'tall-thin' : 'athletic';
  if (spec.build === 'slim') return r < 0.5 ? 'slim' : spec.sex === 'f' ? 'petite' : 'tall-thin';
  const list = spec.sex === 'f' ? FEMALE_TYPES : MALE_TYPES;
  return list[Math.floor(hash(spec.id + ':body') * list.length) % list.length];
}
/** per sex adjustment on top of the body type: men carry the wedge (narrower waist and hips), women a softer taper */
const SEX_ADJ: Record<'m' | 'f' | 'x', Partial<BodyType>> = { m: { hips: 0.95, waist: 0.95 }, f: { waist: 0.985 }, x: { hips: 0.975, waist: 0.97 } };
const adjusted = new Map<string, BodyType>();
export function bodyTypeOf(spec: Parameters<typeof bodyTypeId>[0]): BodyType {
  const id = bodyTypeId(spec), sx = spec.sex === 'f' ? 'f' : spec.sex === 'x' ? 'x' : 'm', k = id + sx;
  let b = adjusted.get(k);
  if (!b) {
    const base = BODY_TYPES[id], a = SEX_ADJ[sx];
    b = { ...base, hips: base.hips * (a.hips ?? 1), waist: base.waist * (a.waist ?? 1) };
    adjusted.set(k, b);
  }
  return b;
}
