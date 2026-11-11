// Pure, electron-free policy code (unit tested): allowlists, CSP, path resolution, proxy mapping, window state.
import * as path from 'node:path';

export const APP_SCHEME = 'app';
export const APP_HOST = 'bedstuy';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
export const RA_UPSTREAM = 'https://ra-nyc.vercel.app/api';
export const RA_TIMEOUT_MS = 12000;

/** ONE list of remote hosts the app may talk to. Add hosts here only. Wildcards are "*.example.com". */
export const REMOTE_ALLOWLIST: readonly string[] = [
  'w.soundcloud.com',
  'api.soundcloud.com',
  'api-widget.soundcloud.com',
  'api-v2.soundcloud.com',
  'widget.sndcdn.com',
  '*.sndcdn.com',
  'cdn.jsdelivr.net', // kokoro-js library (lane VOX)
  'huggingface.co', // Kokoro model files (lane VOX)
  '*.huggingface.co',
  '*.hf.co',
  'ra-nyc.vercel.app',
];

export function hostAllowed(host: string, list: readonly string[] = REMOTE_ALLOWLIST): boolean {
  const h = host.toLowerCase();
  return list.some((e) => (e.startsWith('*.') ? h.endsWith(e.slice(1)) && h.length > e.length - 1 : h === e));
}

/** May the top-level window or a frame navigate to this URL? App origin only; soundcloud widget allowed (iframe). */
export function isAllowedNavigation(url: string, list: readonly string[] = REMOTE_ALLOWLIST): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol === `${APP_SCHEME}:`) return u.host === APP_HOST;
  if (u.protocol === 'https:') return hostAllowed(u.hostname, list) && u.hostname !== 'ra-nyc.vercel.app';
  if (u.protocol === 'about:') return u.href === 'about:blank';
  return u.protocol === 'blob:' || u.protocol === 'data:';
}

/** Top-level navigation is stricter: app origin only. */
export function isAppNavigation(url: string): boolean {
  try { const u = new URL(url); return u.protocol === `${APP_SCHEME}:` && u.host === APP_HOST; } catch { return false; }
}

/** Links that should open in the system browser. Only http(s). */
export function isExternalOpenable(url: string): boolean {
  try { const u = new URL(url); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
}

/**
 * Map an app:// request URL to a file under webRoot. Returns null on traversal, bad host, NUL bytes or escapes.
 * `/` and extensionless paths without a file fall back to index.html only for "/" (no SPA routing needed).
 */
export function resolveAppPath(requestUrl: string, webRoot: string): string | null {
  let u: URL;
  try { u = new URL(requestUrl); } catch { return null; }
  if (u.protocol !== `${APP_SCHEME}:` || u.host !== APP_HOST) return null;
  let p: string;
  try { p = decodeURIComponent(u.pathname); } catch { return null; }
  if (p.includes('\0') || p.includes('\\')) return null;
  if (p === '' || p.endsWith('/')) p += 'index.html';
  const root = path.resolve(webRoot);
  const full = path.resolve(root, '.' + path.posix.normalize('/' + p));
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

/** Map /ra-api/<rest>?q to the upstream URL; null if the path is not under /ra-api/. Never changes the host. */
export function mapRaApi(requestUrl: string, upstream: string = RA_UPSTREAM): string | null {
  let u: URL;
  try { u = new URL(requestUrl); } catch { return null; }
  if (u.protocol !== `${APP_SCHEME}:` || u.host !== APP_HOST) return null;
  if (!u.pathname.startsWith('/ra-api/')) return null;
  const rest = u.pathname.slice('/ra-api/'.length);
  if (rest.split('/').some((s) => s === '..' || s === '.')) return null;
  if (/%2e|%2f|\\/i.test(rest)) return null;
  return `${upstream}/${rest}${u.search}`;
}

export function buildCsp(list: readonly string[] = REMOTE_ALLOWLIST): string {
  const hosts = list.map((h) => `https://${h}`).join(' ');
  return [
    `default-src 'self'`,
    `script-src 'self' 'wasm-unsafe-eval' blob: https://w.soundcloud.com https://cdn.jsdelivr.net`,
    `worker-src 'self' blob:`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `media-src 'self' data: blob: ${hosts}`,
    `font-src 'self' data:`,
    `connect-src 'self' data: blob: ${hosts}`,
    `frame-src https://w.soundcloud.com`,
    `object-src 'none'`,
    `base-uri 'none'`,
    `form-action 'none'`,
  ].join('; ');
}

export interface WindowState { x?: number; y?: number; width: number; height: number; maximized: boolean; fullscreen: boolean }
export interface Rect { x: number; y: number; width: number; height: number }
export const DEFAULT_STATE: WindowState = { width: 1280, height: 800, maximized: false, fullscreen: false };

/** Validate persisted state; drop position if it is not visible on any current display. */
export function sanitizeState(raw: unknown, displays: Rect[]): WindowState {
  const s: WindowState = { ...DEFAULT_STATE };
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const w = num(r.width), h = num(r.height);
  if (w !== undefined && h !== undefined && w >= 640 && h >= 400 && w <= 10000 && h <= 10000) { s.width = Math.round(w); s.height = Math.round(h); }
  s.maximized = r.maximized === true;
  s.fullscreen = r.fullscreen === true;
  const x = num(r.x), y = num(r.y);
  if (x !== undefined && y !== undefined) {
    const visible = displays.some((d) => x + 100 > d.x && x < d.x + d.width - 100 && y >= d.y - 10 && y < d.y + d.height - 50);
    if (visible) { s.x = Math.round(x); s.y = Math.round(y); }
  }
  return s;
}

export interface Fsish {
  readFileSync(p: string, enc: 'utf8'): string;
  writeFileSync(p: string, data: string): void;
  mkdirSync(p: string, o: { recursive: true }): unknown;
}

export function loadState(fs: Fsish, file: string, displays: Rect[]): WindowState {
  try { return sanitizeState(JSON.parse(fs.readFileSync(file, 'utf8')), displays); } catch { return { ...DEFAULT_STATE }; }
}
export function saveState(fs: Fsish, file: string, state: WindowState): boolean {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(state)); return true; } catch { return false; }
}

/**
 * Query string for the game page from the app's command line, so a player can open the graphics debug overlay or force a tier in the
 * native app the same way as in a browser: `--debug-gfx` -> `debug=gfx`, `--q=low` (phone|low|medium|high) -> `q=low`. Anything else
 * is ignored (no free-form query reaches the page). Returns '' or a string starting with '?'.
 */
export function appQueryFromArgs(argv: readonly string[]): string {
  const p: string[] = [];
  if (argv.includes('--debug-gfx')) p.push('debug=gfx');
  const q = argv.map((a) => /^--q=(phone|low|medium|high)$/.exec(a)?.[1]).find(Boolean);
  if (q) p.push(`q=${q}`);
  return p.length ? `?${p.join('&')}` : '';
}
