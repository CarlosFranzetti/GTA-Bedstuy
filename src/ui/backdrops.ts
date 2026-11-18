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

/**
 * Illustrated loading posters (public/art/loading/*.webp): original graphic-novel style pictures, one character and one place
 * each. The loading screen prefers them: as soon as one has loaded it shows posters only; until then, and in a build without
 * them, the in-engine shots above stand in. The prompts they are made from are in docs/swarm/art/loading-prompts.md.
 */
export const POSTERS: readonly Backdrop[] = [
  { file: 'loading/poster-taxi.webp', caption: 'A woman leaning on a yellow taxi at sunset', pos: '50% 40%' },
  { file: 'loading/poster-grocer.webp', caption: 'A grocer outside his corner shop in the morning', pos: '50% 40%' },
  { file: 'loading/poster-rider.webp', caption: 'A delivery rider under the elevated line at night', pos: '50% 45%' },
  { file: 'loading/poster-dj.webp', caption: 'A radio DJ at the decks at dusk', pos: '50% 40%' },
  { file: 'loading/poster-stoop.webp', caption: 'Two friends on a stoop on a summer afternoon', pos: '50% 45%' },
  { file: 'loading/poster-detective.webp', caption: 'A detective by an unmarked car in the rain', pos: '50% 40%' },
];

/** Everything the loading screen may show: the shots first (their indexes are those of BACKDROPS), then the posters. */
export const LOADING_ART: readonly Backdrop[] = [...BACKDROPS, ...POSTERS];
export const isPoster = (i: number): boolean => i >= BACKDROPS.length;
/** The pictures to cycle through, given the indexes (into LOADING_ART) that have loaded: posters only once any poster is in. */
export function artPool(ready: readonly number[]): number[] {
  const posters = ready.filter(isPoster);
  return posters.length > 0 ? posters : [...ready];
}

/** URL of a backdrop file next to the page (relative, so it works from a sub-path and from the native shell). */
export function backdropUrl(doc: Document, file: string): string | null {
  try { return new URL(`art/${file}`, doc.baseURI).href; } catch { return null; }
}
