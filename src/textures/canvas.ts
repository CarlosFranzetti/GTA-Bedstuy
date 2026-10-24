import type { Rng } from '@/core/Rng';

/** A procedural texture painter. Must be deterministic given the Rng and use only basic 2D calls. */
export type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng, variant: number) => void;

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
