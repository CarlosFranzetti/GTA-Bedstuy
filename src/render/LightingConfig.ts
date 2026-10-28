/** Tunable lighting/reflection numbers in one place (owned by the lighting agent; main.ts only reads). */
export const LIGHTING = {
  /** scene.environmentIntensity by day / night */
  envIntensityDay: 0.18,
  envIntensityNight: 0.5,
  /** base exposure handed to the pipeline (auto-exposure multiplies it by hour) */
  exposure: 1.0,
  /** streetlight pool size by quality */
  lampPool: { low: 6, medium: 12, high: 12 },
  /** DayNight start hour */
  startHour: 17.5,
};
