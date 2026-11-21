/**
 * The dance crate at WAX DELI: real, openly licensed dance tracks under parody sleeves.
 *
 * Rules (owner, 21 Nov 2026): dance records only, released 1980 to 2025, and ONLY under CC0, CC BY or CC BY-SA (any version, no NC, no ND).
 * Every row names the real artist, title, label, year, source page and the licence as the source shows it; the liner note prints them and the
 * attribution the licence requires. How each licence was checked is in `checked` (tier A: a second statement in the release notes or in the
 * file itself agrees with the item's licence field; tier B: the item's licence field, set by the label's own upload, is the only statement
 * reachable from the build box). Full evidence: docs/swarm/tasks/RECORDS2.md. No track from 1980 to 1999 could be cleared: see that file.
 *
 * Clips (60 s, stereo, 56 kbit/s MP3, about 410 kB) are made by scripts/records/crate.py and live in public/records/<id>.mp3.
 * A CC BY-SA clip is itself shared under the same licence (the liner note says so).
 */
import type { ArchiveSpec, Crate, Licence, Rarity, SleeveStyle } from './archiveRecords';

const IA = 'https://archive.org/details/';
const URL: Partial<Record<Licence, string>> = {
  'CC-BY-2.0': 'https://creativecommons.org/licenses/by/2.0/uk/', 'CC-BY-2.5': 'https://creativecommons.org/licenses/by/2.5/', 'CC-BY-3.0': 'https://creativecommons.org/licenses/by/3.0/',
  'CC-BY-SA-2.5': 'https://creativecommons.org/licenses/by-sa/2.5/', 'CC-BY-SA-3.0': 'https://creativecommons.org/licenses/by-sa/3.0/', 'CC-BY-SA-4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
};
const NAME: Partial<Record<Licence, string>> = {
  'CC-BY-2.0': 'CC BY 2.0 UK', 'CC-BY-2.5': 'CC BY 2.5', 'CC-BY-3.0': 'CC BY 3.0', 'CC-BY-SA-2.5': 'CC BY-SA 2.5', 'CC-BY-SA-3.0': 'CC BY-SA 3.0', 'CC-BY-SA-4.0': 'CC BY-SA 4.0',
};

interface Row {
  id: string;
  /** Invented sleeve credits. */
  a: string; t: string; l: string; c: string;
  g: Crate; r: Rarity; p: number; b: number; bm: boolean; s: SleeveStyle; k: [string, string];
  /** The truth. */
  who: string; real: string; label: string; y: number; item: string; lic: Licence; tier: 'A' | 'B'; shown: string; start: number;
  rec?: string;
}

const T_FIELD = (v: string): string => `Item page licence field: ${v}.`;
const TOUCAN_A = (v: string): string => `${T_FIELD(v)} Release notes: "All tracks are free to download under a Creative Commons licence". Audio file tag: copyright Toucan Music.`;
const TOUCAN_B = (v: string): string => `${T_FIELD(v)} Uploaded by the label (Toucan Music) itself. No second statement reachable from the build box (the label site does not answer).`;
const TEKTEK = (v: string): string => `${T_FIELD(v)} Uploaded by the label operator. The audio file tags name the rights holder and TekTek as publisher. The label site does not answer from the build box.`;

const ROWS: Row[] = [
  // ---- house
  { id: 'dc-anaconda', a: 'Stoop Surgeon', t: 'Bodega Python (Basement Mix)', l: 'Throop Basement Sound', c: 'TBS 017', g: 'electro', r: 'uncommon', p: 17, b: 130.0, bm: true, s: 'picture', k: ['#e07a1f', '#1b2a1f'],
    who: 'Beat Doctor', real: 'Anaconda (original mix)', label: 'Toucan Music (tou269, "Anaconda E.P.")', y: 2010, item: 'tou269', lic: 'CC-BY-3.0', tier: 'A', shown: TOUCAN_A('Attribution 3.0'), start: 40 },
  { id: 'dc-itchy', a: 'Scratch Card Syndicate', t: 'Lotto Fever (Dub Cut)', l: 'Throop Basement Sound', c: 'TBS 018', g: 'house', r: 'common', p: 13, b: 123.0, bm: true, s: 'picture', k: ['#2a9d8f', '#14213d'],
    who: 'Beat Doctor', real: 'Itchy And Scratchy', label: 'Toucan Music (tou269, "Anaconda E.P.")', y: 2010, item: 'tou269', lic: 'CC-BY-3.0', tier: 'A', shown: TOUCAN_A('Attribution 3.0'), start: 40 },
  { id: 'dc-aerial', a: 'Antenna Mary', t: 'Rooftop Aerial (Antenna Mix)', l: 'Halsey Heights Recordings', c: 'HHR 04', g: 'electro', r: 'uncommon', p: 16, b: 133.0, bm: true, s: 'picture', k: ['#4361ee', '#10002b'],
    who: 'Marc Burt & Beat Doctor', real: 'Aerial Photograph (Marc Burt mix)', label: 'Toucan Music (tou220)', y: 2006, item: 'tou220', lic: 'CC-BY-SA-2.5', tier: 'B', shown: TOUCAN_B('Attribution-ShareAlike 2.5'), start: 60 },
  { id: 'dc-house', a: 'Penny Pickle & the Stoop Kids', t: 'H.O.M.E. (Hip House Mix)', l: 'Corner Store Discs', c: 'CSD 301', g: 'house', r: 'rare', p: 22, b: 125.0, bm: true, s: 'picture', k: ['#f77f00', '#003049'],
    who: 'Pasquale', real: 'H.O.U.S.E', label: 'TekTek Music (tek07, "H.O.U.S.E EP")', y: 2006, item: 'tek07', lic: 'CC-BY-SA-2.5', tier: 'B', shown: TEKTEK('Attribution-ShareAlike 2.5'), start: 40 },
  { id: 'dc-sunshine', a: 'Pennyroyal Pete', t: 'Sunday Rent Come Back', l: 'Corner Store Discs', c: 'CSD 302', g: 'house', r: 'common', p: 12, b: 121.0, bm: true, s: 'picture', k: ['#ffbe0b', '#3a0ca3'],
    who: 'Pasquale', real: 'Sunshine Come Back', label: 'TekTek Music (tek07, "H.O.U.S.E EP")', y: 2006, item: 'tek07', lic: 'CC-BY-SA-2.5', tier: 'B', shown: TEKTEK('Attribution-ShareAlike 2.5'), start: 40 },
  { id: 'dc-iliketoknow', a: 'Lenox Lola', t: "Who's At The Door", l: 'Corner Store Discs', c: 'CSD 303', g: 'house', r: 'common', p: 12, b: 125.0, bm: true, s: 'picture', k: ['#d62828', '#1d3557'],
    who: 'Pasquale', real: 'I Like To Know', label: 'TekTek Music (tek07, "H.O.U.S.E EP")', y: 2006, item: 'tek07', lic: 'CC-BY-SA-2.5', tier: 'B', shown: TEKTEK('Attribution-ShareAlike 2.5'), start: 40 },
  // ---- techno
  { id: 'dc-caribbean', a: 'Kings Highway Collective', t: 'Carnival Vibes on Utica', l: 'Utica Avenue Tech', c: 'UAT 03', g: 'house', r: 'uncommon', p: 18, b: 125.0, bm: true, s: 'picture', k: ['#06d6a0', '#073b4c'],
    who: 'Das Boogie', real: 'Caribbean Vibes', label: 'TekTek (tek03, "Caribbean Vibes EP")', y: 2005, item: 'tek03', lic: 'CC-BY-SA-2.5', tier: 'B', shown: TEKTEK('Attribution-ShareAlike 2.5'), start: 60 },
  { id: 'dc-cuba', a: 'Kings Highway Collective', t: 'Rum and Coke at the Corner', l: 'Utica Avenue Tech', c: 'UAT 04', g: 'house', r: 'common', p: 14, b: 123.0, bm: true, s: 'picture', k: ['#ef476f', '#118ab2'],
    who: 'Das Boogie', real: 'Cuba Libre', label: 'TekTek (tek03, "Caribbean Vibes EP")', y: 2005, item: 'tek03', lic: 'CC-BY-SA-2.5', tier: 'B', shown: TEKTEK('Attribution-ShareAlike 2.5'), start: 60 },
  { id: 'dc-lineoffly', a: 'Pigeon Control Unit', t: 'Flight Path (Rooftop Coop)', l: 'Dollar Van Dispatch Records', c: 'DVD 10', g: 'house', r: 'rare', p: 24, b: 128.0, bm: true, s: 'picture', k: ['#8338ec', '#0b0b1a'],
    who: 'Battle Breaks', real: 'Line of Fly', label: 'Blue Oranges netlabel (bo010, "Line of Flight")', y: 2009, item: 'Bo010-BattleBreaks-LineOfFlight', lic: 'CC-BY-SA-3.0', tier: 'B',
    shown: `${T_FIELD('Attribution-ShareAlike 3.0')} Uploaded by the netlabel. Audio file tag gives the year 2009 (the item page shows no date). No second licence statement reachable.`, start: 60 },
  { id: 'dc-lineofflight', a: 'Pigeon Control Unit', t: 'Flight Path (Dub Techno)', l: 'Dollar Van Dispatch Records', c: 'DVD 11', g: 'house', r: 'uncommon', p: 19, b: 122.0, bm: true, s: 'picture', k: ['#3a86ff', '#001d3d'],
    who: 'Battle Breaks', real: 'Line of Flight', label: 'Blue Oranges netlabel (bo010, "Line of Flight")', y: 2009, item: 'Bo010-BattleBreaks-LineOfFlight', lic: 'CC-BY-SA-3.0', tier: 'B',
    shown: `${T_FIELD('Attribution-ShareAlike 3.0')} Uploaded by the netlabel. Audio file tag gives the year 2009 (the item page shows no date). No second licence statement reachable.`, start: 60 },
  // ---- breaks (tempo of these two is ambiguous: marked not beat-matched)
  { id: 'dc-powerline', a: 'The Blackout Brothers', t: 'Third Rail Breaks', l: 'Marcy Mixtapes', c: 'MM 12', g: 'breaks', r: 'uncommon', p: 17, b: 130.0, bm: false, s: 'picture', k: ['#fb5607', '#210b2c'],
    who: 'Psychadelik Pedestrian', real: 'Power Line (original mix)', label: 'Toucan Music (tou227)', y: 2006, item: 'tou227', lic: 'CC-BY-2.5', tier: 'B', shown: TOUCAN_B('Attribution 2.5'), start: 40 },
  { id: 'dc-cry', a: 'Lemon Ice Lenny', t: 'Cry Over Cold Ice', l: 'Marcy Mixtapes', c: 'MM 13', g: 'breaks', r: 'rare', p: 21, b: 135.0, bm: false, s: 'picture', k: ['#ffd60a', '#1b4332'],
    who: 'Psychadelik Pedestrian', real: 'Cry Over You (original mix)', label: 'Toucan Music (tou258)', y: 2009, item: 'tou258', lic: 'CC-BY-2.0', tier: 'B', shown: TOUCAN_B('Attribution 2.0 UK: England & Wales'), start: 60 },
  // ---- electro
  { id: 'dc-plasma', a: 'Sodium Vapor Kid', t: 'Streetlight Plasma', l: 'Afterhours Cut-Outs', c: 'AHC 05', g: 'electro', r: 'uncommon', p: 18, b: 137.0, bm: true, s: 'picture', k: ['#f72585', '#240046'],
    who: 'Redmann', real: 'Plasma (original mix)', label: 'Toucan Music (tou252, "God In The Detail E.P.")', y: 2008, item: 'tou252', lic: 'CC-BY-3.0', tier: 'B', shown: TOUCAN_B('Attribution 3.0'), start: 40 },
  // ---- disco and nu-disco
  { id: 'dc-aquadisco', a: 'Fire Hydrant Orchestra', t: 'Hydrant Disco (Italo Mix)', l: 'Gowanus Gold Records', c: 'GGR 11', g: 'disco', r: 'rare', p: 24, b: 137.0, bm: true, s: 'minimal', k: ['#00b4d8', '#03045e'],
    who: 'Aquatone', real: 'Magic AquaDisco', label: 'United Studios Cloud, USC-WR-1706.0364 ("Alpha Song")', y: 2018, item: 'aquatone-alpha-song', lic: 'CC-BY-SA-4.0', tier: 'A',
    shown: `${T_FIELD('Attribution-ShareAlike 4.0')} Release notes: "published under Creative Commons Attribution-ShareAlike 4.0 International license". Audio file tag: "CC BY-SA 4.0 Int'l". The item page dates it 2018; the file tag says 2016.`, start: 40 },
  { id: 'dc-alphasong', a: 'Fire Hydrant Orchestra', t: 'Alternate Side Song', l: 'Gowanus Gold Records', c: 'GGR 12', g: 'disco', r: 'uncommon', p: 19, b: 127.0, bm: true, s: 'minimal', k: ['#ff006e', '#3a0ca3'],
    who: 'Aquatone', real: 'Alpha Song', label: 'United Studios Cloud, USC-WR-1706.0364', y: 2018, item: 'aquatone-alpha-song', lic: 'CC-BY-SA-4.0', tier: 'A',
    shown: `${T_FIELD('Attribution-ShareAlike 4.0')} Release notes: "published under Creative Commons Attribution-ShareAlike 4.0 International license". Audio file tag: "CC BY-SA 4.0 Int'l". The item page dates it 2018; the file tag says 2016.`, start: 40 },
  { id: 'dc-run4', a: 'Rosalind Rooftop', t: 'Run 4 Da Shade', l: 'Gold Stoop Boogie', c: 'GSB 49', g: 'disco', r: 'uncommon', p: 18, b: 120.3, bm: true, s: 'minimal', k: ['#ff9f1c', '#2b2d42'],
    who: "Disco Romancin'", real: 'Run 4 Da Sun', label: 'Get Some! Records / The Daft Club (TDCDV003, "Disco Romance")', y: 2011, item: 'TDCDV003', lic: 'CC-BY-SA-3.0', tier: 'B',
    shown: `${T_FIELD('Attribution-ShareAlike 3.0')} Release notes: "All releases are under the Creative Commons License" (no version named). The notes flag sampled elements on other tracks of the release, not on this one.`, start: 40 },
  { id: 'dc-starburstz', a: 'Rosalind Rooftop', t: 'Streetlampz', l: 'Gold Stoop Boogie', c: 'GSB 50', g: 'disco', r: 'common', p: 14, b: 120.5, bm: true, s: 'minimal', k: ['#e5383b', '#161a1d'],
    who: "Disco Romancin'", real: 'Starburstz', label: 'Get Some! Records / The Daft Club (TDCDV003, "Disco Romance")', y: 2011, item: 'TDCDV003', lic: 'CC-BY-SA-3.0', tier: 'B',
    shown: `${T_FIELD('Attribution-ShareAlike 3.0')} Release notes: "All releases are under the Creative Commons License" (no version named). The notes flag sampled elements on other tracks of the release, not on this one.`, start: 40 },
  { id: 'dc-discodown', a: 'Mirrorball Marcy', t: 'Disco Downstairs', l: 'Gold Stoop Boogie', c: 'GSB 43', g: 'disco', r: 'common', p: 13, b: 127.0, bm: true, s: 'minimal', k: ['#7209b7', '#10002b'],
    who: "Disco Romancin'", real: 'Disco Down', label: 'Get Some! Records / The Daft Club (TDC043, "DiscoTech D\'Amour")', y: 2011, item: 'TDC043', lic: 'CC-BY-SA-3.0', tier: 'B',
    shown: `${T_FIELD('Attribution-ShareAlike 3.0')} Release notes: "All releases are under the Creative Commons License" (no version named). The notes flag sampled elements on other tracks of the release, not on this one.`, start: 40 },
];

const YEAR_NOTE = (): string => 'Year as shown on the source.';

export const DANCE_SPECS: readonly ArchiveSpec[] = ROWS.map((r) => {
  const bysa = r.lic.includes('-SA-');
  const lname = NAME[r.lic] ?? r.lic;
  const lurl = URL[r.lic] ?? '';
  const secs = 60;
  return {
    id: r.id, artist: r.a, title: r.t, label: r.l, cat: r.c, genre: r.g, rarity: r.r, price: r.p, bpm: r.b, beatMatched: r.bm, sleeve: r.s, colors: r.k,
    liner: {
      performer: r.who, title: r.real, year: r.y, recorded: `${r.label}. ${YEAR_NOTE()}`,
      sourceName: 'Internet Archive (release page)', sourceUrl: IA + r.item, licence: r.lic, licenceText: r.shown,
      attribution: `"${r.real}" by ${r.who}, ${r.label}, ${r.y}, ${IA + r.item}, licensed under ${lname} (${lurl}).`,
      changes: `Changes: clipped to ${secs} seconds (from ${Math.floor(r.start / 60)}:${String(r.start % 60).padStart(2, '0')}), faded in and out, re-encoded to 56 kbit/s MP3.${bysa ? ` This clip is shared under the same licence, ${lname}.` : ''}`,
      checked: r.tier,
    },
  };
});
