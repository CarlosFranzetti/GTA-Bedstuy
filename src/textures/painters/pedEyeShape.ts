/**
 * FACES4: the shape of a person's eye opening, shared by the face painter (which paints the eye) and the eye patch (pedEyes.ts, which
 * builds the lids and the eyeball in 3D). One function, so the painted opening and the geometry's lid edge are the same curve.
 * Units are "standard head metres" (x along the eye from the middle of the eye, outward positive; y above the eye line), the painter's units.
 */
import { hash } from './pedPaintShared';
import type { PedSpec } from './ped';

export type EyeExpr = 'neutral' | 'tired' | 'amused';
/** the resting expression of a person (the same draw the painter has always made) */
export function exprOf(spec: PedSpec): EyeExpr {
  const id = spec.id, face = spec.face, kidish = spec.age === 'kid' || spec.age === 'teen';
  const eh = hash(id + 'ex');
  let expr: EyeExpr = eh < 0.55 ? 'neutral' : eh < 0.78 ? 'tired' : 'amused';
  if (face.mouth === 'smile' || face.mouth === 'grin') expr = hash(id + 'sm') < 0.85 ? 'amused' : 'neutral';
  if (face.mouth === 'frown' || face.eyes === 'sleepy') expr = 'tired';
  if (kidish && expr === 'tired') expr = 'neutral';
  return expr;
}
/** how much living shows on the face: 0 for a child, about 0.15 to 0.85 for adults by id, 1.1 to 1.5 for the old */
export function wearOf(spec: PedSpec): number {
  const kidish = spec.age === 'kid' || spec.age === 'teen';
  return kidish ? 0 : spec.age === 'old' ? 1.1 + 0.4 * hash(spec.id + 'wear') : 0.15 + 0.7 * hash(spec.id + 'wear');
}

export interface EyeShape {
  /** half width of the opening, upper and lower half height at the middle, slope of the eye line (outer corner rises), iris radius, iris centre height, gaze sideways (m, outward positive) */
  a: number; bUp: number; bLo: number; tilt: number; ri: number; iy: number; gx: number;
  /** lid heaviness 0..1 (tired, old), the person's eye size scale */
  heavy: number; eyeK: number;
}
export function eyeShapeOf(spec: PedSpec): EyeShape {
  const id = spec.id, face = spec.face, expr = exprOf(spec), wear = wearOf(spec), kidish = spec.age === 'kid' || spec.age === 'teen';
  const tired = expr === 'tired', amused = expr === 'amused';
  const eyeK = 0.92 + 0.14 * hash(id + 'ek'), tl = hash(id + 'tl'), gz = hash(id + 'gz');
  const heavy = Math.min(1, 0.22 * Math.min(1.5, wear) + (tired ? 0.3 : 0) + (face.eyes === 'sleepy' ? 0.3 : 0) + 0.1 * hash(id + 'lid'));
  const k = (tired ? 0.88 : amused ? 0.95 : 1) * (kidish ? 1.08 : 1) * (face.eyes === 'wide' ? 1.1 : face.eyes === 'sleepy' ? 0.84 : 1) * (1 - 0.2 * heavy);
  return {
    a: 0.0152 * eyeK, bUp: 0.0072 * k, bLo: 0.0027 * (amused ? 0.72 : 1) * (1 + 0.1 * heavy),
    tilt: 0.0009 + 0.0004 * tl, ri: 0.0057 * (kidish ? 1.08 : 1), iy: 0.0021 - 0.0006 * heavy, gx: 0.0009 * (gz - 0.5), heavy, eyeK,
  };
}
/** the upper and lower edge of the opening at u = x / a (|u| < 1) */
export function eyeEdges(e: EyeShape, u: number): { yu: number; yl: number } {
  const w = 1 - u * u;
  if (w <= 0) return { yu: e.tilt * u, yl: e.tilt * u };
  return { yu: e.bUp * Math.pow(w, 0.62) * (u < 0 ? 0.92 : 1) + e.tilt * u, yl: -e.bLo * Math.pow(w, 0.8) + e.tilt * u };
}

/** the patch's rectangles of the atlas (512 reference; the left eye, x < 0, then the right), the metres per texel, the eye-line offset of the rectangle's middle and the outermost ring */
export const EYE_RECTS = [{ x: 256, y: 320, w: 128, h: 64 }, { x: 384, y: 320, w: 128, h: 64 }];
export const EYE_SR = 0.00072, EYE_EYC = 0.0025, EYE_RHO_MAX = 2.8;
