/**
 * Position persistence across reloads. localStorage key 'gta-bedstuy.save.v1'.
 * Everything is wrapped in try/catch: a blocked or full store just means nothing persists.
 *
 * Usage: call `savePosition(state)` every frame (it throttles itself to one write per 5 s) and
 * `watchPagehide(() => state)` once so the last position is flushed when the page goes away.
 */
export const SAVE_KEY = 'gta-bedstuy.save.v1';
export const SAVE_INTERVAL_MS = 5000;

export interface SavedPosition {
  x: number;
  z: number;
  heading: number;
  /** Time of day, 0..24. */
  hour: number;
}

let lastWrite = -Infinity;
let pending: SavedPosition | null = null;

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function store(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

function write(p: SavedPosition): void {
  try { store()?.setItem(SAVE_KEY, JSON.stringify({ x: p.x, z: p.z, heading: p.heading, hour: p.hour })); } catch { /* quota / blocked */ }
}

/** Throttled save: writes at most once per `SAVE_INTERVAL_MS`; the latest state is kept for `flushPosition`. */
export function savePosition(p: SavedPosition, now: number = Date.now()): void {
  if (![p.x, p.z, p.heading, p.hour].every(finite)) return;
  pending = { x: p.x, z: p.z, heading: p.heading, hour: p.hour };
  if (now - lastWrite < SAVE_INTERVAL_MS) return;
  lastWrite = now;
  pending = null;
  write(p);
}

/** Writes any throttled-away state immediately (used on pagehide). */
export function flushPosition(): void {
  if (!pending) return;
  const p = pending;
  pending = null;
  lastWrite = Date.now();
  write(p);
}

/** Flushes the latest `getState()` on `pagehide` (and when the tab becomes hidden). Returns an unsubscribe. */
export function watchPagehide(getState: () => SavedPosition): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onHide = () => { try { savePosition(getState(), Infinity); } catch { /* ignore */ } };
  window.addEventListener('pagehide', onHide);
  return () => window.removeEventListener('pagehide', onHide);
}

/** Returns the saved position, or null when absent or invalid. */
export function loadPosition(): SavedPosition | null {
  try {
    const raw = store()?.getItem(SAVE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<SavedPosition>;
    if (!finite(o.x) || !finite(o.z) || !finite(o.heading) || !finite(o.hour)) return null;
    return { x: o.x, z: o.z, heading: o.heading, hour: o.hour };
  } catch { return null; }
}

export function clearPosition(): void {
  pending = null;
  lastWrite = -Infinity;
  try { store()?.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
