/**
 * Body types: the street needs to read as different people in silhouette alone. A type is a set of factors applied to the MakeHuman
 * base shape of a person (pedMesh.ts deforms the vertices AND the rig joints with the same function, so arms still pivot at the shoulders).
 * Fractions are multipliers (1 = the base shape) except `belly` and `stoop`, which are metres / radians.
 */
import type { PedSpec } from '@/textures/painters/ped';

export type BodyTypeId = 'avg' | 'slim' | 'athletic' | 'heavy' | 'tall-thin' | 'short-stocky' | 'broad' | 'pear' | 'petite' | 'elder' | 'teen' | 'kid';
export interface BodyType {
  /** stature factor on the shape's own height */
  h: number;
  /** shoulder and upper-chest width */
  shoulders: number;
  /** chest depth */
  chest: number;
  /** belly bulge forward (m) at the waist, and its width factor */
  belly: number;
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
const T = (o: Partial<BodyType>): BodyType => ({ h: 1, shoulders: 1, chest: 1, belly: 0, hips: 1, arms: 1, legs: 1, head: 1, stoop: 0, weight: 0, muscle: 0, ...o });
export const BODY_TYPES: Record<BodyTypeId, BodyType> = {
  avg: T({}),
  slim: T({ h: 1.02, weight: -0.5, shoulders: 0.97 }),
  athletic: T({ h: 1.03, muscle: 0.75, weight: -0.1, shoulders: 1.05 }),
  heavy: T({ h: 0.98, weight: 0.7, belly: 0.025, shoulders: 1.03 }),
  'tall-thin': T({ h: 1.11, weight: -0.6, shoulders: 0.96 }),
  'short-stocky': T({ h: 0.88, weight: 0.35, muscle: 0.4, shoulders: 1.05, head: 1.05 }),
  broad: T({ h: 1.05, muscle: 0.5, weight: 0.15, shoulders: 1.12 }),
  pear: T({ h: 0.99, weight: 0.35, hips: 1.08, shoulders: 0.97 }),
  petite: T({ h: 0.92, weight: -0.3, shoulders: 0.95, head: 1.03 }),
  elder: T({ h: 0.96, weight: 0.2, shoulders: 0.96, stoop: -0.22 }),
  teen: T({ h: 0.95, weight: -0.2, shoulders: 0.95, head: 1.07 }),
  kid: T({ h: 0.78, head: 1.22 }),
};

const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const MALE_TYPES: BodyTypeId[] = ['avg', 'athletic', 'heavy', 'tall-thin', 'short-stocky', 'broad', 'slim', 'avg', 'athletic'];
const FEMALE_TYPES: BodyTypeId[] = ['avg', 'slim', 'pear', 'athletic', 'petite', 'heavy', 'tall-thin', 'pear', 'avg'];

/** a person's body type: explicit (`spec.body`), else by age, build and a stable pick from their id (so the same person always looks the same) */
export function bodyTypeId(spec: Pick<PedSpec, 'id' | 'build' | 'sex' | 'age' | 'role'> & { body?: BodyTypeId }): BodyTypeId {
  if (spec.body) return spec.body;
  const age = spec.age ?? 'adult';
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
export function bodyTypeOf(spec: Parameters<typeof bodyTypeId>[0]): BodyType { return BODY_TYPES[bodyTypeId(spec)]; }
