/**
 * The WAX DELI crates of REAL recordings under parody sleeves: ten public-domain "Pre-war dance floor" 78s (this file) and the open-licence
 * dance crate, 2005 to 2018 (src/game/danceRecords.ts).
 *
 * Every record is a REAL recording that is free to use, shown under an INVENTED artist, title, label and catalogue number with a sleeve painted
 * in code (src/ui/sleeve.ts). The truth (real performer, title, year, source, licence, attribution) is one tap away in the liner note
 * (src/ui/LinerNote.ts) and is listed in docs/CREDITS.md. Invented names were searched on MusicBrainz (docs/swarm/tasks/RECORDS2.md).
 *
 * Audio is NOT in the code bundle. Each record is a clip in `public/records/<id>.mp3`, made by `scripts/records/crate.py`, fetched only when a
 * record is previewed or loaded on a deck, and decoded one at a time. The single-file build has no `public/records/`, so the crates are
 * hosted-only (`archiveStock()` returns [] there) and the synthesised records remain.
 *
 * Legal basis. PREWAR: a sound recording first published in 1925 or earlier is out of federal protection in the United States from 1 Jan 2026
 * (17 U.S.C. 1401(a)(2); docs/swarm/tasks/RECORDS.md), and so are the compositions; licence code `PD-US`. DANCE: CC BY or CC BY-SA, see ALLOWED_LICENCES.
 */
import type { RecordDef } from './records';
import { DANCE_SPECS } from './danceRecords';

export type Licence = 'PD-US' | 'CC0-1.0' | 'CC-BY-2.0' | 'CC-BY-2.5' | 'CC-BY-3.0' | 'CC-BY-4.0' | 'CC-BY-SA-2.0' | 'CC-BY-SA-2.5' | 'CC-BY-SA-3.0' | 'CC-BY-SA-4.0';
/** No NC (the owner's rule) and no ND (a deck edits the audio). */
export const ALLOWED_LICENCES: readonly Licence[] = ['PD-US', 'CC0-1.0', 'CC-BY-2.0', 'CC-BY-2.5', 'CC-BY-3.0', 'CC-BY-4.0', 'CC-BY-SA-2.0', 'CC-BY-SA-2.5', 'CC-BY-SA-3.0', 'CC-BY-SA-4.0'];
/** The last first-publication year that is public domain in the US on 1 Jan 2026 (17 U.S.C. 1401(a)(2), 1923-1946 band: year + 100). */
export const PD_LAST_YEAR = 1925;

export type SleeveStyle = 'paper' | 'blocks' | 'sticker' | 'twelve' | 'promo' | 'picture' | 'minimal';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'grail';
export type Crate = 'prewar' | 'house' | 'techno' | 'breaks' | 'electro' | 'disco';

/** The truth behind a sleeve. Shown in the liner note and in docs/CREDITS.md. */
export interface Liner {
  performer: string;
  title: string;
  year: number;
  /** Label, catalogue number and date where the source gives them. */
  recorded: string;
  sourceName: string;
  sourceUrl: string;
  licence: Licence;
  /** The licence statement exactly as the source shows it (or that it shows none). */
  licenceText: string;
  /** Dance crate: the attribution line the licence requires (CC BY / BY-SA). */
  attribution?: string;
  /** Dance crate: what was changed (clip, fades, re-encode) and the share-alike note. */
  changes?: string;
  /** Dance crate: 'A' a second statement agrees with the licence field, 'B' only the field (docs/swarm/tasks/RECORDS2.md). */
  checked?: 'A' | 'B';
}

export interface ArchiveSpec {
  id: string;
  /** Invented. */
  artist: string; title: string; label: string; cat: string;
  genre: Crate; rarity: Rarity; price: number;
  /** Tempo in BPM: measured for beat-matched records, a genre default otherwise. */
  bpm: number;
  /** False for old recordings whose tempo drifts or that have no steady pulse: the decks say "free tempo". */
  beatMatched: boolean;
  sleeve: SleeveStyle; colors: [string, string];
  liner: Liner;
}

const IA = 'https://archive.org/details/';
const NONE = 'The item page shows no licence statement (collection: 78rpm).';
const MARK = 'Library of Congress item. Licence field: Public Domain Mark 1.0 (https://creativecommons.org/publicdomain/mark/1.0/).';
const PD_OLD = 'Licence field: Public Domain (http://creativecommons.org/licenses/publicdomain/).';

interface Row { id: string; a: string; t: string; l: string; c: string; g: Crate; r: Rarity; p: number; b: number; bm: boolean; s: SleeveStyle; k: [string, string]; who: string; real: string; y: number; rec: string; src: string; lic: string }

const ROWS: Row[] = [
  { id: 'ia-castle', a: 'The Brownstone Society Orchestra', t: 'Stoop Step Rag', l: 'Stuyvesant Talking Machine Co.', c: 'STM 3511', g: 'prewar', r: 'rare', p: 28, b: 100, bm: false, s: 'paper', k: ['#b5482f', '#2a1a12'], who: "Europe's Society Orchestra (James Reese Europe)", real: 'Castle House Rag (one-step)', y: 1914, rec: 'Victor 35372, recorded 10 Feb 1914', src: 'Europes_Society_Orch-Castle_Rag', lic: NONE },
  { id: 'ia-livery', a: 'The Original Pigeon Jass Band', t: 'Bodega Barnyard Blues', l: 'Fort Greene Phonograph Co.', c: 'FGP 7001', g: 'prewar', r: 'grail', p: 38, b: 110, bm: false, s: 'blocks', k: ['#e63946', '#1d1d2c'], who: 'Original Dixieland Jass Band', real: 'Livery Stable Blues', y: 1917, rec: 'Year as given on the Internet Archive item (recorded early 1917)', src: 'OriginalDixielandJassBand', lic: NONE },
  { id: 'ia-africa', a: 'The Original Throop Six', t: 'Fire Escape Fox Trot', l: 'Halsey Hi-Fi', c: 'HHF 4107', g: 'prewar', r: 'uncommon', p: 17, b: 110, bm: false, s: 'blocks', k: ['#ff9f1c', '#2ec4b6'], who: 'Original Memphis Five (Hanley)', real: 'Africa (fox trot)', y: 1924, rec: 'Recorded 21 Jul 1924; transfer from the Great 78 Project', src: '78_africa_original-memphis-five-hanley_gbia0101463a', lic: NONE },
  { id: 'ia-fouroclock', a: 'The Street Cleaning Five', t: 'Alternate Side Blues', l: 'Nostrand Novelty', c: 'NN 1450', g: 'prewar', r: 'uncommon', p: 18, b: 125.3, bm: true, s: 'blocks', k: ['#3a86ff', '#0b132b'], who: 'Original Memphis Five', real: "Four O'Clock Blues", y: 1923, rec: 'Vocalion 14506, recorded Feb 1923', src: 'Original_Memphis_Five-Four_O_Clock_Blues', lic: NONE },
  { id: 'ia-cakewalk', a: 'Gates Avenue Blue Five', t: 'Stoop Walking Babies', l: 'Gates Avenue Gramophone', c: 'GAG 1425', g: 'prewar', r: 'rare', p: 30, b: 117.9, bm: true, s: 'blocks', k: ['#2a9d8f', '#102a28'], who: "Clarence Williams' Blue Five", real: 'Cake Walking Babies from Home', y: 1925, rec: 'Year as given on the Internet Archive item (1924-25 sessions)', src: 'ClarenceWilliamsBlueFive', lic: NONE },
  { id: 'ia-stomp', a: "King Throop's Dance Band", t: 'Nostrand Stomp (Shimmy One-Step)', l: 'Tompkins Tone', c: 'TT 1300', g: 'prewar', r: 'grail', p: 36, b: 110, bm: false, s: 'blocks', k: ['#9b5de5', '#16082b'], who: "King Oliver's Jazz Band", real: 'New Orleans Stomp (Shimmy One Step)', y: 1923, rec: 'Columbia 13003-D, recorded 16 Oct 1923', src: 'king-olivers-jazz-band-new-orleans-stomp-shimmy-one-step-columbia-13003-d-81304-', lic: NONE },
  { id: 'ia-shake', a: 'Halsey Street Dixie Steppers', t: 'Shake Your Stoop', l: 'Marcy Disc Co.', c: 'MD 2310', g: 'prewar', r: 'uncommon', p: 19, b: 109.3, bm: true, s: 'blocks', k: ['#ffd60a', '#111111'], who: 'Fletcher Henderson', real: 'Shake Your Feet', y: 1923, rec: 'Year as given on the Internet Archive item', src: 'FletcherHenderson', lic: NONE },
  { id: 'ia-charleston', a: 'The Golden Stoop Orchestra', t: 'Charleston Place Fox Trot', l: 'Throop Records', c: 'TR 2504', g: 'prewar', r: 'common', p: 12, b: 100.2, bm: true, s: 'blocks', k: ['#f72585', '#240046'], who: 'Golden Gate Orchestra', real: 'Charleston (fox trot)', y: 1925, rec: 'Year as given on the Internet Archive item (from the Menlo Park collection)', src: 'charleston1925', lic: PD_OLD },
  { id: 'ia-mail', a: 'The Tompkins Ten', t: "Waitin' on the Mail Truck", l: 'Lewis Lane Records', c: 'LL 1923', g: 'prewar', r: 'common', p: 12, b: 136.7, bm: true, s: 'blocks', k: ['#06d6a0', '#073b4c'], who: 'Tennessee Ten', real: "Waitin' for the Evenin' Mail", y: 1923, rec: 'Recorded mid-1923 (item: Three Jazz Sides From 1923)', src: 'Tennessee_Ten-Three_Jazz_Sides_From_1923', lic: NONE },
  { id: 'ia-sisterkate', a: 'The Throop Avenue Shiverers', t: 'Shimmy Like My Cousin Kate', l: 'Marcy Disc Co.', c: 'MD 1925', g: 'prewar', r: 'common', p: 11, b: 130.7, bm: true, s: 'blocks', k: ['#ff70a6', '#3d1c3a'], who: 'The Virginians', real: 'I Wish I Could Shimmy Like My Sister Kate', y: 1923, rec: 'Year as given on the Internet Archive item', src: 'Virginians', lic: NONE },
];

const PREWAR_SPECS: readonly ArchiveSpec[] = ROWS.map((r) => ({
  id: r.id, artist: r.a, title: r.t, label: r.l, cat: r.c, genre: r.g, rarity: r.r, price: r.p, bpm: r.b, beatMatched: r.bm, sleeve: r.s, colors: r.k,
  liner: {
    performer: r.who, title: r.real, year: r.y, recorded: r.rec, sourceName: 'Internet Archive', sourceUrl: IA + r.src,
    licence: 'PD-US' as const,
    licenceText: `${r.lic} Public domain in the United States: sound recording first published in ${r.y} (17 U.S.C. 1401(a)(2)); the composition is also free there.`,
  },
}));

export const ARCHIVE_SPECS: readonly ArchiveSpec[] = [...DANCE_SPECS, ...PREWAR_SPECS];

export const CRATES: ReadonlyArray<{ id: Crate; label: string }> = [
  { id: 'house', label: 'House' }, { id: 'techno', label: 'Techno' }, { id: 'breaks', label: 'Breaks' }, { id: 'electro', label: 'Electro' },
  { id: 'disco', label: 'Disco & nu-disco' }, { id: 'prewar', label: 'Pre-war dance floor' },
];

export const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', grail: 'Grail' };

/** Shop records built from the specs. `ref` is the clip name under `public/records/`. */
export const ARCHIVE_RECORDS: readonly RecordDef[] = ARCHIVE_SPECS.map((s) => ({
  id: `arc:${s.id}`, title: s.title, artist: s.artist, genre: s.genre, price: s.price, bpm: s.bpm, colors: s.colors, kind: 'archive' as const, ref: s.id,
  beatMatched: s.beatMatched, rarity: s.rarity, year: s.liner.year, label: s.label, cat: s.cat, sleeve: s.sleeve,
}));

const specByRef = new Map(ARCHIVE_SPECS.map((s) => [s.id, s]));
/** The liner note of an archive record (looked up by catalogue, so saves stay small and old saves stay valid). */
export function linerFor(def: Pick<RecordDef, 'kind' | 'ref'>): Liner | undefined {
  return def.kind === 'archive' && def.ref ? specByRef.get(def.ref)?.liner : undefined;
}

export function isHostedBuild(): boolean {
  try { return (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_HOSTED === '1'; } catch { return false; }
}
/** What the shop sells from the archive: everything on the hosted build, nothing in the single-file build (no clip files there). */
export function archiveStock(hosted: boolean = isHostedBuild()): readonly RecordDef[] { return hosted ? ARCHIVE_RECORDS : []; }

/** Where a clip is served from (relative, so it works under any base path). */
export function archiveUrl(ref: string): string {
  let base = './';
  try { base = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? './'; } catch { /* default */ }
  return `${base.endsWith('/') ? base : base + '/'}records/${ref}.mp3`;
}
