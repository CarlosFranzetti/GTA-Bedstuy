/**
 * BASE seat (round 3): where a person's build sits in the source's muscle by weight grid.
 *
 * SOMATO's cast (pedBodyTypes.ts, `bodyBuildOf`) designs every person as a BMI and a muscle tendency. This file turns that into the coordinates the
 * mesh blends (pedMesh.ts `gridCoeffs`), using the BMI-equivalent of the source's figures MEASURED at the grid points (mesh volume x 1.01 kg/L over
 * stature squared; scripts/dev/base-bmi.mjs on the wh_*, *_old, teen_a / teen_b and mx_x shapes; the population groups differ by under 1 BMI).
 *
 * MakeHuman's two axes are not weight and muscle in the survey's sense: at average muscle the weight axis spans only BMI 19 to 23 (men); the very
 * heavy figures are MIN muscle with max weight (BMI 40); max muscle is the leaner, harder figure at every weight. So a design point keeps its muscle
 * when its BMI can be reached there inside SAFE, else the muscle is lowered (the weight is carried as fat), and for a BMI under the lightest figure at
 * that muscle the muscle is raised.
 */
export type AgeClassG = 'adult' | 'old' | 'teen' | 'kid';
export type SexG = 'm' | 'f' | 'x';
type Tab3 = [[number, number, number], [number, number, number], [number, number, number]];
/** rows muscle -1, 0, +1; columns weight -1, 0, +1. Children use the teen girl's table until child shapes exist. */
export const GRID_BMI: Record<AgeClassG, Record<SexG, Tab3>> = {
  adult: { m: [[13.8, 23.7, 39.6], [19.2, 21.1, 23.2], [18.0, 19.9, 30.7]], f: [[12.4, 21.5, 33.9], [16.5, 19.5, 22.3], [16.7, 19.0, 24.5]], x: [[13.0, 22.5, 36.8], [17.7, 20.2, 22.5], [17.3, 19.3, 27.4]] },
  old: { m: [[13.6, 21.9, 39.0], [18.7, 20.7, 22.2], [17.6, 19.6, 29.4]], f: [[12.4, 20.6, 32.9], [16.1, 18.7, 20.3], [16.4, 17.8, 23.2]], x: [[13.0, 21.3, 36.0], [17.4, 19.7, 21.3], [17.0, 18.7, 26.3]] },
  teen: { m: [[13.2, 21.0, 33.0], [17.5, 19.0, 20.6], [16.7, 18.6, 24.7]], f: [[10.9, 19.0, 29.9], [14.9, 17.1, 19.8], [15.1, 16.2, 20.0]], x: [[12.0, 20.0, 31.5], [16.2, 18.0, 20.2], [15.9, 17.4, 22.4]] },
  kid: { m: [[10.9, 19.0, 29.9], [14.9, 17.1, 19.8], [15.1, 16.2, 20.0]], f: [[10.9, 19.0, 29.9], [14.9, 17.1, 19.8], [15.1, 16.2, 20.0]], x: [[10.9, 19.0, 29.9], [14.9, 17.1, 19.8], [15.1, 16.2, 20.0]] },
};
/** how far the coordinates may go: past weight 1 only with average muscle or less (beyond the strong-and-heavy corner knees and thighs break into ledges); muscle not past 1 */
export const GRID_SAFE = { weight: [-1.05, 1.4] as const, muscle: [-1.05, 1] as const };
export const weightMax = (muscle: number): number => 1 + (GRID_SAFE.weight[1] - 1) * (1 - Math.max(0, muscle));
/** piecewise-linear weights of the three grid lines at t (nodes -1, 0, 1), extrapolating past the ends: the same blend as pedMesh.gridCoeffs */
const tri = (t: number): [number, number, number] => (t <= 0 ? [-t, 1 + t, 0] : [0, 1 - t, t]);
/** BMI-equivalent of the source's figure at (weight, muscle) */
export function gridBmi(weight: number, muscle: number, age: AgeClassG, sex: SexG): number {
  const T = GRID_BMI[age][sex], fm = tri(muscle), fw = tri(weight);
  let s = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s += fm[i] * fw[j] * T[i][j];
  return s;
}
/** the weight coordinate that gives `bmi` at muscle `m` (BMI rises with weight at every muscle on the measured table: bisection) */
export function gridWeightOf(bmi: number, m: number, age: AgeClassG, sex: SexG): number {
  let lo = -3, hi = 4;
  for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (gridBmi(mid, m, age, sex) < bmi) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
/** a design point (BMI, muscle tendency) as grid coordinates inside GRID_SAFE */
export function gridPointOf(bmi: number, muscle: number, age: AgeClassG, sex: SexG): { weight: number; muscle: number } {
  const [m0, m1] = GRID_SAFE.muscle;
  let m = Math.min(m1, Math.max(m0, muscle));
  for (let k = 0; k < 120 && m > m0 && gridBmi(weightMax(m), m, age, sex) < bmi; k++) m = Math.max(m0, m - 0.02);
  for (let k = 0; k < 120 && m < m1 && gridBmi(GRID_SAFE.weight[0], m, age, sex) > bmi; k++) m = Math.min(m1, m + 0.02);
  return { weight: Math.min(weightMax(m), Math.max(GRID_SAFE.weight[0], gridWeightOf(bmi, m, age, sex))), muscle: m };
}
