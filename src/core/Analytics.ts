/**
 * Page-view counting for the live site only (Vercel Web Analytics: no cookies, no personal data kept by the game).
 * It never runs in the single-file build, in the desktop apps, on localhost or in tests: the script is served by Vercel
 * under the site's own address, so anywhere else the request would only fail.
 */
export function analyticsAllowed(hosted: boolean, loc: { protocol: string; hostname: string } | undefined): boolean {
  if (!hosted || !loc) return false;
  if (loc.protocol !== 'https:') return false; // file:// (desktop app, single file) and plain http previews
  return !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(loc.hostname);
}

export function startAnalytics(): void {
  let hosted = false;
  try { hosted = import.meta.env?.VITE_HOSTED === '1'; } catch { hosted = false; }
  if (!analyticsAllowed(hosted, typeof location === 'undefined' ? undefined : location)) return;
  void import('@vercel/analytics').then((m) => m.inject()).catch(() => { /* blocked or offline: the game does not care */ });
}
