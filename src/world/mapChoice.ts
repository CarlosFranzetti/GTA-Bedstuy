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

/** The map named by a `?map=` query string (e.g. `location.search`) on a hosted or native build; the single-file build is always the grid. */
export function currentMap(hosted: boolean, search: string): MapChoice {
  let p: string | null = null;
  try { p = new URLSearchParams(search).get('map'); } catch { /* no query */ }
  return chooseMap(hosted, p);
}

/**
 * The address that opens the other map, keeping every other query parameter and the hash. Real streets drop `?map=`, the
 * classic grid sets `?map=grid`.
 */
export function mapSwitchUrl(href: string, next: MapChoice): string {
  const u = new URL(href);
  if (next === 'grid') u.searchParams.set('map', 'grid'); else u.searchParams.delete('map');
  return u.toString();
}
