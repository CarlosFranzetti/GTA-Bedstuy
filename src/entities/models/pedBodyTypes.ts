/**
 * Body types: the street needs to read as different people in silhouette alone.
 *
 * ROUND 3 (SOMATO): a body type is a named POINT in the source figure's space: a weight coordinate and a muscle coordinate
 * (-1 = the source's minimum shape, 0 = average, +1 = maximum), a stature band and a few small frame draws. The CAST below
 * designs every type in the survey's own unit (BMI) and a lean-to-muscular scale, and one calibration table (`BMI_ANCHORS`)
 * turns BMI into the weight coordinate. `bodyBuildOf(spec)` is the person: the type's point plus a seeded personal spread,
 * so no two people match. It is what the mesh builder should read.
 *
 * `BodyType` / `bodyTypeOf` (the factors `shoulders`, `chest`, `belly`, `waist`, `hips`, `arms`, `legs`, `head`) are the
 * DEPRECATED round 2 view: hand-written deformers in pedMesh.ts, pedMass.ts, pedProportions.ts, pedLegs.ts, pedGarments.ts
 * read them. They stay for the old ids only until BASE retires those deformers; every new id is neutral (1) in them.
 * Fractions are multipliers (1 = the base shape) except `belly` and `stoop`, which are metres / radians.
 */
import type { PedSpec } from '@/textures/painters/ped';
import { massTargets, TYPE_BMI } from './pedMass';

export type BodyTypeId = 'avg' | 'slim' | 'athletic' | 'heavy' | 'tall-thin' | 'short-stocky' | 'broad' | 'pear' | 'petite' | 'elder' | 'teen' | 'kid'
  /** PEOPLE6: lanky (very tall, long thin limbs), swimmer (broad-shouldered athletic woman), stoop-slim (slim older man, stooped), elder-heavy (heavy older woman), big-tall (large tall man), pregnant, lean-teen, stout (short, round), slight (very small, light woman) */
  | 'lanky' | 'swimmer' | 'stoop-slim' | 'elder-heavy' | 'big-tall' | 'pregnant' | 'lean-teen' | 'stout' | 'slight'
  /** SOMATO (round 3): ectomorph, wiry (ecto-meso), soft (mild endomorph), skinny-fat, obese; fit and heavy teenagers; slight and chubby children */
  | 'ecto' | 'wiry' | 'soft' | 'skinny-fat' | 'obese' | 'fit-teen' | 'heavy-teen' | 'slight-kid' | 'chubby-kid';
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

// ================================================================ THE CAST (SOMATO, round 3)
export type AgeClass = 'adult' | 'old' | 'teen' | 'kid';
/** the classical names, for the description of a type: ectomorph (lean, light frame), mesomorph (muscular), endomorph (soft, heavy) and the mixes people actually are */
export type Somatotype = 'ectomorph' | 'ecto-mesomorph' | 'mesomorph' | 'meso-endomorph' | 'endomorph' | 'soft average' | 'skinny-fat' | 'average';
export interface CastType {
  /** the age class this type is drawn for */ age: AgeClass;
  kind: Somatotype;
  /** who they are, in plain words */ about: string;
  /** BMI-equivalent of the type's point (the figure's weight AND muscle together: see `bmiOf`) */ bmi: number;
  /** muscle coordinate of the point: -1 = the source's minimum muscle, 0 = average, +1 = maximum */ muscle: number;
  /** mean stature of the type in survey standard deviations of its age and sex, and the spread of the draw round it (1 = the whole population) */ zH: number; sdH?: number;
  /** spread of the personal draw: BMI units and muscle units (defaults by age) */ sdBmi?: number; sdM?: number;
}
const C = (age: AgeClass, kind: Somatotype, bmi: number, muscle: number, zH: number, about: string, o: Partial<CastType> = {}): CastType => ({ age, kind, bmi, muscle, zH, about, ...o });
/**
 * Every type, as a point. BMI figures are the survey's bands (docs/reference/gta5-characters.md section 3): under 25 normal or lean, 25 to 30 overweight, 30 and over obese.
 * The muscle coordinate is NOT in the survey (it has no muscle variable): it is a design choice, 0 = an ordinary untrained person of the sex and age.
 */
export const CAST: Record<BodyTypeId, CastType> = {
  // ---- adults, men and women (the source's sex shape does the sex difference, not a factor)
  ecto: C('adult', 'ectomorph', 19.3, -0.5, 0.3, 'Lean, light frame, narrow through the shoulder and hip; the build of a distance runner or a late growth spurt.'),
  slim: C('adult', 'ectomorph', 21, -0.2, 0.1, 'Slim and unremarkable: a little under the middle of the normal range, no muscle to speak of.'),
  wiry: C('adult', 'ecto-mesomorph', 22.3, 0.5, 0, 'Wiry: lean with hard, defined muscle; a courier, a boxer at the lower weights, a dancer.'),
  athletic: C('adult', 'mesomorph', 25, 1.0, 0.4, 'Muscular and trim: broad shoulders over a narrow waist; trains regularly.'),
  swimmer: C('adult', 'mesomorph', 22, 0.9, 0.6, 'Tall, long-limbed and strong through the shoulders; an athlete of the lean kind.', { sdBmi: 1.4 }),
  broad: C('adult', 'meso-endomorph', 29, 0.9, 0.4, 'Stocky and strong: a big frame with real muscle under the weight; a mover, a doorman, a lineman.'),
  'short-stocky': C('adult', 'meso-endomorph', 29.5, 0.5, -1.2, 'Short, dense and strong: a low centre of gravity, muscle and weight together.', { sdH: 0.7 }),
  avg: C('adult', 'soft average', 25.5, -0.05, 0, 'The soft average: ordinary weight for the street, no training, no particular frame.'),
  'skinny-fat': C('adult', 'skinny-fat', 24.5, -0.9, 0, 'Normal on the scale but little muscle: thin arms and legs with a soft middle.'),
  soft: C('adult', 'soft average', 28, -0.4, 0, 'Overweight and soft, carrying it round the middle; very common.'),
  pear: C('adult', 'endomorph', 28.5, -0.3, -0.2, 'A woman who carries her weight at the hip and thigh.'),
  heavy: C('adult', 'endomorph', 32, -0.1, -0.1, 'Heavy and soft, a broad trunk and thick limbs; obese by the survey, with the thick neck that goes with it.'),
  stout: C('adult', 'endomorph', 33, -0.1, -1.0, 'Short and round: heavy for a small frame.', { sdH: 0.7 }),
  'big-tall': C('adult', 'meso-endomorph', 33.5, 0.4, 1.0, 'A big man: tall, heavy and strong, the biggest person on the block.', { sdH: 0.7 }),
  obese: C('adult', 'endomorph', 38.5, -0.3, -0.2, 'Very heavy (class II to III obesity): the whole body is large, the neck, arms and legs thick, the belly low and wide.', { sdBmi: 2.6 }),
  'tall-thin': C('adult', 'ectomorph', 19.5, -0.3, 1.2, 'Tall and slender with long limbs.', { sdH: 0.7 }),
  lanky: C('adult', 'ectomorph', 18.5, -0.6, 1.5, 'Very tall and thin, long arms and legs, a stoop from ducking under doors.', { sdH: 0.5, sdBmi: 1.4 }),
  petite: C('adult', 'ectomorph', 20.5, -0.3, -1.1, 'Short and light, a small frame all round.', { sdH: 0.7 }),
  slight: C('adult', 'ectomorph', 18.5, -0.6, -1.3, 'Very small and light, narrow shoulders and slim limbs.', { sdH: 0.6, sdBmi: 1.4 }),
  pregnant: C('adult', 'average', 27, -0.3, 0, 'A woman late in pregnancy: a full, forward belly on an otherwise average frame.', { sdBmi: 1.6 }),
  // ---- elders (the source's old shapes)
  elder: C('old', 'average', 27, -0.4, 0, 'An older person of average weight: softer, less muscle, a rounded upper back.'),
  'stoop-slim': C('old', 'ectomorph', 21.5, -0.7, 0, 'Thin and frail: little muscle, a stoop, narrow limbs with prominent joints.', { sdBmi: 1.6 }),
  'elder-heavy': C('old', 'endomorph', 33, -0.4, -0.3, 'An older person who is heavy: a wide soft trunk, thin legs for the weight.'),
  // ---- teenagers
  teen: C('teen', 'average', 21, 0, 0, 'An ordinary teenager.', { sdBmi: 2.2 }),
  'lean-teen': C('teen', 'ectomorph', 18, -0.4, 0.5, 'Lean and gangly: long limbs, big hands and feet, narrow shoulders.', { sdBmi: 1.6, sdH: 0.8 }),
  'fit-teen': C('teen', 'ecto-mesomorph', 22.5, 0.7, 0.4, 'A teenager who plays sport: lean with some shape.', { sdBmi: 1.8 }),
  'heavy-teen': C('teen', 'endomorph', 28.5, -0.2, 0, 'A heavy teenager (the survey has about one in five teenagers obese).', { sdBmi: 3.0 }),
  // ---- children
  kid: C('kid', 'average', 16.5, 0, 0, 'An ordinary child of about six to eleven.', { sdBmi: 1.3, sdM: 0.15 }),
  'slight-kid': C('kid', 'ectomorph', 14.5, -0.4, 0, 'A slight, small-boned child.', { sdBmi: 0.9, sdM: 0.15 }),
  'chubby-kid': C('kid', 'endomorph', 21, -0.2, 0, 'A chubby child (about one in five children is obese in the survey).', { sdBmi: 2.0, sdM: 0.15 }),
};
/**
 * BMI-equivalent against the weight coordinate, per age class: [weight coordinate, BMI of the source's figure at that coordinate with average muscle].
 * PLACEHOLDER until BASE measures its shapes (the adult anchors follow MakeHuman's own weight slider: about 17, 24 and 36). Beyond the last anchor the
 * last segment continues. Muscle adds `MUSCLE_BMI` per unit (a muscular figure weighs more at the same weight coordinate).
 */
export const BMI_ANCHORS: Record<AgeClass, Array<[number, number]>> = {
  adult: [[-1, 17], [0, 24], [1, 36]],
  old: [[-1, 17], [0, 25], [1, 37]],
  teen: [[-1, 15.5], [0, 20.5], [1, 30]],
  kid: [[-1, 13.5], [0, 16.5], [1, 22]],
};
export const MUSCLE_BMI = 2;
/** the range a coordinate may take (PLACEHOLDER: BASE says how far past the source's shapes is safe) */
export const SAFE = { weight: [-1.05, 1.35] as const, muscle: [-1.05, 1.25] as const };
const lerpTab = (tab: Array<[number, number]>, x: number, ix: 0 | 1): number => {
  const jx = (1 - ix) as 0 | 1, n = tab.length;
  const seg = x <= tab[0][ix] ? 0 : x >= tab[n - 1][ix] ? n - 2 : tab.findIndex((p, i) => i < n - 1 && x <= tab[i + 1][ix]);
  const a = tab[seg], b = tab[seg + 1];
  return a[jx] + (b[jx] - a[jx]) * (x - a[ix]) / (b[ix] - a[ix]);
};
/** the weight coordinate that gives `bmi` at muscle `m` */
export const weightOfBmi = (bmi: number, m: number, age: AgeClass): number => lerpTab(BMI_ANCHORS[age], bmi - MUSCLE_BMI * m, 1);
/** the BMI-equivalent of a figure at (weight, muscle) */
export const bmiOf = (weight: number, muscle: number, age: AgeClass): number => lerpTab(BMI_ANCHORS[age], weight, 0) + MUSCLE_BMI * muscle;

/** a new id's legacy view: neutral frame, the cast point as weight and muscle, stature tendency as `h` */
const N = (id: BodyTypeId): BodyType => { const c = CAST[id]; return T({ weight: Math.round(weightOfBmi(c.bmi, c.muscle, c.age) * 100) / 100, muscle: c.muscle, h: 1 + 0.035 * c.zH }); };
export const BODY_TYPES: Record<BodyTypeId, BodyType> = {
  avg: T({}),
  slim: T({ h: 1.02, weight: -0.8, shoulders: 0.97 }),
  athletic: T({ h: 1.03, muscle: 1.0, weight: -0.2, shoulders: 1.06 }),
  heavy: T({ h: 0.98, weight: 1.2, belly: 0.03, shoulders: 1.0 }),
  'tall-thin': T({ h: 1.08, weight: -1.0, shoulders: 0.96 }),
  'short-stocky': T({ h: 0.88, weight: 0.8, muscle: 0.6, shoulders: 1.02, head: 1.05 }),
  broad: T({ h: 1.05, muscle: 1.0, weight: 0.3, shoulders: 1.06 }),
  pear: T({ h: 0.99, weight: 0.9, hips: 1.08, shoulders: 0.97 }),
  petite: T({ h: 0.92, weight: -0.5, shoulders: 0.95, head: 1.03 }),
  elder: T({ h: 0.96, weight: 0.5, shoulders: 0.96, stoop: -0.22 }),
  teen: T({ h: 0.95, weight: -0.2, shoulders: 0.95, head: 1.07 }),
  kid: T({ h: 0.78, head: 1.22 }),
  lanky: T({ h: 1.10, weight: -1.0, shoulders: 0.93, arms: 0.9, legs: 0.9, head: 0.97, waist: 0.97, stoop: -0.06 }),
  swimmer: T({ h: 1.04, muscle: 0.9, weight: -0.3, shoulders: 1.11, chest: 1.02, hips: 0.97, waist: 0.97, arms: 1.06 }),
  'stoop-slim': T({ h: 1.0, weight: -0.7, shoulders: 0.94, stoop: -0.3, arms: 0.93, legs: 0.93, waist: 1.02 }),
  'elder-heavy': T({ h: 0.94, weight: 1.3, belly: 0.05, shoulders: 0.98, hips: 1.1, stoop: -0.14, chest: 1.06 }),
  'big-tall': T({ h: 1.06, weight: 1.1, muscle: 0.6, shoulders: 1.1, belly: 0.045, chest: 1.08, arms: 1.1, legs: 1.04 }),
  pregnant: T({ h: 0.98, weight: 0.15, belly: 0.1, waist: 1.04, shoulders: 0.97, hips: 1.03, chest: 1.04, stoop: 0.06 }),
  'lean-teen': T({ h: 1.0, weight: -0.9, shoulders: 0.92, arms: 0.9, legs: 0.92, head: 1.05, waist: 1.0 }),
  stout: T({ h: 0.9, weight: 1.0, belly: 0.05, shoulders: 1.03, head: 1.05, hips: 1.05, legs: 1.04 }),
  slight: T({ h: 0.88, weight: -0.9, shoulders: 0.92, arms: 0.9, legs: 0.92, head: 1.05, hips: 0.97 }),
  ecto: N('ecto'), wiry: N('wiry'), soft: N('soft'), 'skinny-fat': N('skinny-fat'), obese: N('obese'),
  'fit-teen': { ...N('fit-teen'), head: 1.07, h: 0.95 }, 'heavy-teen': { ...N('heavy-teen'), head: 1.07, h: 0.95 },
  'slight-kid': { ...N('slight-kid'), head: 1.22, h: 0.78 }, 'chubby-kid': { ...N('chubby-kid'), head: 1.22, h: 0.78 },
};
/** INTERIM (until BASE retires pedMass.ts): the girth fit reads a design BMI per id; the new ids bring theirs from the cast so they are fitted like the old ones. Kids are not fitted (0). */
for (const id of Object.keys(CAST) as BodyTypeId[]) if (!(id in TYPE_BMI)) TYPE_BMI[id] = CAST[id].age === 'kid' ? [0, 0] : [CAST[id].bmi, CAST[id].bmi];
/** BODY seat: measured bideltoid width of the bases was 9 to 10 percent under ANSUR II (0.462 against 0.510 m, men): every type's shoulders are widened to match; children and teens by less */
for (const [id, b] of Object.entries(BODY_TYPES)) { b.shoulders *= id === 'kid' ? 1.0 : id === 'teen' || id === 'lean-teen' ? 1.04 : 1.08; b.chest *= id === 'kid' ? 1.0 : 1.07; }
/**
 * The types a generated person may have, by age and sex, with weights (pedWardrobe.ts picks one per person). The ages are chosen by the spawner;
 * this sets the builds WITHIN each age. Adults: about a third normal weight or under, a third overweight, a third obese (the owner's target; the
 * survey's adults are about 27 / 31 / 42 percent, CDC 2017-2020 from memory, and NYC's are lighter), with the muscular types mostly men and the
 * lean and light types spread over both. tests/unit/entities/somato-cast.test.ts measures the result.
 */
export const BODY_POOLS: Record<string, Array<[BodyTypeId, number]>> = {
  'adult-m': [['ecto', 0.7], ['slim', 1.5], ['wiry', 1.6], ['athletic', 1.5], ['skinny-fat', 0.8], ['avg', 3.2], ['soft', 2.4], ['broad', 1.7], ['short-stocky', 1.2], ['heavy', 2.3], ['big-tall', 1.5], ['stout', 1.0], ['obese', 1.6], ['lanky', 0.35], ['tall-thin', 0.45]],
  'adult-f': [['ecto', 0.5], ['slim', 1.4], ['wiry', 1.4], ['swimmer', 1.0], ['skinny-fat', 0.7], ['avg', 3.0], ['soft', 2.4], ['pear', 2.6], ['petite', 1.1], ['slight', 0.4], ['heavy', 2.4], ['stout', 0.6], ['obese', 1.9], ['tall-thin', 0.5], ['pregnant', 0.6]],
  'adult-x': [['ecto', 0.5], ['slim', 1.5], ['wiry', 1.2], ['athletic', 0.8], ['skinny-fat', 0.7], ['avg', 3], ['soft', 2.2], ['heavy', 2], ['obese', 1.3], ['petite', 0.7], ['lanky', 0.4]],
  'old-m': [['elder', 3.2], ['stoop-slim', 2.2], ['elder-heavy', 2.6]],
  'old-f': [['elder', 3.2], ['stoop-slim', 2.4], ['elder-heavy', 2.8]],
  'old-x': [['elder', 3], ['stoop-slim', 2], ['elder-heavy', 2.4]],
  'teen-m': [['teen', 3], ['lean-teen', 2], ['fit-teen', 1.2], ['heavy-teen', 1.5]],
  'teen-f': [['teen', 3], ['lean-teen', 1.6], ['fit-teen', 0.7], ['heavy-teen', 1.4]],
  'teen-x': [['teen', 3], ['lean-teen', 1.8], ['fit-teen', 1], ['heavy-teen', 1.4]],
  'kid-m': [['kid', 6], ['slight-kid', 1.6], ['chubby-kid', 2.2]], 'kid-f': [['kid', 6], ['slight-kid', 1.6], ['chubby-kid', 2.2]], 'kid-x': [['kid', 6], ['slight-kid', 1.6], ['chubby-kid', 2.2]],
};

const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const MALE_TYPES: BodyTypeId[] = ['avg', 'athletic', 'heavy', 'tall-thin', 'short-stocky', 'broad', 'slim', 'soft', 'wiry', 'obese', 'avg', 'ecto', 'big-tall'];
const FEMALE_TYPES: BodyTypeId[] = ['avg', 'slim', 'pear', 'wiry', 'petite', 'heavy', 'tall-thin', 'soft', 'obese', 'pear', 'avg', 'skinny-fat'];

/** a person's body type: explicit (`spec.body`), else by age, build and a stable pick from their id (so the same person always looks the same) */
export function bodyTypeId(spec: Pick<PedSpec, 'id' | 'build' | 'sex' | 'age' | 'role'> & { body?: BodyTypeId; seed?: string }): BodyTypeId {
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
/** BODY (second shift): shoulders to the survey's bideltoid (men 0.290, women 0.276 of stature; the bases were 0.268 and 0.248 after the first x1.08) */
const SEX_ADJ: Record<'m' | 'f' | 'x', Partial<BodyType>> = { m: { hips: 0.95, waist: 0.97, shoulders: 1.12 }, f: { waist: 1.0, shoulders: 1.135 }, x: { hips: 0.975, waist: 0.97, shoulders: 1.125 } };
const adjusted = new Map<string, BodyType>();
export function bodyTypeOf(spec: Parameters<typeof bodyTypeId>[0]): BodyType {
  const id = bodyTypeId(spec), sx = spec.sex === 'f' ? 'f' : spec.sex === 'x' ? 'x' : 'm', k = id + sx;
  let b = adjusted.get(k);
  if (!b) {
    const base = BODY_TYPES[id], a = SEX_ADJ[sx];
    b = { ...base, hips: base.hips * (a.hips ?? 1), waist: base.waist * (a.waist ?? 1), shoulders: base.shoulders * (id === 'kid' || id === 'teen' || id === 'lean-teen' ? 1 : (a.shoulders ?? 1)) };
    const t = massTargets(sx === 'f' ? 'f' : 'm', id); if (t) b.legs = 1 + (t.thigh * 0.94 / (sx === 'f' ? 0.286 : 0.305) - 1) / 0.7;      // trouser legs size from this (pedLegs.ts: 1 + (legs - 1) * 0.7)
    adjusted.set(k, b);
  }
  return b;
}

// ================================================================ THE PERSON (SOMATO, round 3)
/** one person's build: the type's point plus a seeded personal spread. What the mesh builder reads (weight, muscle, stature) and the frame draws it may apply. */
export interface PersonBuild {
  type: BodyTypeId; age: AgeClass;
  /** coordinates in the source's muscle by weight grid: -1 the minimum shape, 0 average, +1 the maximum (clamped to `SAFE`) */
  weight: number; muscle: number;
  /** the BMI-equivalent of (weight, muscle): what the survey would call this person */ bmi: number;
  /** stature in metres: inside the survey's 5th to 95th percentile for the age and sex */ statureM: number;
  /** neck girth offset in cm from what this BMI and sex give (sd 1.5 men, 1.2 women, a little more for muscle); a thick neck on a lean man, a thin one on a heavy man */ neckCm: number;
  /** shoulder breadth multiplier (1 +- 0.06, sd 0.025, wider with muscle) */ shoulderK: number;
  /** leg length share multiplier (1 +- 0.03, sd 0.012: the long-legged and the long-bodied) */ legK: number;
}
const STATURE: Record<AgeClass, Record<'m' | 'f' | 'x', [number, number, number]>> = {
  // [median, sd below, sd above] in metres. Adults: ANSUR II P5 / P50 / P95 (men 1648 / 1755 / 1870 mm, women 1525 / 1626 / 1740: skewed a little upward, so the two sides differ;
  // docs/reference/gta5-characters.md section 1), 'x' between them; elders 2.5 percent shorter (anatomy-limbs-ages.md 3d); teenagers 13 to 17 and children 6 to 11 from the NHANES age table
  // (anatomy-limbs-ages.md 3a), averaged over the age span, symmetric.
  adult: { m: [1.755, 0.0650, 0.0699], f: [1.626, 0.0614, 0.0693], x: [1.69, 0.0632, 0.0696] },
  old: { m: [1.711, 0.0634, 0.0681], f: [1.585, 0.0599, 0.0676], x: [1.648, 0.0616, 0.0679] },
  teen: { m: [1.68, 0.075, 0.075], f: [1.59, 0.055, 0.055], x: [1.635, 0.065, 0.065] },
  kid: { m: [1.34, 0.085, 0.085], f: [1.34, 0.085, 0.085], x: [1.34, 0.085, 0.085] },
};
/** the tails of a stature draw: the survey's 5th and 95th percentile, in standard deviations */
export const STATURE_Z = 1.6449;
const h32 = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const stream = (seed: number): { next(): number; gauss(): number } => {
  let a = seed >>> 0;
  const next = (): number => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, gauss: () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next()) };
};
/** the standard normal distribution function and its inverse (Abramowitz and Stegun 7.1.26; Acklam's rational approximation) */
export const normCdf = (z: number): number => { const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2); return z >= 0 ? 0.5 + 0.5 * y : 0.5 - 0.5 * y; };
export const normInv = (p: number): number => {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239], b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572],
    c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  if (p < 0.02425) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - 0.02425) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
};
const clampTo = (x: number, [lo, hi]: readonly [number, number]): number => Math.min(hi, Math.max(lo, x));
const ageClassOf = (spec: { age?: PedSpec['age']; build?: PedSpec['build'] }): AgeClass => (spec.age === 'kid' || spec.build === 'kid' ? 'kid' : spec.age === 'teen' ? 'teen' : spec.age === 'old' ? 'old' : 'adult');
const builds = new Map<string, PersonBuild>();
/**
 * One person's build. Deterministic from `spec.id` (a hash of the whole look, so equal looks are one person) and the type; no random state.
 * The weight coordinate comes from a BMI drawn round the type's point (adults drift heavier and less muscular with a latent age), the muscle
 * coordinate from the type's point plus its own spread, the stature from a truncated normal between the survey's 5th and 95th percentile
 * (the type shifts it: tall and short versions of every build), the neck, shoulder and leg-length draws are independent of all of it.
 */
export function bodyBuildOf(spec: Parameters<typeof bodyTypeId>[0]): PersonBuild {
  const id = bodyTypeId(spec), ac = ageClassOf(spec), sx: 'm' | 'f' | 'x' = spec.sex === 'f' ? 'f' : spec.sex === 'x' ? 'x' : 'm', key = `${spec.seed ?? spec.id}|${id}|${sx}|${ac}`;
  const hit = builds.get(key); if (hit) return hit;
  const c = CAST[id], r = stream(h32(key + '|somato'));
  const years = 18 + 52 * r.next(), gB = r.gauss(), gM = r.gauss(), gH = r.gauss(), gN = r.gauss(), gS = r.gauss(), gL = r.gauss();
  const grown = ac === 'adult';
  const bmi = c.bmi + (grown ? 0.045 * (years - 40) : 0) + gB * (c.sdBmi ?? (ac === 'kid' ? 1.3 : 2.0));
  let muscle = c.muscle + (grown ? (sx === 'f' ? -0.005 : -0.010) * (years - 38) : 0) + 0.04 * (bmi - c.bmi) + gM * (c.sdM ?? 0.28);
  muscle = clampTo(muscle, SAFE.muscle);
  const weight = clampTo(weightOfBmi(bmi, muscle, ac), SAFE.weight);
  const [med, sdLo, sdHi] = STATURE[ac][sx], zRaw = c.zH + (c.sdH ?? 1) * gH;
  const z = normInv(0.05 + 0.9 * normCdf(zRaw)), statureM = med + z * (z < 0 ? sdLo : sdHi);
  const neckSd = sx === 'f' ? 1.2 : 1.5, neckCm = clampTo(gN * neckSd + 0.8 * Math.max(0, muscle), [-3.2, 3.8]);
  const b: PersonBuild = { type: id, age: ac, weight, muscle, bmi: bmiOf(weight, muscle, ac), statureM, neckCm, shoulderK: 1 + clampTo(gS * 0.025 + 0.02 * muscle, [-0.06, 0.07]), legK: 1 + clampTo(gL * 0.012, [-0.03, 0.03]) };
  if (builds.size > 4096) builds.clear();
  builds.set(key, b);
  return b;
}
