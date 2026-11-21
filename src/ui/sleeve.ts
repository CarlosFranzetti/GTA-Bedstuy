/**
 * Record sleeves painted in code (original designs: no real cover, label or logo is copied). Pure: same record in, same SVG out.
 * Fonts are the project's two (Anton and Barlow Condensed, loaded by type.css), so the SVG is meant to be inlined in the page.
 *
 *  - 'paper'   a 78 rpm paper sleeve: kraft stock, a die-cut hole with the round label showing through, a rubber stamp.
 *  - 'blocks'  a dance-band / jazz jacket: bold type over blocks of flat colour.
 *  - 'twelve'  a 1980s 12-inch: black jacket with a die-cut centre showing the label, big title across the top.
 *  - 'promo'   a 1990s white-label promo: plain white stock, a typed label and a crooked rubber stamp.
 *  - 'picture' a 2000s picture sleeve: gradient art, a skyline of stoops, a wide title band and a barcode.
 *  - 'minimal' a 2010s digital-era cover: off-white, one geometric shape, tiny type in a corner.
 *  - 'sticker' a 12-inch jacket: a brownstone-and-stoop silhouette under a hype sticker (used for the synthesised originals too).
 */
import { Rng } from '@/core/Rng';
import type { RecordDef } from '@/game/records';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const ANTON = "Anton, Impact, 'Arial Narrow', sans-serif";
const BARLOW = "'Barlow Condensed', 'Arial Narrow', sans-serif";
/** Font size so that `n` characters fit `width` units of a condensed face (about 0.44 em per character). */
const fit = (n: number, width: number, max: number, min = 8): number => Math.max(min, Math.min(max, width / (Math.max(1, n) * 0.46)));

/** Splits a title into at most `lines` lines of at most `n` characters, on spaces. */
function wrap(text: string, n: number, lines: number): string[] {
  const out: string[] = []; let cur = '';
  for (const w of text.split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > n && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  if (out.length > lines) { const keep = out.slice(0, lines); keep[lines - 1] = clip(out.slice(lines - 1).join(' '), n); return keep; }
  return out;
}

export type SleeveKind = 'paper' | 'blocks' | 'sticker' | 'twelve' | 'promo' | 'picture' | 'minimal';
const SLEEVE_KINDS: readonly string[] = ['paper', 'blocks', 'twelve', 'promo', 'picture', 'minimal'];
export function sleeveStyleOf(def: Pick<RecordDef, 'kind' | 'sleeve'>): SleeveKind {
  return def.sleeve && SLEEVE_KINDS.includes(def.sleeve) ? (def.sleeve as SleeveKind) : 'sticker';
}

export function sleeveSvg(def: RecordDef): string {
  const style = sleeveStyleOf(def);
  const rng = new Rng(`sleeve:${def.id}`);
  const [c0, c1] = def.colors;
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" class="sleeve sleeve-${style}" role="img" aria-label="${esc(`${def.title}, ${def.artist}`)}" preserveAspectRatio="xMidYMid slice">`;
  const label = def.label ?? (def.kind === 'procedural' ? 'WAX DELI PRESS' : def.artist);
  const cat = def.cat ?? def.id.toUpperCase();
  const year = def.year ?? '';
  let body = '';

  if (style === 'paper') {
    const hue = 36 + Math.floor(rng.next() * 10);
    const kraft = `hsl(${hue} 38% ${58 + Math.floor(rng.next() * 8)}%)`;
    const tilt = (rng.next() - 0.5) * 8;
    const lines = wrap(def.title, 15, 3);
    body = `<rect width="200" height="200" fill="${kraft}"/>`
      + `<rect x="5" y="5" width="190" height="190" fill="none" stroke="rgba(60,40,20,.35)" stroke-width="1" stroke-dasharray="3 2"/>`
      + `<circle cx="100" cy="104" r="62" fill="#0b0b0b"/>`
      + `<circle cx="100" cy="104" r="54" fill="none" stroke="#222" stroke-width="1"/><circle cx="100" cy="104" r="46" fill="none" stroke="#1a1a1a" stroke-width="1"/>`
      + `<circle cx="100" cy="104" r="36" fill="${esc(c0)}"/><circle cx="100" cy="104" r="36" fill="none" stroke="${esc(c1)}" stroke-width="1.5"/><circle cx="100" cy="104" r="3.2" fill="#0b0b0b"/>`
      + `<text x="100" y="82" text-anchor="middle" font-family="${ANTON}" font-size="${fit(label.length, 56, 9, 5)}" fill="${esc(c1)}" letter-spacing=".5">${esc(clip(label.toUpperCase(), 22))}</text>`
      + lines.map((ln, i) => `<text x="100" y="${96 + i * 8.5 - (lines.length - 1) * 3}" text-anchor="middle" font-family="${BARLOW}" font-weight="700" font-size="${fit(ln.length, 56, 8.5, 5.5)}" fill="${esc(c1)}">${esc(ln)}</text>`).join('')
      + `<text x="100" y="124" text-anchor="middle" font-family="${BARLOW}" font-size="6.5" fill="${esc(c1)}">${esc(clip(def.artist, 30))}</text>`
      + `<text x="100" y="131" text-anchor="middle" font-family="${BARLOW}" font-size="5.5" fill="${esc(c1)}" opacity=".85">${esc(cat)} · 78 RPM</text>`
      + `<g transform="rotate(${tilt.toFixed(1)} 100 24)"><rect x="46" y="12" width="108" height="26" rx="2" fill="none" stroke="rgba(140,30,30,.75)" stroke-width="2"/>`
      + `<text x="100" y="22" text-anchor="middle" font-family="${ANTON}" font-size="9" fill="rgba(140,30,30,.85)" letter-spacing="1">${esc(clip(label.toUpperCase(), 26))}</text>`
      + `<text x="100" y="33" text-anchor="middle" font-family="${BARLOW}" font-weight="700" font-size="8" fill="rgba(140,30,30,.85)">${esc(String(year))} · STOCK COPY</text></g>`
      + `<path d="M0 190 L200 186 L200 200 L0 200 Z" fill="rgba(60,40,20,.18)"/>`;
  } else if (style === 'blocks') {
    const split = 52 + Math.floor(rng.next() * 30);
    const barY = 118 + Math.floor(rng.next() * 30);
    const lines = wrap(def.title.toUpperCase(), 11, 4);
    const size = Math.min(32, 150 / Math.max(3, Math.max(...lines.map((l) => l.length))) * 1.25);
    body = `<rect width="200" height="200" fill="${esc(c1)}"/>`
      + `<rect x="0" y="0" width="${split}" height="200" fill="${esc(c0)}"/>`
      + `<rect x="${split}" y="${barY}" width="${200 - split}" height="14" fill="${esc(c0)}" opacity=".9"/>`
      + `<circle cx="${split + 28}" cy="172" r="20" fill="none" stroke="${esc(c0)}" stroke-width="4"/>`
      + `<rect x="${split + 76}" y="16" width="${Math.max(10, 200 - split - 92)}" height="${30 + Math.floor(rng.next() * 40)}" fill="${esc(c0)}" opacity=".55"/>`
      + lines.map((ln, i) => `<text x="${split + 9}" y="${34 + i * (size + 2)}" font-family="${ANTON}" font-size="${size.toFixed(1)}" fill="#f4ecd8" letter-spacing=".4">${esc(ln)}</text>`).join('')
      + `<text x="${split + 9}" y="${barY - 6}" font-family="${BARLOW}" font-weight="700" font-size="${fit(def.artist.length, 132 - split * 0.0, 14, 8)}" fill="${esc(c0)}">${esc(clip(def.artist.toUpperCase(), 30))}</text>`
      + `<text x="${split + 9}" y="${barY + 10.5}" font-family="${BARLOW}" font-weight="700" font-size="9" fill="${esc(c1)}" letter-spacing=".6">${esc(clip((label).toUpperCase(), 28))}</text>`
      + `<text x="${split + 56}" y="176" font-family="${BARLOW}" font-size="9" fill="#f4ecd8" opacity=".85">${esc(cat)}</text>`
      + `<text x="${split + 56}" y="187" font-family="${BARLOW}" font-size="9" fill="#f4ecd8" opacity=".85">${esc(String(year))}</text>`
      + `<text x="${split / 2}" y="190" text-anchor="middle" font-family="${BARLOW}" font-weight="700" font-size="9" fill="${esc(c1)}" transform="rotate(-90 ${split / 2} 100)" opacity="0">.</text>`;
  } else if (style === 'twelve') {
    const lines = wrap(def.title.toUpperCase(), 12, 3);
    const size = Math.min(27, 160 / Math.max(4, Math.max(...lines.map((l) => l.length))) * 1.3);
    body = `<rect width="200" height="200" fill="#111"/>`
      + `<rect x="0" y="0" width="200" height="6" fill="${esc(c0)}"/><rect x="0" y="194" width="200" height="6" fill="${esc(c0)}"/>`
      + lines.map((ln, i) => `<text x="12" y="${32 + i * (size + 2)}" font-family="${ANTON}" font-size="${size.toFixed(1)}" fill="${esc(c0)}" letter-spacing="1">${esc(ln)}</text>`).join('')
      + `<circle cx="100" cy="132" r="52" fill="#050505" stroke="#2a2a2a" stroke-width="1"/><circle cx="100" cy="132" r="30" fill="${esc(c0)}"/><circle cx="100" cy="132" r="30" fill="none" stroke="${esc(c1)}" stroke-width="1.5"/><circle cx="100" cy="132" r="3" fill="#050505"/>`
      + `<text x="100" y="124" text-anchor="middle" font-family="${ANTON}" font-size="7" fill="${esc(c1)}">${esc(clip(label.toUpperCase(), 18))}</text>`
      + `<text x="100" y="134" text-anchor="middle" font-family="${BARLOW}" font-weight="700" font-size="6.5" fill="${esc(c1)}">${esc(clip(def.artist.toUpperCase(), 24))}</text>`
      + `<text x="100" y="143" text-anchor="middle" font-family="${BARLOW}" font-size="5.5" fill="${esc(c1)}">${esc(cat)} · 45 RPM</text>`
      + `<text x="12" y="${40 + lines.length * (size + 2)}" font-family="${BARLOW}" font-weight="700" font-size="11" fill="#f4ecd8">${esc(clip(def.artist.toUpperCase(), 26))}</text>`
      + `<text x="188" y="186" text-anchor="end" font-family="${BARLOW}" font-weight="700" font-size="9" fill="#f4ecd8" opacity=".8">12 INCH · ${esc(String(year))}</text>`;
  } else if (style === 'promo') {
    const tilt = -7 + rng.next() * 14;
    const lines = wrap(def.title, 17, 3);
    body = `<rect width="200" height="200" fill="#efece4"/>`
      + `<rect x="0" y="0" width="200" height="200" fill="none" stroke="rgba(0,0,0,.12)" stroke-width="6"/>`
      + `<circle cx="100" cy="112" r="64" fill="#f9f8f4" stroke="rgba(0,0,0,.25)" stroke-width="1"/><circle cx="100" cy="112" r="4" fill="#d8d4c8" stroke="rgba(0,0,0,.35)" stroke-width="1"/>`
      + `<text x="100" y="74" text-anchor="middle" font-family="${BARLOW}" font-weight="700" font-size="9" fill="#222" letter-spacing="1">${esc(clip(label.toUpperCase(), 24))}</text>`
      + lines.map((ln, i) => `<text x="100" y="${90 + i * 11}" text-anchor="middle" font-family="${BARLOW}" font-weight="700" font-size="${fit(ln.length, 80, 11, 7)}" fill="#111">${esc(ln)}</text>`).join('')
      + `<text x="100" y="${98 + lines.length * 11}" text-anchor="middle" font-family="${BARLOW}" font-size="8" fill="#333">${esc(clip(def.artist, 30))}</text>`
      + `<text x="100" y="158" text-anchor="middle" font-family="${BARLOW}" font-size="7" fill="#444">${esc(cat)} · ${Math.round(def.bpm)} BPM</text>`
      + `<g transform="rotate(${tilt.toFixed(1)} 100 28)"><rect x="34" y="12" width="132" height="32" rx="3" fill="none" stroke="${esc(c0)}" stroke-width="2.5" opacity=".85"/>`
      + `<text x="100" y="27" text-anchor="middle" font-family="${ANTON}" font-size="13" fill="${esc(c0)}" opacity=".9" letter-spacing="1.5">DJ PROMO</text>`
      + `<text x="100" y="39" text-anchor="middle" font-family="${BARLOW}" font-weight="700" font-size="8.5" fill="${esc(c0)}" opacity=".9">NOT FOR SALE · ${esc(String(year))}</text></g>`;
  } else if (style === 'picture') {
    const sky = `sk-${def.id.replace(/[^a-z0-9]/gi, '')}`;
    const lines = wrap(def.title.toUpperCase(), 14, 2);
    const size = Math.min(24, 170 / Math.max(5, Math.max(...lines.map((l) => l.length))) * 1.3);
    const stoops = Array.from({ length: 7 }, (_, i) => { const h = 40 + Math.floor(rng.next() * 50); return `<rect x="${i * 30 - 6}" y="${176 - h}" width="26" height="${h}" fill="rgba(0,0,0,${(0.35 + rng.next() * 0.3).toFixed(2)})"/>`; }).join('');
    body = `<defs><radialGradient id="${sky}" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="${esc(c0)}"/><stop offset="1" stop-color="${esc(c1)}"/></radialGradient></defs>`
      + `<rect width="200" height="200" fill="url(#${sky})"/>`
      + `<circle cx="${60 + Math.floor(rng.next() * 80)}" cy="62" r="${28 + Math.floor(rng.next() * 14)}" fill="#f4ecd8" opacity=".85"/>` + stoops
      + `<rect x="0" y="148" width="200" height="34" fill="rgba(0,0,0,.55)"/>`
      + lines.map((ln, i) => `<text x="10" y="${166 + i * (size * 0.5) - (lines.length - 1) * 2}" font-family="${ANTON}" font-size="${(size * (lines.length > 1 ? 0.62 : 0.85)).toFixed(1)}" fill="#f4ecd8" letter-spacing=".6">${esc(ln)}</text>`).join('')
      + `<text x="10" y="194" font-family="${BARLOW}" font-weight="700" font-size="9.5" fill="#f4ecd8">${esc(clip(def.artist.toUpperCase(), 26))} · ${esc(clip(label.toUpperCase(), 14))}</text>`
      + `<g transform="translate(160 156)"><rect width="32" height="22" fill="#f4ecd8"/>${Array.from({ length: 11 }, (_, i) => `<rect x="${2 + i * 2.7}" y="2" width="${i % 3 === 0 ? 1.6 : 0.9}" height="14" fill="#111"/>`).join('')}<text x="16" y="21" text-anchor="middle" font-family="${BARLOW}" font-size="4" fill="#111">${esc(cat)}</text></g>`
      + `<text x="190" y="14" text-anchor="end" font-family="${BARLOW}" font-weight="700" font-size="8" fill="#f4ecd8" opacity=".85">${esc(String(year))}</text>`;
  } else if (style === 'minimal') {
    const shape = rng.next();
    const lines = wrap(def.title, 20, 2);
    body = `<rect width="200" height="200" fill="#f1efe9"/>`
      + (shape < 0.34 ? `<circle cx="100" cy="92" r="46" fill="${esc(c0)}"/><circle cx="100" cy="92" r="22" fill="#f1efe9"/>`
        : shape < 0.67 ? `<rect x="54" y="46" width="92" height="92" fill="${esc(c0)}"/><rect x="54" y="92" width="92" height="46" fill="${esc(c1)}"/>`
          : `<path d="M100 40 L150 134 L50 134 Z" fill="${esc(c0)}"/><path d="M100 76 L126 134 L74 134 Z" fill="${esc(c1)}"/>`)
      + lines.map((ln, i) => `<text x="14" y="${164 + i * 11}" font-family="${ANTON}" font-size="${fit(ln.length, 150, 11, 7)}" fill="#161616" letter-spacing=".8">${esc(ln.toUpperCase())}</text>`).join('')
      + `<text x="14" y="${168 + lines.length * 11}" font-family="${BARLOW}" font-size="7.5" fill="#444">${esc(clip(def.artist, 34))}</text>`
      + `<text x="186" y="16" text-anchor="end" font-family="${BARLOW}" font-weight="700" font-size="7.5" fill="#444">${esc(cat)}</text>`
      + `<text x="14" y="16" font-family="${BARLOW}" font-weight="700" font-size="7.5" fill="#444" letter-spacing=".8">${esc(clip(label.toUpperCase(), 22))}</text>`
      + `<text x="186" y="190" text-anchor="end" font-family="${BARLOW}" font-size="7.5" fill="#444">${esc(String(year))}</text>`;
  } else {
    // sticker: a row of brownstones with stoops against a sodium sky, then a hype sticker
    const houses: string[] = []; let x = -4;
    while (x < 200) {
      const w = 34 + Math.floor(rng.next() * 14); const h = 78 + Math.floor(rng.next() * 40);
      const tone = 14 + Math.floor(rng.next() * 12);
      houses.push(`<rect x="${x}" y="${200 - h}" width="${w - 2}" height="${h}" fill="hsl(18 ${22 + Math.floor(rng.next() * 12)}% ${tone}%)"/>`
        + `<rect x="${x}" y="${200 - h}" width="${w - 2}" height="5" fill="rgba(0,0,0,.4)"/>`
        + [0, 1, 2].map((r) => [0, 1].map((cn) => `<rect x="${x + 6 + cn * ((w - 22) / 1 )}" y="${200 - h + 12 + r * 22}" width="9" height="13" fill="${rng.next() > 0.7 ? esc(c0) : 'rgba(0,0,0,.45)'}" opacity=".85"/>`).join('')).join('')
        + `<path d="M${x + w / 2 - 8} 200 l0 -12 l16 0 l0 12 z" fill="rgba(0,0,0,.35)"/>`);
      x += w;
    }
    const lines = wrap(def.title.toUpperCase(), 13, 3);
    const size = Math.min(26, 150 / Math.max(4, Math.max(...lines.map((l) => l.length))) * 1.3);
    const bpm = Math.round(def.bpm);
    body = `<defs><linearGradient id="sky-${def.id.replace(/[^a-z0-9]/gi, '')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${esc(c1)}"/><stop offset="1" stop-color="${esc(c0)}"/></linearGradient></defs>`
      + `<rect width="200" height="200" fill="url(#sky-${def.id.replace(/[^a-z0-9]/gi, '')})"/>`
      + houses.join('')
      + lines.map((ln, i) => `<text x="12" y="${28 + i * (size + 1)}" font-family="${ANTON}" font-size="${size.toFixed(1)}" fill="#f4ecd8">${esc(ln)}</text>`).join('')
      + `<text x="12" y="${34 + lines.length * (size + 1)}" font-family="${BARLOW}" font-weight="700" font-size="11" fill="#f4ecd8" opacity=".9">${esc(clip(def.artist.toUpperCase(), 28))}</text>`
      + `<g transform="rotate(${(-8 + rng.next() * 16).toFixed(1)} 160 160)"><circle cx="160" cy="160" r="26" fill="#f4ecd8"/><circle cx="160" cy="160" r="23" fill="none" stroke="${esc(c1)}" stroke-width="1.5"/>`
      + `<text x="160" y="157" text-anchor="middle" font-family="${ANTON}" font-size="13" fill="${esc(c1)}">${bpm}</text><text x="160" y="168" text-anchor="middle" font-family="${BARLOW}" font-weight="700" font-size="8" fill="${esc(c1)}">${def.kind === 'procedural' ? 'EXACT BPM' : 'BPM'}</text></g>`
      + `<text x="12" y="192" font-family="${BARLOW}" font-size="8" fill="#f4ecd8" opacity=".8">${esc(clip(label.toUpperCase(), 26))}${year ? ' · ' + year : ''}</text>`;
  }
  return head + body + '</svg>';
}

/** An element holding the sleeve (the DOM shop and the liner note use this). */
export function sleeveElement(doc: Document, def: RecordDef, cls = 'sleeve-wrap'): HTMLElement {
  const d = doc.createElement('div'); d.className = cls; d.innerHTML = sleeveSvg(def); return d;
}
