/**
 * Music station definitions and genre keyword matching for the user's own music library.
 * No audio ships with the game: slots hold files the player picks from their own device.
 */

export type LibraryStationId = 'pop' | 'eighties' | 'rap' | 'house' | 'trap' | 'psych' | 'folky' | 'jazzrock';

export interface LibraryStationDef {
  id: LibraryStationId;
  /** Parody station name shown on the HUD. */
  name: string;
  /** Number of slots in the playlist. */
  slots: number;
  /** Short jingle/ID line (shown in the UI; the jingle itself is procedural). */
  tagline: string;
  /** Keywords as documented in docs/RADIO.md (informational; matching uses `pattern`). */
  keywords: string[];
  /** Matched against folder names and file names (lower case). */
  pattern: RegExp;
}

/** Word-ish boundary so "pop" does not match "popular" and "rap" does not match "rapture". */
const w = (alts: string): RegExp => new RegExp(`(?:^|[^a-z0-9])(?:${alts})(?:$|[^a-z0-9])`);

export const LIBRARY_STATIONS: readonly LibraryStationDef[] = [
  { id: 'pop', name: 'Bed-Stuy Pop FM', slots: 15, tagline: 'Hits from the stoop to the roof', keywords: ['pop'], pattern: w('pop') },
  { id: 'eighties', name: 'Flashback 80s', slots: 12, tagline: 'Leg warmers and boom boxes', keywords: ['80s', '1980', 'eighties'], pattern: /(?:^|[^0-9a-z])(?:80s|80's|80 s|eighties|198\d(?:s)?)(?:$|[^0-9a-z])/ },
  { id: 'rap', name: 'Throop Rap Radio', slots: 13, tagline: 'Straight off the Throop stoop', keywords: ['rap', 'hip-hop'], pattern: w('rap|hip[- ]?hop|boom[- ]?bap') },
  { id: 'house', name: 'Garvey House & Dub', slots: 22, tagline: 'Four on the floor, bass on the wall', keywords: ['house', 'dub', 'techno'], pattern: w('house|dub|techno') },
  { id: 'trap', name: 'Marcy Trap & Plug 808', slots: 25, tagline: 'Hi-hats rolling down Marcy', keywords: ['trap', 'drill', '808', 'plug'], pattern: w('trap|drill|808|plug') },
  { id: 'psych', name: 'Hazy Tompkins Weird Radio', slots: 28, tagline: 'Weird. Wired. Dreamy.', keywords: ['psych', 'psychedelic', 'dream', 'indie', 'weird', 'wired', 'synthpop', 'lo-fi'], pattern: w('psych(?:edelic)?|dream(?:y|pop)?|indie|weird|wired|synth[- ]?pop|lo[- ]?fi') },
  { id: 'folky', name: 'Lewis Ave Echo-Dub Folk', slots: 16, tagline: 'Strum it, echo it, dub it', keywords: ['folk', 'echo', 'dub', 'reverb', 'shoegaze', 'post-rock'], pattern: w('folk|echo(?:[- ]?dub)?|reverb|shoegaze|post[- ]?rock') },
  { id: 'jazzrock', name: 'Nostrand Jazz-Rock Gets Lit', slots: 16, tagline: 'Walking bass, burning solos', keywords: ['jazz', 'fusion', 'jazz-rock', 'funk', 'prog'], pattern: w('jazz(?:[- ]?rock)?|fusion|funk|prog(?:ressive)?') },
];

export const TOTAL_SLOTS = LIBRARY_STATIONS.reduce((n, s) => n + s.slots, 0);

export function stationDef(id: LibraryStationId): LibraryStationDef {
  const d = LIBRARY_STATIONS.find((s) => s.id === id);
  if (!d) throw new Error(`unknown library station ${id}`);
  return d;
}

export function isStationId(v: unknown): v is LibraryStationId {
  return typeof v === 'string' && LIBRARY_STATIONS.some((s) => s.id === v);
}

/**
 * Match order when one name hits several genres: the more specific genre wins ("trap" before "rap",
 * "80s" before "pop"). Bare "dub" is House & Dub; "echo-dub" is the folky station.
 */
const PRIORITY: LibraryStationId[] = ['trap', 'jazzrock', 'folky', 'psych', 'eighties', 'rap', 'house', 'pop'];

function matchText(text: string): LibraryStationId | null {
  const t = text.toLowerCase();
  const hits = LIBRARY_STATIONS.filter((s) => s.pattern.test(t)).map((s) => s.id);
  if (hits.length === 0) return null;
  // Bare "dub" belongs to House & Dub; the folky station only claims it with echo/reverb/folk company.
  if (hits.includes('folky') && hits.includes('house') && !/folk|echo|reverb|shoegaze|post[- ]?rock/.test(t)) {
    hits.splice(hits.indexOf('folky'), 1);
  }
  return PRIORITY.find((id) => hits.includes(id)) ?? hits[0];
}

/**
 * Guesses a station from a file path. The nearest folder name wins over the parent folders, and the
 * file name is checked last; "Hip-Hop/Nas - song.mp3" is Rap, "Mixes/House/track.mp3" is House & Dub.
 */
export function classifyGenre(path: string): LibraryStationId | null {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const file = parts[parts.length - 1];
  const dirs = parts.slice(0, -1).reverse();
  for (const d of dirs) {
    const m = matchText(d);
    if (m) return m;
  }
  return matchText(file);
}

const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba|webm|mp4)$/i;

export function isAudioFile(name: string, type = ''): boolean {
  return type.startsWith('audio/') || AUDIO_EXT.test(name);
}

/** File name without folders or extension: what the HUD shows as now playing. */
export function trackTitle(path: string): string {
  const file = path.split(/[\\/]+/).filter(Boolean).pop() ?? path;
  return file.replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/_/g, ' ').trim() || 'Untitled';
}

export const naturalCompare = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
