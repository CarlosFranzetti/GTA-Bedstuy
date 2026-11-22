/**
 * RADIO3: the curated SoundCloud mixes of every station, from ONE data file (./mixes.json).
 * Shape: { "<stationId>": [ { url, title, dj, checked, minutes? } ] }. Read tolerantly: a bad entry, a bad station key or a missing
 * file gives an empty pool, never an error. Entries are validated here (https, soundcloud.com, a track or set URL, no duplicates).
 * Nothing is downloaded: these are the links the official SoundCloud widget is asked to play.
 */
import raw from './mixes.json';

export interface CuratedMix {
  url: string;
  /** Title and DJ as researched; the live "now playing" line uses what the SoundCloud page reports once the widget is up. */
  title: string;
  dj: string;
  checked: 'page-opened' | 'search-result-only';
  /** Length in minutes when the research gave it (used for the random start point). */
  minutes?: number;
}

/** Station ids whose pool also takes entries filed under an older id (the 2-track UHH account was folded into hip hop). */
export const MIX_ALIASES: Readonly<Record<string, readonly string[]>> = { hiphop: ['stoop'] };
/** A usable pool has at least this many mixes; fewer and the station plays its account as before. */
export const MIN_POOL = 2;

const SC_HOSTS = new Set(['soundcloud.com', 'www.soundcloud.com']);

export function parseMix(o: unknown): CuratedMix | null {
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  if (typeof r.url !== 'string' || !/^https:\/\//i.test(r.url.trim())) return null;
  let u: URL;
  try { u = new URL(r.url.trim()); } catch { return null; }
  if (u.username || u.password || !SC_HOSTS.has(u.hostname.toLowerCase())) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length < 2 || !parts.every((p) => /^[A-Za-z0-9._~%-]+$/.test(p))) return null;
  const title = typeof r.title === 'string' ? r.title.trim().slice(0, 200) : '';
  const dj = typeof r.dj === 'string' ? r.dj.trim().slice(0, 120) : '';
  const checked = r.checked === 'page-opened' ? 'page-opened' : 'search-result-only';
  const m: CuratedMix = { url: `https://soundcloud.com/${parts.join('/')}`, title, dj, checked };
  if (typeof r.minutes === 'number' && Number.isFinite(r.minutes) && r.minutes > 0) m.minutes = r.minutes;
  return m;
}

/** Validated, de-duplicated pools by station id (the alias keys are merged into their station). */
export function parseMixes(data: unknown): Record<string, CuratedMix[]> {
  const out: Record<string, CuratedMix[]> = {};
  if (!data || typeof data !== 'object') return out;
  const src = data as Record<string, unknown>;
  const seen = new Set<string>();
  const take = (id: string, list: unknown, into: string): void => {
    if (!Array.isArray(list)) return;
    const pool = out[into] ?? (out[into] = []);
    for (const e of list) {
      const m = parseMix(e);
      if (!m || seen.has(`${into}|${m.url}`)) continue;
      seen.add(`${into}|${m.url}`);
      pool.push(m);
    }
  };
  for (const id of Object.keys(src)) {
    if (Object.values(MIX_ALIASES).some((a) => a.includes(id))) continue;
    take(id, src[id], id);
    for (const alias of MIX_ALIASES[id] ?? []) take(alias, src[alias], id);
  }
  return out;
}

const POOLS = parseMixes(raw);

/** The curated pool of a station (empty when there is none). */
export function mixesFor(id: string): readonly CuratedMix[] { return POOLS[id] ?? []; }
