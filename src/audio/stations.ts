/**
 * The 15-station dial as data. Every station has a source rule (a `RadioSource` kind) so the director treats them alike:
 *   sc-account   SoundCloud account tracks, played through the official widget (load the account URL, getSounds, skip to a random set)
 *   sc-playlist  SoundCloud playlist, same widget path
 *   ra-pool      the RA NYC event pool (src/audio/sc/RaFeed.ts), optionally blended with an account
 *   live-stream  a public internet-radio stream in an HTMLAudioElement (src/audio/live/LiveStation.ts)
 *   scripted     WBSY Talk: synthesized multi-voice shows (src/audio/voice)
 * Nothing here is bundled audio. Order is grouped by genre; the dial walks it top to bottom.
 */

export type RadioSourceKind = 'sc-account' | 'sc-playlist' | 'ra-pool' | 'live-stream' | 'scripted';

export const SOURCE_BADGE: Record<RadioSourceKind, string> = {
  'sc-account': 'SC', 'sc-playlist': 'SC', 'ra-pool': 'RA', 'live-stream': 'LIVE', scripted: 'TALK',
};
export const SOURCE_LABEL: Record<RadioSourceKind, string> = {
  'sc-account': 'SoundCloud account (official player)', 'sc-playlist': 'SoundCloud playlist (official player)',
  'ra-pool': 'RA NYC event pool (official player)', 'live-stream': 'Live internet radio stream', scripted: 'Scripted talk show (synthesized voices)',
};

export interface LiveNowPlaying {
  url: string;
  /** Which public JSON shape the station exposes (all verified to send Access-Control-Allow-Origin). */
  shape: 'kexp' | 'somafm';
  /** SomaFM channel id in channels.json. */
  channel?: string;
}

export interface CatalogEntry {
  id: string;
  /** Real station or series name. */
  name: string;
  kind: RadioSourceKind;
  /** Genre group the dial is ordered by. */
  group: string;
  genre: string;
  /** Talk/news format (two stations). */
  talk?: boolean;
  /** One-line "about this station" shown in the UI. */
  about: string;
  /** The station's own site (credit link). */
  site: string;
  /** SoundCloud account / playlist URLs (sc-account, sc-playlist, ra-pool). */
  scUrls?: readonly string[];
  /** Public stream URLs, HTTPS only, first is primary (live-stream). */
  streams?: readonly string[];
  nowPlaying?: LiveNowPlaying;
  /** DJ host (cast id) for SoundCloud stations. */
  dj?: string;
}

export const CATALOG: readonly CatalogEntry[] = [
  /* club / electronic */
  { id: 'bkhouse', name: 'Boiler Room', kind: 'sc-account', group: 'club', genre: 'club sets / house / techno', dj: 'deja', site: 'https://boilerroom.tv',
    about: 'Filmed club sets from Boiler Room, streamed from their SoundCloud through the official player.', scUrls: ['https://soundcloud.com/platform/tracks'] },
  { id: 'dublab', name: 'Dekmantel Podcast', kind: 'sc-account', group: 'club', genre: 'techno / house / leftfield', dj: 'odell', site: 'https://www.dekmantel.com',
    about: 'The Dekmantel podcast series (Amsterdam), streamed from their SoundCloud through the official player.', scUrls: ['https://soundcloud.com/dkmntl/tracks'] },
  { id: 'sc', name: 'Resident Advisor', kind: 'ra-pool', group: 'club', genre: 'RA NYC events + RA Podcast', dj: 'cass', site: 'https://ra.co',
    about: 'DJ sets by artists playing New York events (RA NYC) plus the RA Podcast, streamed through the official SoundCloud player.', scUrls: ['https://soundcloud.com/resident-advisor/tracks'] },
  /* eclectic / experimental */
  { id: 'weird', name: 'Mixmag', kind: 'sc-account', group: 'eclectic', genre: 'club / electronic mixes', dj: 'wren', site: 'https://mixmag.net',
    about: 'Mixmag Lab and mix series from the Mixmag SoundCloud, through the official player.', scUrls: ['https://soundcloud.com/mixmag-1/tracks'] },
  { id: 'flashback', name: 'FACT Mixes', kind: 'sc-account', group: 'eclectic', genre: 'bass / electronic mixes', dj: 'tommy', site: 'https://www.factmag.com',
    about: 'FACT magazine mix series archive (180.Fact SoundCloud), through the official player.', scUrls: ['https://soundcloud.com/180fact/tracks'] },
  /* hip hop / soul / uk */
  { id: 'stoop', name: 'Rinse FM', kind: 'sc-account', group: 'urban', genre: 'UK club / grime / garage', dj: 'tayo', site: 'https://rinse.fm',
    about: 'Rinse FM shows from the Rinse SoundCloud, through the official player.', scUrls: ['https://soundcloud.com/rinsefm/tracks'] },
  { id: 'boogie', name: 'Soulection', kind: 'sc-account', group: 'urban', genre: 'soul / beats / future funk', dj: 'lou', site: 'https://soulection.com',
    about: 'Soulection Radio episodes from the Soulection SoundCloud, through the official player.', scUrls: ['https://soundcloud.com/soulection/tracks'] },
  { id: 'yard', name: 'The Lot Radio', kind: 'sc-account', group: 'urban', genre: 'Brooklyn: everything', dj: 'pearl', site: 'https://www.thelotradio.com',
    about: 'Shows from The Lot Radio (Greenpoint, Brooklyn), from their SoundCloud through the official player.', scUrls: ['https://soundcloud.com/thelotradio/tracks'] },
  /* live music streams */
  { id: 'dublive', name: 'dublab', kind: 'live-stream', group: 'live', genre: 'LA: leftfield / ambient / beats', site: 'https://www.dublab.com',
    about: 'dublab, a listener-supported radio project from Los Angeles. Live public stream.', streams: ['https://dublab.out.airtime.pro/dublab_a'] },
  { id: 'kexp', name: 'KEXP 90.3', kind: 'live-stream', group: 'live', genre: 'Seattle: indie / world / rock', site: 'https://www.kexp.org',
    about: 'KEXP 90.3 FM Seattle, listener-supported. Live public stream with the current song from their open API.',
    streams: ['https://kexp.streamguys1.com/kexp128.mp3'], nowPlaying: { url: 'https://api.kexp.org/v2/plays/?limit=1', shape: 'kexp' } },
  { id: 'rparadise', name: 'Radio Paradise', kind: 'live-stream', group: 'live', genre: 'eclectic rock / world', site: 'https://radioparadise.com',
    about: 'Radio Paradise, listener-supported eclectic radio. Live public stream (128k).', streams: ['https://stream.radioparadise.com/mp3-128', 'https://stream.radioparadise.com/aac-128'] },
  { id: 'wfmu', name: 'WFMU 91.1', kind: 'live-stream', group: 'live', genre: 'freeform (Jersey City / NYC)', site: 'https://wfmu.org',
    about: 'WFMU 91.1 FM, the longest-running freeform station in the US. Live public stream.', streams: ['https://stream0.wfmu.org/freeform-128k'] },
  /* 80s */
  { id: 'u80s', name: 'SomaFM Underground 80s', kind: 'live-stream', group: '80s', genre: '80s synthpop / new wave', site: 'https://somafm.com/u80s/',
    about: 'SomaFM Underground 80s, early 80s UK synthpop and new wave. Listener-supported, live public stream.',
    streams: ['https://ice2.somafm.com/u80s-128-mp3', 'https://ice6.somafm.com/u80s-128-mp3', 'https://ice2.somafm.com/u80s-128-aac'],
    nowPlaying: { url: 'https://api.somafm.com/channels.json', shape: 'somafm', channel: 'u80s' } },
  /* talk */
  { id: 'talk', name: 'WBSY Talk', kind: 'scripted', group: 'talk', genre: 'satire talk (scripted)', talk: true, site: '',
    about: 'Our own parody talk station: invented hosts, callers and ads, spoken by on-device synthesized voices.' },
  { id: 'wnyc', name: 'WNYC 93.9 FM', kind: 'live-stream', group: 'talk', genre: 'New York public radio: news and talk', talk: true, site: 'https://www.wnyc.org',
    about: 'WNYC New York Public Radio, live news and talk. Public stream.', streams: ['https://fm939.wnyc.org/wnycfm', 'https://stream.wnyc.org/wnycfm'] },
];

export function catalogEntry(id: string): CatalogEntry | undefined { return CATALOG.find((e) => e.id === id); }
export const LIVE_ENTRIES: readonly CatalogEntry[] = CATALOG.filter((e) => e.kind === 'live-stream');
