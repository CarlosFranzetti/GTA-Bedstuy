/**
 * The archive crate at WAX DELI: real recordings, parody sleeves.
 *
 * Every record here is a REAL recording that is free to use, shown under an INVENTED artist, title, label and catalogue number
 * with a sleeve painted in code (src/ui/sleeve.ts). The truth (real performer, title, year, source, licence) is one tap away in the
 * liner note (src/ui/LinerNote.ts) and is listed in docs/CREDITS.md. Nothing here is a real artist's name: invented names were
 * searched on MusicBrainz (docs/swarm/tasks/RECORDS.md).
 *
 * Audio is NOT in the code bundle. Each record is a clip (80 s, mono, 22 kHz, 40 kbit/s MP3, about 400 kB) in `public/records/<id>.mp3`,
 * made by `scripts/records/crate.py` from the Internet Archive item named in `source`, fetched only when a record is previewed or
 * loaded on a deck, and decoded one at a time. The single-file build has no `public/records/`, so the crate is hosted-only
 * (`archiveStock()` returns [] there) and the synthesised records remain.
 *
 * Legal basis (checked 21 Nov 2026 against 17 U.S.C. 1401(a)(2): see docs/swarm/tasks/RECORDS.md): a sound recording first
 * published in 1925 or earlier is out of federal protection in the United States from 1 Jan 2026, and so are the compositions.
 * The licence code for such a record is `PD-US`. Allowed licences for any future record: see ALLOWED_LICENCES.
 */
import type { RecordDef } from './records';

export type Licence = 'PD-US' | 'CC0-1.0' | 'CC-BY-4.0' | 'CC-BY-3.0' | 'CC-BY-SA-4.0' | 'CC-BY-SA-3.0';
/** No NC (the owner's rule) and no ND (a deck edits the audio). */
export const ALLOWED_LICENCES: readonly Licence[] = ['PD-US', 'CC0-1.0', 'CC-BY-4.0', 'CC-BY-3.0', 'CC-BY-SA-4.0', 'CC-BY-SA-3.0'];
/** The last first-publication year that is public domain in the US on 1 Jan 2026 (17 U.S.C. 1401(a)(2), 1923-1946 band: year + 100). */
export const PD_LAST_YEAR = 1925;

export type SleeveStyle = 'paper' | 'blocks' | 'sticker';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'grail';
export type Crate = 'ragtime' | 'jazz' | 'blues' | 'gospel' | 'islands';

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
const NONE = 'No licence statement on the item page (collection: 78rpm). The page shows the date below.';
const MARK = 'Library of Congress item. Licence field: Public Domain Mark 1.0 (https://creativecommons.org/publicdomain/mark/1.0/).';
const PD_OLD = 'Licence field: Public Domain (http://creativecommons.org/licenses/publicdomain/).';

interface Row { id: string; a: string; t: string; l: string; c: string; g: Crate; r: Rarity; p: number; b: number; bm: boolean; s: SleeveStyle; k: [string, string]; who: string; real: string; y: number; rec: string; src: string; lic: string }

const ROWS: Row[] = [
  // ---- ragtime
  { id: 'ia-castle', a: 'The Brownstone Society Orchestra', t: 'Stoop Step Rag', l: 'Stuyvesant Talking Machine Co.', c: 'STM 3511', g: 'ragtime', r: 'rare', p: 28, b: 100, bm: false, s: 'paper', k: ['#b5482f', '#2a1a12'], who: "Europe's Society Orchestra (James Reese Europe)", real: 'Castle House Rag (one-step)', y: 1914, rec: 'Victor 35372, recorded 10 Feb 1914', src: 'Europes_Society_Orch-Castle_Rag', lic: NONE },
  { id: 'ia-drag', a: 'The Dulcimer Man of DeKalb', t: 'Cymbal Drag on Throop', l: 'Marcy Disc Co.', c: 'MD 1797', g: 'ragtime', r: 'rare', p: 24, b: 100, bm: false, s: 'paper', k: ['#d9a441', '#3a2412'], who: 'Joseph Moskowitz (cimbalom)', real: 'Panama-Pacific Drag', y: 1916, rec: 'Victor 17978, recorded 4 Feb 1916', src: 'Joseph_Moskowitz-Panama_Pacific_Drag', lic: NONE },
  { id: 'ia-pickle', a: 'Xylophone Phil & the Deli Counter', t: 'Pickle Barrel Rag', l: 'Corner Store Discs', c: 'CSD 22', g: 'ragtime', r: 'common', p: 11, b: 100, bm: false, s: 'paper', k: ['#6b8f4e', '#1d2a16'], who: 'William H. Reitz (xylophone)', real: 'Dill Pickles Rag', y: 1922, rec: 'Year as given on the Internet Archive item', src: 'WilliamHReitz', lic: NONE },
  { id: 'ia-banjo', a: 'Banjo Bernard & the Lenox Four', t: 'Stoop Pickings', l: 'Brownstone Phonograph', c: 'BP 1693', g: 'ragtime', r: 'rare', p: 26, b: 100, bm: false, s: 'paper', k: ['#8d5a2b', '#f2e3c6'], who: 'Fred Van Eps (banjo, with uncredited piano)', real: 'Rag Pickings', y: 1911, rec: 'Victor 16934, recorded 31 Jan 1911', src: 'Fred_Van_Eps-Rag_Pickings', lic: NONE },
  // ---- jazz and dance
  { id: 'ia-livery', a: 'The Original Pigeon Jass Band', t: 'Bodega Barnyard Blues', l: 'Fort Greene Phonograph Co.', c: 'FGP 7001', g: 'jazz', r: 'grail', p: 38, b: 110, bm: false, s: 'blocks', k: ['#e63946', '#1d1d2c'], who: 'Original Dixieland Jass Band', real: 'Livery Stable Blues', y: 1917, rec: 'Year as given on the Internet Archive item (recorded early 1917)', src: 'OriginalDixielandJassBand', lic: NONE },
  { id: 'ia-africa', a: 'The Original Throop Six', t: 'Fire Escape Fox Trot', l: 'Halsey Hi-Fi', c: 'HHF 4107', g: 'jazz', r: 'uncommon', p: 17, b: 110, bm: false, s: 'blocks', k: ['#ff9f1c', '#2ec4b6'], who: 'Original Memphis Five (Hanley)', real: 'Africa (fox trot)', y: 1924, rec: 'Recorded 21 Jul 1924; transfer from the Great 78 Project', src: '78_africa_original-memphis-five-hanley_gbia0101463a', lic: NONE },
  { id: 'ia-fouroclock', a: 'The Street Cleaning Five', t: 'Alternate Side Blues', l: 'Nostrand Novelty', c: 'NN 1450', g: 'jazz', r: 'uncommon', p: 18, b: 125.3, bm: true, s: 'blocks', k: ['#3a86ff', '#0b132b'], who: 'Original Memphis Five', real: "Four O'Clock Blues", y: 1923, rec: 'Vocalion 14506, recorded Feb 1923', src: 'Original_Memphis_Five-Four_O_Clock_Blues', lic: NONE },
  { id: 'ia-cakewalk', a: 'Gates Avenue Blue Five', t: 'Stoop Walking Babies', l: 'Gates Avenue Gramophone', c: 'GAG 1425', g: 'jazz', r: 'rare', p: 30, b: 117.9, bm: true, s: 'blocks', k: ['#2a9d8f', '#102a28'], who: "Clarence Williams' Blue Five", real: 'Cake Walking Babies from Home', y: 1925, rec: 'Year as given on the Internet Archive item (1924-25 sessions)', src: 'ClarenceWilliamsBlueFive', lic: NONE },
  { id: 'ia-stomp', a: "King Throop's Dance Band", t: 'Nostrand Stomp (Shimmy One-Step)', l: 'Tompkins Tone', c: 'TT 1300', g: 'jazz', r: 'grail', p: 36, b: 110, bm: false, s: 'blocks', k: ['#9b5de5', '#16082b'], who: "King Oliver's Jazz Band", real: 'New Orleans Stomp (Shimmy One Step)', y: 1923, rec: 'Columbia 13003-D, recorded 16 Oct 1923', src: 'king-olivers-jazz-band-new-orleans-stomp-shimmy-one-step-columbia-13003-d-81304-', lic: NONE },
  { id: 'ia-shake', a: 'Halsey Street Dixie Steppers', t: 'Shake Your Stoop', l: 'Marcy Disc Co.', c: 'MD 2310', g: 'jazz', r: 'uncommon', p: 19, b: 109.3, bm: true, s: 'blocks', k: ['#ffd60a', '#111111'], who: 'Fletcher Henderson', real: 'Shake Your Feet', y: 1923, rec: 'Year as given on the Internet Archive item', src: 'FletcherHenderson', lic: NONE },
  { id: 'ia-charleston', a: 'The Golden Stoop Orchestra', t: 'Charleston Place Fox Trot', l: 'Throop Records', c: 'TR 2504', g: 'jazz', r: 'common', p: 12, b: 100.2, bm: true, s: 'blocks', k: ['#f72585', '#240046'], who: 'Golden Gate Orchestra', real: 'Charleston (fox trot)', y: 1925, rec: 'Year as given on the Internet Archive item (from the Menlo Park collection)', src: 'charleston1925', lic: PD_OLD },
  { id: 'ia-mail', a: 'The Tompkins Ten', t: "Waitin' on the Mail Truck", l: 'Lewis Lane Records', c: 'LL 1923', g: 'jazz', r: 'common', p: 12, b: 136.7, bm: true, s: 'blocks', k: ['#06d6a0', '#073b4c'], who: 'Tennessee Ten', real: "Waitin' for the Evenin' Mail", y: 1923, rec: 'Recorded mid-1923 (item: Three Jazz Sides From 1923)', src: 'Tennessee_Ten-Three_Jazz_Sides_From_1923', lic: NONE },
  { id: 'ia-rhapsody', a: 'Hanson Place Concert Orchestra', t: 'Rhapsody in Brownstone (Part 1)', l: 'Bedford Brass Label', c: 'BBL 55', g: 'jazz', r: 'rare', p: 27, b: 100, bm: false, s: 'blocks', k: ['#5f0f40', '#fb8b24'], who: 'Paul Whiteman and His Orchestra, with George Gershwin (piano)', real: 'Rhapsody in Blue, Part 1', y: 1924, rec: 'Acoustic recording, 1924 (Menlo Park collection)', src: 'rhapblue11924', lic: NONE },
  { id: 'ia-sisterkate', a: 'The Throop Avenue Shiverers', t: 'Shimmy Like My Cousin Kate', l: 'Marcy Disc Co.', c: 'MD 1925', g: 'jazz', r: 'common', p: 11, b: 130.7, bm: true, s: 'blocks', k: ['#ff70a6', '#3d1c3a'], who: 'The Virginians', real: 'I Wish I Could Shimmy Like My Sister Kate', y: 1923, rec: 'Year as given on the Internet Archive item', src: 'Virginians', lic: NONE },
  { id: 'ia-birmingham', a: 'Slim Stoop at the Ivories', t: 'Bushwick Blues (Piano Solo)', l: 'Kosciuszko Kut', c: 'KK 4757', g: 'jazz', r: 'grail', p: 35, b: 110, bm: false, s: 'paper', k: ['#264653', '#e9c46a'], who: 'Fats Waller (piano)', real: 'Birmingham Blues', y: 1922, rec: 'Recorded about 21 Oct 1922 (date marked approximate on the item); transfer from the Great 78 Project', src: '78_birmingham-blues_fats-waller_gbia0388856b', lic: NONE },
  // ---- blues
  { id: 'ia-crazy', a: 'Marcy Mae & Her Jazz Pigeons', t: 'Crazy Rent Blues', l: 'Fulton Fidelity', c: 'FF 4169', g: 'blues', r: 'grail', p: 38, b: 90, bm: false, s: 'paper', k: ['#c1121f', '#fdf0d5'], who: 'Mamie Smith and Her Jazz Hounds', real: 'Crazy Blues', y: 1920, rec: 'Year as given on the Internet Archive item (recorded Aug 1920)', src: 'MamieSmithHerJazzHounds', lic: NONE },
  { id: 'ia-gulf', a: 'Gowanus Gertie', t: 'Gowanus Canal Blues', l: 'Fulton Fidelity', c: 'FF 3301', g: 'blues', r: 'grail', p: 36, b: 90, bm: false, s: 'paper', k: ['#2a6f6b', '#0e2523'], who: 'Bessie Smith, with Clarence Williams (piano)', real: 'Gulf Coast Blues', y: 1923, rec: 'Recorded 16 Feb 1923; digitised by the Library of Congress Packard Campus, National Jukebox', src: 'loc-jukebox-670192-gulf-coast-blues', lic: MARK },
  { id: 'ia-chicago', a: 'Sweet Lorraine of Lexington', t: 'Brooklyn Bound Blues', l: 'Fulton Fidelity', c: 'FF 3398', g: 'blues', r: 'rare', p: 28, b: 90, bm: false, s: 'paper', k: ['#7b2d26', '#f2e3c6'], who: 'Bessie Smith, with Fletcher Henderson (piano)', real: 'Chicago Bound Blues', y: 1923, rec: 'Recorded 4 Dec 1923; digitised by the Library of Congress Packard Campus, National Jukebox', src: 'loc-jukebox-672304-chicago-bound-blues', lic: MARK },
  { id: 'ia-everybody', a: 'Miss Lenox Lil', t: "Everybody's Landlord Blues", l: 'Quarter Water Music', c: 'QW 45', g: 'blues', r: 'rare', p: 24, b: 90, bm: false, s: 'paper', k: ['#d9822b', '#2b1b0e'], who: 'Lucille Hegamin', real: "Everybody's Blues", y: 1920, rec: 'Bell P-45, recorded 15 Nov 1920', src: 'Lucille_Hegamin-Everybodys_Blues', lic: NONE },
  { id: 'ia-strut', a: "Lenora Lane's Stepping Band", t: "Strollin' Down Fulton Blues", l: 'Stoop Side', c: 'SS 7', g: 'blues', r: 'uncommon', p: 16, b: 90, bm: false, s: 'paper', k: ['#4a6fa5', '#0b132b'], who: 'Leona Williams and Her Jazz Band', real: "Struttin' Blues", y: 1922, rec: 'Recorded 14 Mar 1922', src: 'Leona_Williams-Struttin_Blues', lic: NONE },
  { id: 'ia-advertise', a: 'Clarice Stuyvesant', t: "Don't Post Your Man on the Stoop", l: 'Nostrand Novelty', c: 'NN 2142', g: 'blues', r: 'uncommon', p: 17, b: 90, bm: false, s: 'paper', k: ['#8d3b72', '#241024'], who: 'Clara Smith', real: "Don't Advertise Your Man", y: 1924, rec: 'Recorded 23 Apr 1924', src: 'Clara_Smith-Dont_Advertise_Your_Man', lic: NONE },
  { id: 'ia-glide', a: 'Miss Water Main & the Blue Jazz Six', t: 'The Brooklyn Glide', l: 'Halsey Hi-Fi', c: 'HHF 4402', g: 'blues', r: 'uncommon', p: 18, b: 90, bm: false, s: 'paper', k: ['#1d7874', '#f4e9cd'], who: "Ethel Waters, with Albury's Blue and Jazz Seven", real: 'The New York Glide', y: 1921, rec: 'May 1921; transfer from the Great 78 Project', src: '78_the-new-york-glide_ethel-waters-alburys-blue-and-jazz-seven-tom-delaney_gbia0275389b', lic: NONE },
  // ---- gospel and spirituals
  { id: 'ia-fisk-swing', a: 'The Marcy Avenue Jubilee Four', t: 'Brownstone Chariot', l: 'Stuyvesant Talking Machine Co.', c: 'STM 1645', g: 'gospel', r: 'rare', p: 26, b: 80, bm: false, s: 'paper', k: ['#5f0f40', '#e9c46a'], who: 'Fisk University Jubilee Quartet', real: 'Swing Low, Sweet Chariot', y: 1909, rec: 'Victor 16453-A, Dec 1909', src: 'fisk-university-jubilee-quartet-swing-low-sweet-chariot-victor-16453-a', lic: NONE },
  { id: 'ia-fisk-slippers', a: 'The Marcy Avenue Jubilee Four', t: 'Golden Sneakers', l: 'Stuyvesant Talking Machine Co.', c: 'STM 1646', g: 'gospel', r: 'rare', p: 26, b: 80, bm: false, s: 'paper', k: ['#b08d2b', '#1d1608'], who: 'Fisk University Jubilee Quartet', real: 'Golden Slippers', y: 1909, rec: 'Victor 16453-B, Dec 1909', src: 'fisk-university-jubilee-quartet-golden-slippers-victor-16453-b', lic: NONE },
  { id: 'ia-bethel', a: 'The Alternate Side Gospel Four', t: "Ain't It a Shame to Park on Sunday", l: 'Lewis Lane Records', c: 'LL 6744', g: 'gospel', r: 'uncommon', p: 16, b: 80, bm: false, s: 'paper', k: ['#3d405b', '#f2cc8f'], who: 'Bethel Jubilee Quartet', real: "Ain't It a Shame to Work on Sunday", y: 1923, rec: 'Recorded 12 Jul 1923; digitised by the Library of Congress Packard Campus, National Jukebox', src: 'loc-jukebox-67444-ain-t-it-a-shame-to-work-on-sunday', lic: MARK },
  { id: 'ia-southern4', a: 'The Throop Heights Quartet', t: 'Sweet Fire Escape Chariot', l: 'Fort Greene Phonograph Co.', c: 'FGP 8311', g: 'gospel', r: 'uncommon', p: 17, b: 80, bm: false, s: 'paper', k: ['#6d597a', '#f4e9cd'], who: 'The Southern Four', real: 'Swing Low, Sweet Chariot', y: 1921, rec: 'Edison Diamond Disc 51364-R, recorded 7 Dec 1921 (National Park Service, Edison NHP collection)', src: 'EDIS-SRP-0196-01', lic: PD_OLD },
  // ---- strings and islands
  { id: 'ia-ferera', a: 'Palm Tree on Putnam Duo', t: 'Rooftop Blues (Guitar Duet)', l: 'Throop Records', c: 'TR 5067', g: 'islands', r: 'uncommon', p: 15, b: 100, bm: false, s: 'blocks', k: ['#06a77d', '#f1faee'], who: 'Ferera and Paalihu (Hawaiian guitars)', real: 'Southern Blues (guitar duet)', y: 1924, rec: 'Edison Blue Amberol 5067, about 1924 (Edison NHP collection)', src: 'southern1924', lic: PD_OLD },
  { id: 'ia-hawaiian', a: 'The Royal Roofline Hawaiians', t: 'Rooftop Luau Waltz', l: 'Brownstone Phonograph', c: 'BP 1770', g: 'islands', r: 'rare', p: 23, b: 100, bm: false, s: 'blocks', k: ['#ee6c4d', '#293241'], who: 'Irene West Royal Hawaiians (Palie K. Lua and David K. Kaili, guitars)', real: 'Hawaiian Waltz Medley', y: 1914, rec: 'Victor 17701-A, recorded 16 Dec 1914', src: 'Irene_West_Royal_Hawaiians_Hawaiian_Waltz_Medly_Hawaiian_Guitar_Duet_', lic: NONE },
];

export const ARCHIVE_SPECS: readonly ArchiveSpec[] = ROWS.map((r) => ({
  id: r.id, artist: r.a, title: r.t, label: r.l, cat: r.c, genre: r.g, rarity: r.r, price: r.p, bpm: r.b, beatMatched: r.bm, sleeve: r.s, colors: r.k,
  liner: {
    performer: r.who, title: r.real, year: r.y, recorded: r.rec, sourceName: 'Internet Archive', sourceUrl: IA + r.src,
    licence: 'PD-US' as const,
    licenceText: `${r.lic} Public domain in the United States: sound recording first published in ${r.y} (17 U.S.C. 1401(a)(2)); the composition is also free there.`,
  },
}));

export const CRATES: ReadonlyArray<{ id: Crate; label: string }> = [
  { id: 'ragtime', label: '78s: Ragtime' }, { id: 'jazz', label: '78s: Jazz & dance' }, { id: 'blues', label: '78s: Blues' },
  { id: 'gospel', label: '78s: Gospel' }, { id: 'islands', label: '78s: Strings' },
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
