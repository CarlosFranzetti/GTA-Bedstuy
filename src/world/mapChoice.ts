/**
 * Which map a build starts on. The real-street map is the main map of the hosted site and the desktop apps (owner's
 * decision, 22 Nov 2026); `?map=grid` (or `?map=classic`) opens the older stylised grid. The single-file build carries
 * no real-street code or data, so it is always the grid. This module must never import from `roadnet/`.
 */
export type MapChoice = 'real' | 'grid';

export function chooseMap(hosted: boolean, param: string | null): MapChoice {
  if (!hosted) return 'grid';
  if (param === 'grid' || param === 'classic') return 'grid';
  return 'real';
}
