/**
 * Which map a build starts on. The real-street map is the main map of the hosted site and the desktop apps (owner's
 * decision, 22 Nov 2026); `?map=grid` (or `?map=classic`) opens the older stylised grid. The single-file build carries
 * no real-street code or data, so it is always the grid. This module must never import from `roadnet/`.
 */
export type MapChoice = 'real' | 'grid';

/**
 * `handheld` is true on the phone tier. A phone with no `?map=` stays on the grid map: on 22 Nov the real map measured clearly heavier on the
 * emulated iPhone (boot peak 507 against 297 MB, steady heap 152 against 83 MB, see docs/swarm/tasks/MAINMAP.md) and has not been tried on a
 * real device, and the owner's iPhone used to crash at start for memory. `?map=real` on a phone is honoured (and is how the Map setting opts in).
 */
export function chooseMap(hosted: boolean, param: string | null, handheld = false): MapChoice {
  if (!hosted) return 'grid';
  if (param === 'grid' || param === 'classic') return 'grid';
  if (param === 'real') return 'real';
  return handheld ? 'grid' : 'real';
}

/** The map named by a `?map=` query string (e.g. `location.search`) on a hosted or native build; the single-file build is always the grid. */
export function currentMap(hosted: boolean, search: string, handheld = false): MapChoice {
  let p: string | null = null;
  try { p = new URLSearchParams(search).get('map'); } catch { /* no query */ }
  return chooseMap(hosted, p, handheld);
}

/**
 * The address that opens the other map, keeping every other query parameter and the hash. Real streets drop `?map=` (on a handheld
 * they must say `?map=real`, because a phone without it opens the grid), the classic grid sets `?map=grid`.
 */
export function mapSwitchUrl(href: string, next: MapChoice, handheld = false): string {
  const u = new URL(href);
  if (next === 'grid') u.searchParams.set('map', 'grid'); else if (handheld) u.searchParams.set('map', 'real'); else u.searchParams.delete('map');
  return u.toString();
}
