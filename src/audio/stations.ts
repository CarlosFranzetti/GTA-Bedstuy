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
    about: 'Filmed club sets from Boiler Room, from their SoundCloud through the official player.', scUrls: ['https://soundcloud.com/platform/tracks'] },
  { id: 'dublab', name: 'Dekmantel Podcast', kind: 'sc-account', group: 'club', genre: 'techno / house / leftfield', dj: 'odell', site: 'https://www.dekmantel.com',
    about: 'The Dekmantel podcast series (Amsterdam), from their SoundCloud through the official player.', scUrls: ['https://soundcloud.com/dkmntl/tracks'] },
  { id: 'sc', name: 'Resident Advisor', kind: 'ra-pool', group: 'club', genre: 'RA NYC events + RA Podcast', dj: 'cass', site: 'https://ra.co',
    about: 'DJ sets by artists playing New York events (RA NYC) plus the RA Podcast, through the official SoundCloud player.', scUrls: ['https://soundcloud.com/resident-advisor/tracks'] },
  { id: 'flashback', name: 'Rinse FM', kind: 'sc-account', group: 'bass', genre: 'UK grime / garage / bass', dj: 'tommy', site: 'https://rinse.fm',
    about: 'Rinse FM shows from the Rinse SoundCloud, through the official player.', scUrls: ['https://soundcloud.com/rinsefm/tracks'] },
  /* soul / funk / disco */
  { id: 'boogie', name: 'Soulection', kind: 'sc-account', group: 'soul', genre: 'soul / beats / future funk', dj: 'lou', site: 'https://soulection.com',
    about: 'Soulection Radio episodes from the Soulection SoundCloud, through the official player.', scUrls: ['https://soundcloud.com/soulection/tracks'] },
  { id: 'rnsoul', name: "WFMU Rock'n'Soul", kind: 'live-stream', group: 'soul', genre: 'vintage soul / funk / R&B', site: 'https://wfmu.org/',
    about: "WFMU's Rock'n'Soul Radio, vintage soul, funk and R&B from Jersey City. Live public stream.", streams: ['https://stream0.wfmu.org/rocknsoul'] },
  /* hip hop */
  { id: 'stoop', name: 'Universal Hip Hop Radio', kind: 'sc-account', group: 'hiphop', genre: 'hip hop radio shows', dj: 'tayo', site: 'https://soundcloud.com/uhhmradio',
    about: 'Universal Hip Hop Radio shows (The Jam) from their SoundCloud, through the official player.', scUrls: ['https://soundcloud.com/uhhmradio/tracks'] },
  /* Caribbean */
  { id: 'yard', name: 'SilverStarSound', kind: 'sc-account', group: 'caribbean', genre: 'dancehall / reggae / soca', dj: 'pearl', site: 'https://soundcloud.com/silver-star-sound',
    about: 'Dancehall, reggae and soca juggling sets from SilverStarSound, through the official SoundCloud player.', scUrls: ['https://soundcloud.com/silver-star-sound/tracks'] },
  /* Latin */
  { id: 'latin', name: 'DJ RubyTunes Latin', kind: 'sc-account', group: 'latin', genre: 'salsa / cumbia / reggaeton / bachata', dj: 'lucho', site: 'https://soundcloud.com/djrubytunes',
    about: 'Hour-long salsa, cumbia, reggaeton and bachata mixes from DJ RubyTunes, through the official SoundCloud player.', scUrls: ['https://soundcloud.com/djrubytunes/tracks'] },
  /* eclectic */
  { id: 'weird', name: 'The Lot Radio', kind: 'sc-account', group: 'eclectic', genre: 'Brooklyn: everything', dj: 'wren', site: 'https://www.thelotradio.com',
    about: 'Shows from The Lot Radio (Williamsburg, Brooklyn), from their SoundCloud through the official player.', scUrls: ['https://soundcloud.com/thelotradio/tracks'] },
  { id: 'wfmu', name: 'WFMU 91.1', kind: 'live-stream', group: 'eclectic', genre: 'freeform (Jersey City / NYC)', site: 'https://wfmu.org',
    about: 'WFMU 91.1 FM, the longest-running freeform station in the US. Live public stream.', streams: ['https://stream0.wfmu.org/freeform-128k'] },
  { id: 'kexp', name: 'KEXP 90.3', kind: 'live-stream', group: 'eclectic', genre: 'Seattle: indie / world / rock', site: 'https://www.kexp.org',
    about: 'KEXP 90.3 FM Seattle, listener-supported. Live public stream with the current song from their open API.',
    streams: ['https://kexp.streamguys1.com/kexp128.mp3'], nowPlaying: { url: 'https://api.kexp.org/v2/plays/?limit=1', shape: 'kexp' } },
  /* 80s: SomaFM first, 181.FM Awesome 80s behind it (plays in Chromium; SomaFM refuses this sandbox) */
  { id: 'u80s', name: 'SomaFM Underground 80s', kind: 'live-stream', group: '80s', genre: '80s synthpop / new wave', site: 'https://somafm.com/u80s/',
    about: 'SomaFM Underground 80s, early 80s UK synthpop and new wave. Listener-supported, live public stream; falls back to 181.FM Awesome 80s if SomaFM cannot be reached.',
    streams: ['https://ice2.somafm.com/u80s-128-mp3', 'https://ice6.somafm.com/u80s-128-mp3', 'https://ice2.somafm.com/u80s-128-aac', 'https://listen.181fm.com/181-awesome80s_128k.mp3'],
    nowPlaying: { url: 'https://api.somafm.com/channels.json', shape: 'somafm', channel: 'u80s' } },
  /* talk */
  { id: 'talk', name: 'WBSY Talk', kind: 'scripted', group: 'talk', genre: 'satire talk (scripted)', talk: true, site: '',
    about: 'Our own parody talk station: invented hosts, callers and ads, spoken by on-device synthesized voices.' },
  { id: 'wnyc', name: 'WNYC 93.9 FM', kind: 'live-stream', group: 'talk', genre: 'New York public radio: news and talk', talk: true, site: 'https://www.wnyc.org',
    about: 'WNYC New York Public Radio, live news and talk. Public stream.', streams: ['https://fm939.wnyc.org/wnycfm', 'https://stream.wnyc.org/wnycfm'] },
];

export function catalogEntry(id: string): CatalogEntry | undefined { return CATALOG.find((e) => e.id === id); }
export const LIVE_ENTRIES: readonly CatalogEntry[] = CATALOG.filter((e) => e.kind === 'live-stream');
