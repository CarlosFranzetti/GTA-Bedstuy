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

/** One public stream of a live genre station that has several (RADIO3): picked at random on each tune-in, rotated now and then. */
export interface LiveSource {
  id: string;
  /** The broadcaster's own name for the stream (shown on the HUD while it plays). */
  name: string;
  /** The broadcaster's site (credit link, docs/CREDITS.md). */
  site: string;
  /** HTTPS stream URLs, first is primary; the rest are mirrors. */
  streams: readonly string[];
  nowPlaying?: LiveNowPlaying;
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
  /** Several verified public streams of the same genre (live-stream): one is picked at random per tune-in. `streams` is then the first one's. */
  pool?: readonly LiveSource[];
  /** Which scripted talk script runs the station (scripted). Default 'wbsy'. */
  script?: 'wbsy' | 'groupchat';
  /** DJ host (cast id) for SoundCloud stations. */
  dj?: string;
}

export const CATALOG: readonly CatalogEntry[] = [
  /* hip hop: first on the dial, this is Bed-Stuy. 13 DJ mixes from src/audio/sc/mixes.json (the old Universal Hip Hop Radio account holds two tracks from 2017: folded in) */
  { id: 'hiphop', name: 'Stoop Hip Hop Radio', kind: 'sc-account', group: 'hiphop', genre: 'hip hop DJ mixes', dj: 'tayo', site: 'https://soundcloud.com',
    about: 'Hip hop DJ mixes by a dozen different DJs, each from its own SoundCloud page through the official player, shuffled.', scUrls: ['https://soundcloud.com/uhhmradio/tracks'] },
  { id: 'beat', name: '181.FM The Beat', kind: 'live-stream', group: 'hiphop', genre: 'hip hop / R&B', site: 'https://www.181.fm',
    about: '181.FM The Beat, hip hop and R&B. Live public stream.', streams: ['https://listen.181fm.com/181-beat_128k.mp3'] },
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
  { id: 'rnsoul', name: 'Soul & Funk Live', kind: 'live-stream', group: 'soul', genre: 'soul / funk / R&B (live)', site: 'https://wfmu.org/',
    about: 'Three live public soul streams, one picked at random each time you tune in: WFMU Rock\'n\'Soul, 181.FM Soul and SomaFM Seven Inch Soul.',
    streams: ['https://stream0.wfmu.org/rocknsoul'],
    pool: [
      { id: 'rnsoul-wfmu', name: "WFMU Rock'n'Soul", site: 'https://wfmu.org/', streams: ['https://stream0.wfmu.org/rocknsoul'] },
      { id: 'rnsoul-181', name: '181.FM Soul', site: 'https://www.181.fm', streams: ['https://listen.181fm.com/181-soul_128k.mp3'] },
      { id: 'rnsoul-7inch', name: 'SomaFM Seven Inch Soul', site: 'https://somafm.com/7soul/', streams: ['https://ice2.somafm.com/7soul-128-mp3', 'https://ice6.somafm.com/7soul-128-mp3'],
        nowPlaying: { url: 'https://api.somafm.com/channels.json', shape: 'somafm', channel: '7soul' } },
    ] },
  /* Caribbean */
  { id: 'yard', name: 'SilverStarSound', kind: 'sc-account', group: 'caribbean', genre: 'dancehall / reggae / soca', dj: 'pearl', site: 'https://soundcloud.com/silver-star-sound',
    about: 'Dancehall, reggae and soca juggling sets from SilverStarSound, through the official SoundCloud player.', scUrls: ['https://soundcloud.com/silver-star-sound/tracks'] },
  /* Latin */
  { id: 'latin', name: 'DJ RubyTunes Latin', kind: 'sc-account', group: 'latin', genre: 'salsa / cumbia / reggaeton / bachata', dj: 'lucho', site: 'https://soundcloud.com/djrubytunes',
    about: 'Hour-long salsa, cumbia, reggaeton and bachata mixes from DJ RubyTunes, through the official SoundCloud player.', scUrls: ['https://soundcloud.com/djrubytunes/tracks'] },
  /* eclectic */
  { id: 'weird', name: 'The Lot Radio', kind: 'sc-account', group: 'eclectic', genre: 'Brooklyn: everything', dj: 'wren', site: 'https://www.thelotradio.com',
    about: 'Shows from The Lot Radio (Williamsburg, Brooklyn), from their SoundCloud through the official player.', scUrls: ['https://soundcloud.com/thelotradio/tracks'] },
  { id: 'wfmu', name: 'WFMU Live', kind: 'live-stream', group: 'eclectic', genre: 'freeform / world / oddities (Jersey City / NYC)', site: 'https://wfmu.org',
    about: "WFMU's three live public streams, one picked at random each time you tune in: WFMU Freeform, Give the Drummer Radio and Sheena's Jungle Room.",
    streams: ['https://stream0.wfmu.org/freeform-128k'],
    pool: [
      { id: 'wfmu-freeform', name: 'WFMU 91.1 Freeform', site: 'https://wfmu.org', streams: ['https://stream0.wfmu.org/freeform-128k'] },
      { id: 'wfmu-drummer', name: 'WFMU Give the Drummer Radio', site: 'https://wfmu.org', streams: ['https://stream0.wfmu.org/drummer'] },
      { id: 'wfmu-sheena', name: "WFMU Sheena's Jungle Room", site: 'https://wfmu.org', streams: ['https://stream0.wfmu.org/sheena'] },
    ] },
  { id: 'kexp', name: 'Indie & Rock Live', kind: 'live-stream', group: 'eclectic', genre: 'indie / rock / eclectic (live)', site: 'https://www.kexp.org',
    about: 'Live public streams of indie, rock and eclectic radio, one picked at random each time you tune in: KEXP 90.3 Seattle, 181.FM Rock 181, Radio Paradise Rock Mix and KCRW Eclectic24.',
    streams: ['https://kexp.streamguys1.com/kexp128.mp3'], nowPlaying: { url: 'https://api.kexp.org/v2/plays/?limit=1', shape: 'kexp' },
    pool: [
      { id: 'kexp-kexp', name: 'KEXP 90.3', site: 'https://www.kexp.org', streams: ['https://kexp.streamguys1.com/kexp128.mp3'], nowPlaying: { url: 'https://api.kexp.org/v2/plays/?limit=1', shape: 'kexp' } },
      { id: 'kexp-181rock', name: '181.FM Rock 181', site: 'https://www.181.fm', streams: ['https://listen.181fm.com/181-rock_128k.mp3'] },
      { id: 'kexp-rp-rock', name: 'Radio Paradise Rock Mix', site: 'https://radioparadise.com', streams: ['https://stream.radioparadise.com/rock-128'] },
      { id: 'kexp-kcrw', name: 'KCRW Eclectic24', site: 'https://www.kcrw.com', streams: ['https://streams.kcrw.com/e24_mp3'] },
    ] },
  /* 80s: SomaFM first, 181.FM Awesome 80s behind it (plays in Chromium; SomaFM refuses this sandbox) */
  { id: 'u80s', name: 'SomaFM Underground 80s', kind: 'live-stream', group: '80s', genre: '80s synthpop / new wave', site: 'https://somafm.com/u80s/',
    about: 'SomaFM Underground 80s, early 80s UK synthpop and new wave. Listener-supported, live public stream; falls back to 181.FM Awesome 80s if SomaFM cannot be reached.',
    streams: ['https://ice2.somafm.com/u80s-128-mp3', 'https://ice6.somafm.com/u80s-128-mp3', 'https://ice2.somafm.com/u80s-128-aac', 'https://listen.181fm.com/181-awesome80s_128k.mp3'],
    nowPlaying: { url: 'https://api.somafm.com/channels.json', shape: 'somafm', channel: 'u80s' },
    pool: [
      { id: 'u80s-soma', name: 'SomaFM Underground 80s', site: 'https://somafm.com/u80s/', streams: ['https://ice2.somafm.com/u80s-128-mp3', 'https://ice6.somafm.com/u80s-128-mp3', 'https://ice2.somafm.com/u80s-128-aac'],
        nowPlaying: { url: 'https://api.somafm.com/channels.json', shape: 'somafm', channel: 'u80s' } },
      { id: 'u80s-181', name: '181.FM Awesome 80s', site: 'https://www.181.fm', streams: ['https://listen.181fm.com/181-awesome80s_128k.mp3'] },
    ] },
  /* talk */
  { id: 'talk', name: 'WBSY Talk', kind: 'scripted', group: 'talk', genre: 'satire talk (scripted)', talk: true, site: '',
    about: 'Our own parody talk station: invented hosts, callers and ads, spoken by on-device synthesized voices.' },
  { id: 'groupchat', name: 'The Group Chat 99.9', kind: 'scripted', group: 'talk', genre: 'comedy group chat (scripted)', talk: true, script: 'groupchat', site: '',
    about: 'Our own parody comedy talk station: a group chat that went on the air, with invented voices. Own script.' },
  { id: 'wnyc', name: 'WNYC 93.9 FM', kind: 'live-stream', group: 'talk', genre: 'New York public radio: news and talk', talk: true, site: 'https://www.wnyc.org',
    about: 'WNYC New York Public Radio, live news and talk. Public stream.', streams: ['https://fm939.wnyc.org/wnycfm', 'https://stream.wnyc.org/wnycfm'] },
];

export function catalogEntry(id: string): CatalogEntry | undefined { return CATALOG.find((e) => e.id === id); }
export const LIVE_ENTRIES: readonly CatalogEntry[] = CATALOG.filter((e) => e.kind === 'live-stream');
