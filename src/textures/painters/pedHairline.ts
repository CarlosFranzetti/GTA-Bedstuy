/**
 * FACES4: the hairlines of the hair styles, as height fractions of the head (0 chin, 1 crown) by azimuth from the front (0) to the back (pi).
 * One table for the hair shells (pedHairPieces.ts builds each style's rim from these) and for the face painter, which paints the scalp band under the
 * rim: hair-coloured stubble that fades into skin, so the hair does not end in a ruled line.
 */
export type Knots = Array<[number, number]>;
export const L_FADE: Knots = [[0, 0.8], [0.6, 0.79], [0.98, 0.76], [1.28, 0.71], [1.52, 0.67], [1.85, 0.65], [2.3, 0.57], [2.8, 0.5], [Math.PI, 0.48]];
export const L_SHORT: Knots = [[0, 0.79], [0.6, 0.78], [1.0, 0.74], [1.3, 0.66], [1.55, 0.62], [1.85, 0.62], [2.3, 0.52], [2.8, 0.42], [Math.PI, 0.4]];
export const L_AFRO: Knots = [[0, 0.85], [0.7, 0.82], [1.1, 0.74], [1.4, 0.64], [1.8, 0.62], [2.3, 0.5], [2.8, 0.43], [Math.PI, 0.42]];
export const L_LONG: Knots = [[0, 0.82], [0.6, 0.8], [1.0, 0.73], [1.35, 0.63], [1.7, 0.57], [2.4, 0.52], [Math.PI, 0.5]];

/** the piecewise linear height fraction at azimuth `be` (0..2pi) */
export function knotsAt(k: Knots, be: number): number {
  const b = be > Math.PI ? Math.PI * 2 - be : be;
  for (let i = 1; i < k.length; i++) if (b <= k[i][0]) return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * ((b - k[i - 1][0]) / (k[i][0] - k[i - 1][0] || 1));
  return k[k.length - 1][1];
}
/** the table a hair style's rim follows (an approximation of the shell's: the shells jitter it a little) */
export function hairlineFor(style: string): Knots | null {
  switch (style) {
    case 'bald': return null;
    case 'fade': return L_FADE;
    case 'afro': case 'puff': case 'twists': return L_AFRO;
    case 'long': case 'bob': case 'waves': case 'braids': case 'locs': case 'ponytail': case 'bun': return L_LONG;
    default: return L_SHORT;
  }
}
