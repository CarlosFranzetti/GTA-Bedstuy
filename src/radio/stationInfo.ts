/**
 * RADIOPAGE: what the /radio page knows about each station, built only from the game's own data (src/audio/stations.ts catalog,
 * src/audio/sc/mixes.json, SC_FREQ). Pure: no DOM, no network.
 */
import { CATALOG, SOURCE_BADGE, SOURCE_LABEL, type CatalogEntry, type RadioSourceKind } from '@/audio/stations';
import { SC_FREQ } from '@/audio/radio';
import { mixesFor, type CuratedMix } from '@/audio/sc/mixes';
import { djLinePool } from '@/audio/sc/djLines';
import { personaFor } from '@/audio/announcer/personas';

const ONES: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TENS: Record<string, number> = { eighty: 80, ninety: 90 };

/** "ninety-nine point one" -> "99.1", "one hundred and two point three" -> "102.3". Empty when it cannot be read. */
export function spokenFreq(s: string): string {
  const [a, b] = s.toLowerCase().replace(/-/g, ' ').split(' point ');
  let n = 0;
  for (const w of a.split(/\s+/)) {
    if (w === 'hundred') n *= 100;
    else if (w in TENS) n += TENS[w];
    else if (w in ONES) n += ONES[w];
    else if (w !== 'and' && w !== '') return '';
  }
  const d = b ? ONES[b.trim()] : undefined;
  return n > 0 && d !== undefined ? `${n}.${d}` : '';
}

/** Dial text where the game has one: the SoundCloud stations' announcer frequency, WNYC's and the Group Chat's own. Empty otherwise. */
export function freqOf(e: CatalogEntry): string {
  const sc = (SC_FREQ as Record<string, string>)[e.id];
  if (sc) return spokenFreq(sc);
  if (e.id === 'wnyc') return '93.9';
  if (e.id === 'groupchat') return '99.9';
  return '';
}

export interface StationInfo {
  id: string;
  name: string;
  kind: RadioSourceKind;
  badge: string;
  kindLabel: string;
  freq: string;
  genre: string;
  about: string;
  site: string;
  talk: boolean;
  /** Announcer name for the SoundCloud stations. */
  host: string;
  /** Curated mixes (SoundCloud stations that have a pool). */
  mixes: readonly CuratedMix[];
  /** The station's SoundCloud account or playlist pages. */
  scUrls: readonly string[];
  /** Public live streams (name, site, stream URLs) for live-stream stations. */
  streams: ReadonlyArray<{ name: string; site: string; urls: readonly string[] }>;
  /** Number of DJ-mention lines the announcer can say (intro, mid, thanks). */
  djLines: { intro: number; mid: number; thanks: number } | null;
}

export function stationInfo(e: CatalogEntry): StationInfo {
  const pool = e.pool?.map((p) => ({ name: p.name, site: p.site, urls: p.streams }));
  const sc = e.kind === 'sc-account' || e.kind === 'sc-playlist' || e.kind === 'ra-pool';
  return {
    id: e.id, name: e.name, kind: e.kind, badge: SOURCE_BADGE[e.kind], kindLabel: SOURCE_LABEL[e.kind], freq: freqOf(e), genre: e.genre,
    about: e.about, site: e.site, talk: !!e.talk,
    host: sc ? personaFor(e.id)?.name ?? '' : '',
    mixes: sc ? mixesFor(e.id) : [],
    scUrls: e.scUrls ?? [],
    streams: e.kind === 'live-stream' ? pool ?? [{ name: e.name, site: e.site, urls: e.streams ?? [] }] : [],
    djLines: sc ? { intro: djLinePool(e.id, 'intro').length, mid: djLinePool(e.id, 'mid').length, thanks: djLinePool(e.id, 'thanks').length } : null,
  };
}

/** Every catalog station in dial order. The page's dial must equal this (tests). */
export function allStations(): StationInfo[] { return CATALOG.map(stationInfo); }
