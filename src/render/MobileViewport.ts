/**
 * iPhone Safari viewport quirks: after a rotation `innerWidth` / `innerHeight` are still the old values when `resize` first fires (and
 * `resize` can be skipped altogether), the dynamic toolbar changes the height without a rotation, and a page restored from the
 * back-forward cache or returning from the background can keep stale buffers. `installMobileViewportFixes(apply)` re-runs the
 * game's own resize (main.ts `applyResize`) at the moments that matters. Idempotent calls are cheap: `apply` only reallocates buffers
 * when the size or pixel ratio changed.
 */
export interface ViewportTarget {
  addEventListener(type: string, fn: (e?: Event) => void): void;
  removeEventListener(type: string, fn: (e?: Event) => void): void;
}

/** Delays (ms) after an orientation change at which the size is read again: iOS settles at about 100 to 500 ms. */
export const ORIENTATION_RETRY_MS = [60, 250, 600] as const;

export function installMobileViewportFixes(
  apply: () => void,
  win: ViewportTarget = window,
  doc: ViewportTarget & { hidden?: boolean } = document,
  setTimer: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms),
  visual: ViewportTarget | null = typeof window !== 'undefined' && window.visualViewport ? window.visualViewport : null,
): () => void {
  const timers: unknown[] = [];
  const later = (): void => { for (const ms of ORIENTATION_RETRY_MS) timers.push(setTimer(apply, ms)); };
  const onOrient = (): void => { apply(); later(); };
  const onShow = (e?: Event): void => { if ((e as PageTransitionEvent | undefined)?.persisted) { apply(); later(); } };
  const onVisible = (): void => { if (!doc.hidden) { apply(); later(); } };
  const onVisual = (): void => apply();
  win.addEventListener('orientationchange', onOrient);
  win.addEventListener('pageshow', onShow);
  doc.addEventListener('visibilitychange', onVisible);
  visual?.addEventListener('resize', onVisual);
  return () => {
    win.removeEventListener('orientationchange', onOrient);
    win.removeEventListener('pageshow', onShow);
    doc.removeEventListener('visibilitychange', onVisible);
    visual?.removeEventListener('resize', onVisual);
  };
}
