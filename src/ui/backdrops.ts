/**
 * Backdrop shots for the title screen, the credits roll and the loading screen: clean in-engine pictures of our own world
 * (public/art/*.webp, 1920 wide, composed with the free camera and gently graded, see scripts/shots-plan.mjs and
 * scripts/title-art-grade.py). They ship with the hosted and native builds only; the single-file build has no art files, so
 * every consumer must work when none of them loads (a graded dark backdrop stands in).
 */
export interface Backdrop {
  /** File under public/art. */
  file: string;
  /** Short place line, for alt text and logs (never drawn over the picture). */
  caption: string;
  /** CSS object-position, so the subject stays on screen when the viewport is narrower than 16:9 (phone portrait). */
  pos: string;
}

export const BACKDROPS: readonly Backdrop[] = [
  { file: 'shot-car.webp', caption: 'A car on a brownstone block at golden hour', pos: '46% 55%' },
  { file: 'shot-el.webp', caption: 'Under the elevated line at dusk', pos: '47% 50%' },
  { file: 'shot-stoop.webp', caption: 'A stoop row in warm evening light', pos: '34% 55%' },
  { file: 'shot-wet.webp', caption: 'A wet night street under the elevated line', pos: '57% 55%' },
  { file: 'shot-avenue.webp', caption: 'An avenue at blue hour', pos: '50% 50%' },
];

/** URL of a backdrop file next to the page (relative, so it works from a sub-path and from the native shell). */
export function backdropUrl(doc: Document, file: string): string | null {
  try { return new URL(`art/${file}`, doc.baseURI).href; } catch { return null; }
}
