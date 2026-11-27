/**
 * BOOMBOX: one original emblem per station, drawn in code from a small kit: a badge shape, three colours, a pictogram and a short
 * wordmark in the game's display font. Real stations keep their real names as text elsewhere; the emblem is ours, never their logo.
 * Pure strings, no DOM (the strings are static data plus the escaped wordmark).
 */
export type Shape = 'circle' | 'hex' | 'square' | 'diamond' | 'shield' | 'ticket' | 'burst' | 'oval' | 'arch' | 'octagon';
export type Glyph =
  | 'gauge' | 'stoop' | 'pulse' | 'speaker' | 'door' | 'crown' | 'ball' | 'disc45' | 'sun' | 'gem' | 'container' | 'tower' | 'pick'
  | 'sunset' | 'mic' | 'chat' | 'skyline';

export interface EmblemSpec { shape: Shape; bg: string; fg: string; accent: string; glyph: Glyph; word: string }

/** Station id -> emblem. Colours are explicit; every id of the game's catalog has one (tests). */
export const EMBLEMS: Record<string, EmblemSpec> = {
  bkhouse:   { shape: 'hex',     bg: '#2a1412', fg: '#ff7a3d', accent: '#f2e3c6', glyph: 'gauge',     word: 'BOILER' },
  hiphop:    { shape: 'square',  bg: '#17130d', fg: '#f2b632', accent: '#c4472f', glyph: 'stoop',     word: 'STOOP' },
  beat:      { shape: 'circle',  bg: '#2b0f2a', fg: '#ff4fa3', accent: '#ffd9ec', glyph: 'pulse',     word: 'THE BEAT' },
  dublab:    { shape: 'diamond', bg: '#0e2a2c', fg: '#4fd1c1', accent: '#e8f7ef', glyph: 'speaker',   word: 'DEK' },
  sc:        { shape: 'ticket',  bg: '#10202f', fg: '#f2e3c6', accent: '#e2553d', glyph: 'door',      word: 'NYC DOOR' },
  flashback: { shape: 'burst',   bg: '#1f1a05', fg: '#f4d400', accent: '#ff5a2a', glyph: 'crown',     word: 'RINSE' },
  boogie:    { shape: 'circle',  bg: '#2a1840', fg: '#e8b3ff', accent: '#ffe08a', glyph: 'ball',      word: 'SOUL' },
  rnsoul:    { shape: 'octagon', bg: '#3a1d12', fg: '#e8c27a', accent: '#d8553a', glyph: 'disc45',    word: 'SOUL+FUNK' },
  yard:      { shape: 'shield',  bg: '#0d2b1a', fg: '#4ccf6a', accent: '#ffd23f', glyph: 'sun',       word: 'SILVER STAR' },
  latin:     { shape: 'arch',    bg: '#34101c', fg: '#ff5472', accent: '#ffd9a0', glyph: 'gem',       word: 'RUBY' },
  weird:     { shape: 'oval',    bg: '#1a2230', fg: '#8fb5ff', accent: '#ff9f43', glyph: 'container', word: 'THE LOT' },
  wfmu:      { shape: 'hex',     bg: '#241d3a', fg: '#c9b8ff', accent: '#ffcf5a', glyph: 'tower',     word: 'FREEFORM' },
  kexp:      { shape: 'shield',  bg: '#102a22', fg: '#9be564', accent: '#f2e3c6', glyph: 'pick',      word: 'INDIE' },
  u80s:      { shape: 'diamond', bg: '#1a0f3a', fg: '#ff6ad5', accent: '#52e5ff', glyph: 'sunset',    word: 'UNDERGROUND' },
  talk:      { shape: 'square',  bg: '#2c0f0f', fg: '#ff4d4d', accent: '#fff1d6', glyph: 'mic',       word: 'WBSY' },
  groupchat: { shape: 'circle',  bg: '#0f2a33', fg: '#5ec8ff', accent: '#f2f9ff', glyph: 'chat',      word: 'GROUP CHAT' },
  wnyc:      { shape: 'ticket',  bg: '#161a20', fg: '#d8dce3', accent: '#e2553d', glyph: 'skyline',   word: '93.9' },
};

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** Badge outline in a 100 x 100 box. */
function shapePath(s: Shape): string {
  switch (s) {
    case 'circle': return 'M50 4a46 46 0 1 0 .01 0z';
    case 'hex': return 'M50 3 91 26.5v47L50 97 9 73.5v-47z';
    case 'square': return 'M16 5h68a11 11 0 0 1 11 11v68a11 11 0 0 1-11 11H16A11 11 0 0 1 5 84V16A11 11 0 0 1 16 5z';
    case 'diamond': return 'M50 2 98 50 50 98 2 50z';
    case 'shield': return 'M50 3 91 14v34c0 24-17 40-41 49C26 88 9 72 9 48V14z';
    case 'ticket': return 'M6 22h88v16a12 12 0 0 0 0 24v16H6V62a12 12 0 0 0 0-24z';
    case 'burst': return 'M50 2l9 14 16-6 3 17 17 3-6 16 14 9-14 9 6 16-17 3-3 17-16-6-9 14-9-14-16 6-3-17-17-3 6-16L2 50l14-9-6-16 17-3 3-17 16 6z';
    case 'oval': return 'M50 10c27 0 46 17 46 40S77 90 50 90 4 73 4 50 23 10 50 10z';
    case 'arch': return 'M12 96V44C12 20 29 4 50 4s38 16 38 40v52z';
    case 'octagon': return 'M31 4h38l27 27v38L69 96H31L4 69V31z';
  }
}

/** Pictograms on a 24 x 24 grid: f = main colour, a = accent. */
function glyph(g: Glyph, f: string, a: string): string {
  switch (g) {
    case 'gauge': return `<path d="M3 17a9 9 0 1 1 18 0" fill="none" stroke="${f}" stroke-width="2.4" stroke-linecap="round"/><path d="M12 17 17 9" stroke="${a}" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="17" r="2" fill="${a}"/><path d="M5 21h14" stroke="${f}" stroke-width="2.4" stroke-linecap="round"/>`;
    case 'stoop': return `<path d="M2 21h20v-3h-4v-3h-4v-3h-4V9H6v3H2z" fill="${f}"/><path d="M14 4h6v3h-6z" fill="${a}"/>`;
    case 'pulse': return `<path d="M1 12h5l2.5-7 4 14 3-9 1.5 2H23" fill="none" stroke="${f}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><circle cx="12" cy="12" r="10.5" fill="none" stroke="${a}" stroke-width="1" opacity=".6"/>`;
    case 'speaker': return `<rect x="4" y="2" width="16" height="20" rx="3" fill="none" stroke="${f}" stroke-width="2"/><circle cx="12" cy="15" r="4.5" fill="${f}"/><circle cx="12" cy="15" r="1.6" fill="${a}"/><circle cx="12" cy="7" r="2" fill="${a}"/>`;
    case 'door': return `<path d="M5 21V8a7 7 0 0 1 14 0v13z" fill="none" stroke="${f}" stroke-width="2.2"/><path d="M12 3v18" stroke="${f}" stroke-width="1.6"/><circle cx="9" cy="13" r="1.3" fill="${a}"/><circle cx="15" cy="13" r="1.3" fill="${a}"/>`;
    case 'crown': return `<path d="M3 18 2 7l6 5 4-8 4 8 6-5-1 11z" fill="${f}"/><rect x="3" y="19" width="18" height="3" rx="1" fill="${a}"/>`;
    case 'ball': return `<circle cx="12" cy="13" r="8.5" fill="${f}"/><path d="M4 11h16M4.5 16h15M9 5l-1 17M15 5l1 17" stroke="${a}" stroke-width="1" fill="none"/><path d="M12 1v3" stroke="${a}" stroke-width="2" stroke-linecap="round"/>`;
    case 'disc45': return `<circle cx="12" cy="12" r="10" fill="${f}"/><circle cx="12" cy="12" r="6" fill="none" stroke="${a}" stroke-width="1"/><circle cx="12" cy="12" r="3.4" fill="${a}"/><circle cx="12" cy="12" r="2.4" fill="#1a0f0a"/>`;
    case 'sun': return `<path d="M2 17a10 10 0 0 1 20 0z" fill="${a}"/><path d="M12 1v4M3 6l3 3M21 6l-3 3" stroke="${a}" stroke-width="2" stroke-linecap="round"/><path d="M2 21q3-3 5.5 0T13 21t5.5 0 3.5 0" fill="none" stroke="${f}" stroke-width="2" stroke-linecap="round"/>`;
    case 'gem': return `<path d="M7 3h10l5 6-10 13L2 9z" fill="${f}"/><path d="M2 9h20M7 3l5 6 5-6M12 9v13" stroke="${a}" stroke-width="1.2" fill="none"/>`;
    case 'container': return `<rect x="2" y="6" width="20" height="13" rx="1.5" fill="${f}"/><path d="M6 6v13M10 6v13M14 6v13M18 6v13" stroke="#10151f" stroke-width="1.4"/><rect x="2" y="19" width="20" height="2.5" fill="${a}"/>`;
    case 'tower': return `<path d="M12 9 6 22M12 9l6 13M8.5 17h7M10 13h4" stroke="${f}" stroke-width="2" stroke-linecap="round" fill="none"/><circle cx="12" cy="7" r="2" fill="${a}"/><path d="M6.5 3.5a7 7 0 0 0 0 7M17.5 3.5a7 7 0 0 1 0 7" stroke="${a}" stroke-width="1.8" stroke-linecap="round" fill="none"/>`;
    case 'pick': return `<path d="M12 2C6 2 3 7 4 12c1 5 5 9 8 10 3-1 7-5 8-10 1-5-2-10-8-10z" fill="${f}"/><path d="M8 9l8 4M8 13l6 3" stroke="${a}" stroke-width="1.6" stroke-linecap="round" fill="none"/>`;
    case 'sunset': return `<path d="M3 15a9 9 0 0 1 18 0z" fill="${f}"/><path d="M3 18h18M5 21h14M9 15v6M15 15v6" stroke="${a}" stroke-width="1.4"/><path d="M3 12h18" stroke="#1a0f3a" stroke-width="1.2"/>`;
    case 'mic': return `<rect x="8" y="2" width="8" height="12" rx="4" fill="${f}"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" stroke="${a}" stroke-width="2" stroke-linecap="round" fill="none"/>`;
    case 'chat': return `<path d="M3 4h18v12H11l-5 5v-5H3z" fill="${f}"/><circle cx="8" cy="10" r="1.5" fill="${a}"/><circle cx="12" cy="10" r="1.5" fill="${a}"/><circle cx="16" cy="10" r="1.5" fill="${a}"/>`;
    case 'skyline': return `<path d="M2 21V13h3V9h3v12h3V5h4v16h3v-8h3v8z" fill="${f}"/><rect x="12" y="2" width="1.2" height="3" fill="${a}"/><path d="M2 21h20" stroke="${a}" stroke-width="1.6"/>`;
  }
}

/** The emblem as an SVG string. `name` adds the wordmark (large sizes); small sizes leave it out. `uid` keeps clip ids unique per instance. */
export function emblemSvg(id: string, opts: { name?: boolean; label?: string } = {}): string {
  const e = EMBLEMS[id];
  if (!e) return '';
  const showName = !!opts.name;
  const g = showName ? 'translate(28 18) scale(1.9)' : 'translate(25 24) scale(2.1)';
  const word = showName
    ? `<text x="50" y="82" text-anchor="middle" font-family="Anton,'Barlow Condensed',Impact,sans-serif" font-size="${e.word.length > 9 ? 11 : e.word.length > 6 ? 13 : 16}" letter-spacing="1" fill="${e.accent}">${esc(e.word)}</text>`
    : '';
  const label = opts.label ? `role="img" aria-label="${esc(opts.label)}"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="emb" viewBox="0 0 100 100" ${label} data-emblem="${esc(id)}">` +
    `<path d="${shapePath(e.shape)}" fill="${e.bg}" stroke="${e.fg}" stroke-width="3.2" stroke-linejoin="round"/>` +
    `<path d="${shapePath(e.shape)}" fill="none" stroke="${e.accent}" stroke-width="1" opacity=".55" transform="translate(50 50) scale(.86) translate(-50 -50)"/>` +
    `<g transform="${g}">${glyph(e.glyph, e.fg, e.accent)}</g>${word}</svg>`;
}
