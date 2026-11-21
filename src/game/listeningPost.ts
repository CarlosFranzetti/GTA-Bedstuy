/**
 * The WAX DELI listening post: real commercial dance records, STREAMED through SoundCloud's own player and nothing else (owner rule 8).
 *
 * Nothing here is downloaded, cached, re-hosted or put on the decks: a row is a parody sleeve plus a button that opens SoundCloud's official
 * embedded player (an iframe at w.soundcloud.com), which shows the real artist and title itself. The liner link goes to the track's official page.
 *
 * A track may be listed only when ALL of these were checked on the day it was added (docs/swarm/tasks/RECORDS2.md):
 *  1. the SoundCloud account is the artist's or label's own: it carries the verified badge AND the artist's or label's own website links to it;
 *  2. the track page says embedding is allowed (`embeddable_by: all`);
 *  3. the release date is between 1980 and 2025.
 * The owner can add more by appending to LISTENING_POST (a track he chooses; check the same three things).
 */
import type { SleeveStyle } from './archiveRecords';

export interface PostTrack {
  id: string;
  /** Invented sleeve credits. */
  artist: string; title: string; label: string; cat: string;
  genre: string; sleeve: SleeveStyle; colors: [string, string];
  /** The real track: exactly what the official player shows. */
  real: { artist: string; title: string; label: string; year: number };
  /** The official SoundCloud track page (https://soundcloud.com/<account>/<track>). */
  url: string;
  account: { name: string; url: string; site: string };
  /** What was checked, and when. */
  checked: string;
}

const KOMPAKT = { name: 'Kompakt', url: 'https://soundcloud.com/kompakt', site: 'https://kompakt.fm (links to soundcloud.com/kompakt)' };
const CHECK = 'Checked 21 Nov 2026: account verified (badge), linked from the label site, track embeddable by all, release date as shown.';

export const LISTENING_POST: readonly PostTrack[] = [
  { id: 'post-liath', artist: 'Quarter Water Kid', title: 'Lyath Avenue', label: 'Brownstone Deep Cuts', cat: 'BDC 01', genre: 'techno house', sleeve: 'minimal', colors: ['#3a86ff', '#10002b'],
    real: { artist: 'Kölsch', title: 'Liath', label: 'Kompakt', year: 2017 }, url: 'https://soundcloud.com/kompakt/kolsch-liath', account: KOMPAKT, checked: CHECK },
  { id: 'post-oblivion', artist: 'Who Moved My Car', title: 'Oblivious Parking', label: 'Brownstone Deep Cuts', cat: 'BDC 02', genre: 'house', sleeve: 'minimal', colors: ['#ff006e', '#240046'],
    real: { artist: 'WhoMadeWho & Mano Le Tough', title: 'Oblivion', label: 'Kompakt', year: 2020 }, url: 'https://soundcloud.com/kompakt/wmw_mlt', account: KOMPAKT, checked: CHECK },
  { id: 'post-wacker', artist: 'Fulton Street Machine Shop', title: 'Wacker on Fulton', label: 'Brownstone Deep Cuts', cat: 'BDC 03', genre: 'electro', sleeve: 'minimal', colors: ['#fb8500', '#023047'],
    real: { artist: 'T.Raumschmiere', title: 'Wacker', label: 'Kompakt', year: 2017 }, url: 'https://soundcloud.com/kompakt/traumschmiere-wacker', account: KOMPAKT, checked: CHECK },
  { id: 'post-taciturn', artist: 'Quiet Car Collective', title: 'Taciturn Taxi', label: 'Brownstone Deep Cuts', cat: 'BDC 04', genre: 'techno', sleeve: 'minimal', colors: ['#06d6a0', '#0b132b'],
    real: { artist: 'Kollmorgen', title: 'Taciturn', label: 'Kompakt', year: 2022 }, url: 'https://soundcloud.com/kompakt/kollmorgen-taciturn', account: KOMPAKT, checked: CHECK },
];

/** The URL of SoundCloud's own player for a track page. Only soundcloud.com track URLs are accepted. */
export function postEmbedSrc(trackUrl: string): string | null {
  let u: URL;
  try { u = new URL(trackUrl); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'soundcloud.com') return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length < 2 || !parts.every((p) => /^[A-Za-z0-9._~%-]+$/.test(p))) return null;
  return `https://w.soundcloud.com/player/?url=${encodeURIComponent(`https://soundcloud.com/${parts.join('/')}`)}&auto_play=true&visual=false&show_comments=false&hide_related=true`;
}
