import type { Rng } from '@/core/Rng';

/**
 * Optional relief layers a painter can draw into while painting the colour map. Both contexts use the SAME
 * coordinate system as the colour canvas (the library pre-scales them), so painters just mirror their shapes.
 * `height`: grey levels, 128 = flat, darker = recessed. `rough`: grey levels, 255 = roughness 1 (null if unused).
 * `rng` is an independent generator for relief-only noise; painters must never use the main rng for aux-only
 * drawing, so the colour map is identical with or without aux.
 */
export interface Aux {
  height: CanvasRenderingContext2D;
  rough: CanvasRenderingContext2D | null;
  rng: Rng;
}

/** A procedural texture painter. Must be deterministic given the Rng and use only basic 2D calls. */
export type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng, variant: number, aux?: Aux) => void;

/** Browser canvas factory. Tests inject their own factory instead of using this. */
export function createCanvas(w: number, h: number): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    throw new Error('createCanvas needs a DOM; inject a canvasFactory into MaterialLibrary instead');
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
