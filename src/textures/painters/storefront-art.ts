import { Rng } from '@/core/Rng';

/**
 * Storefront graphics toolkit: sign-text classification (awning/sign archetypes from keywords), awning and
 * lightbox layout, and pure canvas-primitive helpers (pictograms, segment digits, stripes, plates).
 *
 * Everything here is deterministic from the text (a hash, never an rng) and uses only the basic 2D calls the
 * test fakes support: save/restore, translate/rotate/scale, fillRect/strokeRect, paths with moveTo/lineTo/arc/
 * quadraticCurveTo, fill/stroke. No ellipse, roundRect, clip, gradients or bezierCurveTo. No fillText either, so
 * a pictogram or a phone number never counts as printed text.
 */

export type AwningStyle = 'vinyl' | 'metal';

export type Archetype =
  | 'bodega' | 'laundromat' | 'barber' | 'salon' | 'pizza' | 'kitchen' | 'liquor' | 'dollar'
  | 'pharmacy' | 'daycare' | 'funeral' | 'auto' | 'church' | 'condo' | 'generic';

export const PICTOGRAM_KINDS = [
  'sandwich', 'coffee', 'lottery', 'atm', 'washer', 'shirt', 'scissors', 'comb', 'braid', 'pizza', 'soda', 'bowl',
  'bottle', 'glass', 'tag', 'medcross', 'pill', 'block', 'star', 'candle', 'wrench', 'tire', 'cross', 'house',
] as const;
export type PictogramKind = (typeof PICTOGRAM_KINDS)[number];

export type StripeKind = 'none' | 'bands' | 'diagonal' | 'checker' | 'waves' | 'dots' | 'zigzag' | 'pin';

export interface AwningLayout {
  style: AwningStyle;
  archetype: Archetype;
  /** Upper-case name (text before the first '·'). */
  mainLine: string;
  /** Upper-case text after the first '·', or null. */
  subLine: string | null;
  /** Fictional 718-555-01xx number, absent for churches and unclassified shops. */
  phone?: string;
  /** Icons for the valance: 1 (mirrored left and right) or an even count split left/right. */
  pictograms: PictogramKind[];
  stripe: StripeKind;
  bandColors: string[];
}

export type BadgeKind = 'open' | 'atm' | 'ebt';
export interface SignBadge { kind: BadgeKind; label: string }

export interface SignLayout {
  archetype: Archetype;
  mainLine: string;
  subLine: string | null;
  badges: SignBadge[];
  /** Bars and liquor stores get neon-tube lettering. */
  neon: boolean;
  neonColors: [string, string];
  icon: PictogramKind | null;
  stripeColor: string;
}

/**
 * Texture-pixel aspect (world width per pixel / world height per pixel) of each surface for a typical ~6.5 m
 * shopfront (mixeduse.ts maps a 512 px wide texture over the whole frontage). Icons are pre-squeezed by this
 * factor so a round thing still looks round on the building.
 */
export const VALANCE_ASPECT = 2.4;
export const SLOPE_ASPECT = 1.5;
export const SIGN_ASPECT = 2.1;

// ---------------------------------------------------------------------------------------------- classification

const RULES: readonly [Archetype, RegExp][] = [
  ['church', /CHURCH|TABERNACLE|MINISTR|CATHEDRAL|BAPTIST|GOSPEL|CHAPEL/],
  ['funeral', /FUNERAL|MORTUARY/],
  ['condo', /LEASING|RESIDENCES?|CONDOS?|APARTMENTS?/],
  ['laundromat', /LAUNDR|\bWASH\b|K-O-MAT|DRY CLEAN|\bMAT\b/],
  ['barber', /BARBER|\bCUT[SZ]\b/],
  ['salon', /BRAID|SALON|\bNAILS?\b|\bHAIR\b|\bLOCS\b|\bWEAVE/],
  ['pharmacy', /PHARMAC|\bDRUGS?\b|\bRX\b|CHEMIST/],
  ['daycare', /DAY ?CARE|PRESCHOOL|SCHOLARS|ACADEMY|\bKIDS\b|NURSERY/],
  ['auto', /\bAUTO\b|\bTIRES?\b|GARAGE|MOTORS|BODY SHOP|\bREPAIRS?\b|MUFFLER/],
  ['liquor', /LIQUOR|\bWINES?\b|SPIRITS|\bBEER\b|TAVERN|\bBAR\b|LOUNGE|\bPUB\b/],
  ['pizza', /PIZZ|\bSLICES?\b/],
  ['kitchen', /KITCHEN|RESTAURANT|GRILL|CHICKEN|WINGS|OXTAIL|JERK|CARIBBEAN|CHINESE|TAKE-?OUT|\bFISH\b|SOUL FOOD|BBQ|DINER|BAKERY|\bCAFE\b/],
  ['dollar', /99¢|99C\b|\bDOLLAR\b|DISCOUNT/],
  ['bodega', /DELI|GROCER|BODEGA|MARKET|CORNER STORE|\bFOOD\b|\bMART\b|SUPERETTE|CONVENIENCE/],
];

/** Archetype from sign keywords (any case). Unrecognised text is 'generic'. */
export function classifyArchetype(text: string): Archetype {
  const t = text.toUpperCase();
  for (const [a, re] of RULES) if (re.test(t)) return a;
  return 'generic';
}

/** Split 'KING DELI · GROCERY · ATM' into the main name and the small secondary line, if a '·' is present. */
export function splitSecondary(label: string): { main: string; secondary: string | null } {
  const i = label.indexOf('·');
  if (i < 0) return { main: label, secondary: null };
  const main = label.slice(0, i).trim();
  const secondary = label.slice(i + 1).trim();
  if (!main || !secondary) return { main: label.replace(/\s*·\s*/g, ' ').trim() || label, secondary: null };
  return { main, secondary };
}

const METAL_OK: ReadonlySet<Archetype> = new Set<Archetype>(['bodega', 'dollar', 'generic']);

/** Deterministic awning style. Corrugated metal only suits bodega-type shops; the rest are vinyl. */
export function awningStyleFor(text: string, archetype: Archetype = classifyArchetype(text)): AwningStyle {
  if (!METAL_OK.has(archetype)) return 'vinyl';
  return ((Rng.hash(text) >>> 16) & 1) === 0 ? 'vinyl' : 'metal';
}

interface Theme { stripe: StripeKind; colors: string[]; pictograms: PictogramKind[]; phone: boolean }

const THEMES: Record<Archetype, Theme> = {
  bodega: { stripe: 'bands', colors: ['#c4161c', '#f1c232', '#1d3f8f'], pictograms: [], phone: true },
  laundromat: { stripe: 'waves', colors: ['#ffffff', '#8fd0f0', '#ffffff'], pictograms: ['washer', 'shirt'], phone: true },
  barber: { stripe: 'diagonal', colors: ['#c4161c', '#ffffff', '#1d4fa6'], pictograms: ['scissors', 'comb'], phone: true },
  salon: { stripe: 'zigzag', colors: ['#f1c232', '#c4161c', '#1b8a5a'], pictograms: ['braid', 'comb'], phone: true },
  pizza: { stripe: 'checker', colors: ['#c4161c', '#ffffff'], pictograms: ['pizza', 'soda'], phone: true },
  kitchen: { stripe: 'dots', colors: ['#f1c232', '#c4161c'], pictograms: ['bowl', 'soda'], phone: true },
  liquor: { stripe: 'pin', colors: ['#d4af37'], pictograms: ['bottle', 'glass'], phone: true },
  dollar: { stripe: 'bands', colors: ['#d62828', '#ffffff', '#111111'], pictograms: ['tag', 'tag'], phone: true },
  pharmacy: { stripe: 'bands', colors: ['#ffffff', '#9fdcc2', '#ffffff'], pictograms: ['medcross', 'pill'], phone: true },
  daycare: { stripe: 'dots', colors: ['#ffd400', '#4caf50', '#2196f3', '#e53935'], pictograms: ['block', 'star'], phone: true },
  funeral: { stripe: 'pin', colors: ['#c8ccd0'], pictograms: ['candle'], phone: true },
  auto: { stripe: 'diagonal', colors: ['#f1c232', '#111111'], pictograms: ['wrench', 'tire'], phone: true },
  church: { stripe: 'pin', colors: ['#d4af37'], pictograms: ['cross'], phone: false },
  condo: { stripe: 'pin', colors: ['#3a3a3a'], pictograms: ['house'], phone: true },
  generic: { stripe: 'none', colors: [], pictograms: [], phone: false },
};

const BODEGA_POOL: readonly PictogramKind[] = ['sandwich', 'coffee', 'lottery', 'atm', 'soda'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Everything the awning painter needs, from the sign text alone. */
export function layoutAwning(text: string): AwningLayout {
  const upper = text.toUpperCase();
  const archetype = classifyArchetype(upper);
  const { main, secondary } = splitSecondary(upper);
  const theme = THEMES[archetype];
  const h = Rng.hash(upper);
  let pictograms: PictogramKind[];
  if (archetype === 'bodega') {
    // four of the five usual bodega icons, rotated by the hash; the ATM sign is always there when the text says ATM
    const skip = (h >>> 9) % BODEGA_POOL.length;
    let pool = BODEGA_POOL.filter((_, i) => i !== skip);
    if (/\bATM\b/.test(upper) && !pool.includes('atm')) pool = [...pool.slice(0, 3), 'atm'];
    const rot = (h >>> 5) % pool.length;
    pictograms = [...pool.slice(rot), ...pool.slice(0, rot)].slice(0, 4);
  } else {
    pictograms = [...theme.pictograms];
  }
  const layout: AwningLayout = {
    style: awningStyleFor(text, archetype),
    archetype,
    mainLine: main,
    subLine: secondary,
    pictograms,
    stripe: theme.stripe,
    bandColors: [...theme.colors],
  };
  if (theme.phone) layout.phone = `718-555-01${pad2(h % 100)}`;
  return layout;
}

const BADGE_OPEN = /OPEN\s*(\d{1,2})\s*(?:HRS?|HOURS)\b/i;
const BADGE_EBT = /WE ACCEPT EBT|\bEBT\b/i;
const BADGE_ATM = /\bATM\b/i;
const NEON_PALETTE = ['#ff3d81', '#2ee6ff', '#ffb02e', '#ff4a3d', '#7dff6b', '#c46bff'];

function stripBadgeWords(s: string): string {
  return s
    .replace(new RegExp(BADGE_OPEN.source, 'gi'), ' ')
    .replace(/WE ACCEPT EBT|\bEBT\b/gi, ' ')
    .replace(/\bATM\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*·(?:\s*·)+/g, ' ·')
    .replace(/^[\s·&,\-]+|[\s·&,\-]+$/g, '');
}

/** Lightbox layout: 1-2 lines, up to two corner badges (OPEN n HRS, ATM, WE ACCEPT EBT), neon for bars/liquor. */
export function layoutSign(text: string): SignLayout {
  const upper = text.toUpperCase();
  const archetype = classifyArchetype(upper);
  const h = Rng.hash(upper);
  const found: SignBadge[] = [];
  const open = BADGE_OPEN.exec(text);
  if (open) found.push({ kind: 'open', label: `OPEN ${open[1]} HRS` });
  if (BADGE_ATM.test(text)) found.push({ kind: 'atm', label: 'ATM' });
  if (BADGE_EBT.test(text)) found.push({ kind: 'ebt', label: 'WE ACCEPT EBT' });
  // corner stores carry the stickers whether or not the text says so
  if (archetype === 'bodega') {
    if (!found.some((b) => b.kind === 'atm') && ((h >>> 3) & 1) === 1) found.push({ kind: 'atm', label: 'ATM' });
    if (!found.some((b) => b.kind === 'ebt') && ((h >>> 5) & 3) !== 0) found.push({ kind: 'ebt', label: 'WE ACCEPT EBT' });
  }
  const order: BadgeKind[] = ['open', 'atm', 'ebt'];
  const badges = found.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).slice(0, 2);

  const { main, secondary } = splitSecondary(text);
  let mainLine = stripBadgeWords(main);
  if (!mainLine) mainLine = main;
  const sub = secondary ? stripBadgeWords(secondary) : '';
  const theme = THEMES[archetype];
  const stripeColors = theme.colors.filter((c) => c !== '#ffffff');
  const n0 = (h >>> 11) % NEON_PALETTE.length;
  const n1 = (n0 + 1 + ((h >>> 17) % (NEON_PALETTE.length - 1))) % NEON_PALETTE.length;
  return {
    archetype,
    mainLine,
    subLine: sub || null,
    badges,
    neon: archetype === 'liquor',
    neonColors: [NEON_PALETTE[n0], NEON_PALETTE[n1]],
    icon: theme.pictograms.length ? theme.pictograms[0] : archetype === 'bodega' ? 'sandwich' : null,
    stripeColor: stripeColors.length ? stripeColors[h % stripeColors.length] : '#d62828',
  };
}

// ---------------------------------------------------------------------------------------------- primitives

/** Natural main colour of each pictogram. */
export const PICTOGRAM_COLOR: Record<PictogramKind, string> = {
  sandwich: '#d9a15b', coffee: '#1f5fbf', lottery: '#d62828', atm: '#1f5fbf', washer: '#2f6fb5', shirt: '#2f6fb5',
  scissors: '#9aa0a6', comb: '#d62828', braid: '#5a3220', pizza: '#f2b134', soda: '#d32f2f', bowl: '#c4252b',
  bottle: '#1d6b3a', glass: '#c4252b', tag: '#d62828', medcross: '#0a7f5a', pill: '#d62828', block: '#e53935',
  star: '#f2b134', candle: '#f1ead8', wrench: '#444444', tire: '#c4252b', cross: '#5a2d82', house: '#7a4a2a',
};

/** Rounded-rectangle path (quadratic corners) centred at (cx, cy); the caller fills/strokes. */
function roundedPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, r: number): void {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x0 + k, y0);
  ctx.lineTo(x1 - k, y0);
  ctx.quadraticCurveTo(x1, y0, x1, y0 + k);
  ctx.lineTo(x1, y1 - k);
  ctx.quadraticCurveTo(x1, y1, x1 - k, y1);
  ctx.lineTo(x0 + k, y1);
  ctx.quadraticCurveTo(x0, y1, x0, y1 - k);
  ctx.lineTo(x0, y0 + k);
  ctx.quadraticCurveTo(x0, y0, x0 + k, y0);
  ctx.closePath();
}

/** A sticker-like plate behind an icon or phone number. */
export function drawPlate(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, fill: string, border: string, alpha = 0.94,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  roundedPath(ctx, cx, cy, w, h, Math.min(w, h) * 0.22);
  ctx.fill();
  ctx.globalAlpha = Math.min(1, alpha + 0.05);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.5;
  roundedPath(ctx, cx, cy, w, h, Math.min(w, h) * 0.22);
  ctx.stroke();
  ctx.restore();
}

// segments a b c d e f g
const SEG_MASK: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg',
  '9': 'abcdfg', '-': 'g',
};

/**
 * Seven-segment digits (and hyphens) from fillRects, centred on (cx, cy), `height` px tall. Used for the phone
 * numbers and the 99 price tag so they never go through fillText.
 */
export function drawSegmentDigits(
  ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, height: number, color: string,
): void {
  const th = Math.max(1.5, height * 0.14);
  const dw = height * 0.52;
  const gap = height * 0.3;
  const widthOf = (ch: string): number => (ch === '-' ? dw * 0.7 : dw);
  let total = gap * (text.length - 1);
  for (const ch of text) total += widthOf(ch);
  let x = cx - total / 2;
  const y0 = cy - height / 2;
  const ym = cy - th / 2;
  const yb = cy + height / 2 - th;
  const upperH = ym - y0 - th * 0.2;
  const lowerH = yb - ym - th * 0.2;
  ctx.fillStyle = color;
  for (const ch of text) {
    const mask = SEG_MASK[ch];
    const wd = widthOf(ch);
    if (mask) {
      const hs = wd - th * 1.2;
      if (mask.includes('a')) ctx.fillRect(x + th * 0.6, y0, hs, th);
      if (mask.includes('g')) ctx.fillRect(x + th * 0.6, ym, hs, th);
      if (mask.includes('d')) ctx.fillRect(x + th * 0.6, yb, hs, th);
      if (mask.includes('f')) ctx.fillRect(x, y0 + th * 0.6, th, upperH);
      if (mask.includes('b')) ctx.fillRect(x + wd - th, y0 + th * 0.6, th, upperH);
      if (mask.includes('e')) ctx.fillRect(x, ym + th * 0.6, th, lowerH);
      if (mask.includes('c')) ctx.fillRect(x + wd - th, ym + th * 0.6, th, lowerH);
    }
    x += wd + gap;
  }
}

/**
 * Draw a simple product/service pictogram from canvas primitives, centred on (x, y) inside a `size` px square.
 * `color` is the icon's main colour (see PICTOGRAM_COLOR); small details use fixed colours. `aspect` (> 1) squeezes
 * the icon horizontally to cancel a stretched texture mapping. Leaves the context state as it found it.
 */
export function drawPictogram(
  ctx: CanvasRenderingContext2D, kind: PictogramKind, x: number, y: number, size: number, color: string, aspect = 1,
): void {
  const u = size / 2;
  ctx.save();
  ctx.translate(x, y);
  if (aspect !== 1) ctx.scale(1 / aspect, 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const rect = (a: number, b: number, c: number, d: number, fill: string): void => {
    ctx.fillStyle = fill;
    ctx.fillRect(a * u, b * u, c * u, d * u);
  };
  const poly = (pts: readonly number[], fill: string): void => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(pts[0] * u, pts[1] * u);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * u, pts[i + 1] * u);
    ctx.closePath();
    ctx.fill();
  };
  const disc = (cx: number, cy: number, r: number, fill: string): void => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx * u, cy * u, r * u, 0, Math.PI * 2);
    ctx.fill();
  };
  const line = (pts: readonly number[], width: number, stroke: string): void => {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, width * u);
    ctx.beginPath();
    ctx.moveTo(pts[0] * u, pts[1] * u);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * u, pts[i + 1] * u);
    ctx.stroke();
  };
  switch (kind) {
    case 'sandwich':
      rect(-0.85, 0.34, 1.7, 0.3, color);
      rect(-0.92, 0.14, 1.84, 0.2, '#5fae3b');
      rect(-0.8, -0.06, 1.6, 0.2, '#f4c430');
      rect(-0.86, -0.24, 1.72, 0.18, '#a8442c');
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, -0.24 * u, 0.86 * u, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      rect(-0.35, -0.7, 0.12, 0.07, '#fff3c4');
      rect(0.05, -0.78, 0.12, 0.07, '#fff3c4');
      rect(0.4, -0.55, 0.12, 0.07, '#fff3c4');
      break;
    case 'coffee':
      poly([-0.55, -0.5, 0.55, -0.5, 0.4, 0.88, -0.4, 0.88], color);
      rect(-0.66, -0.78, 1.32, 0.26, '#f4efe4');
      rect(-0.52, -0.1, 1.04, 0.36, '#f4efe4');
      rect(-0.52, -0.02, 1.04, 0.05, '#d4af37');
      rect(-0.52, 0.17, 1.04, 0.05, '#d4af37');
      break;
    case 'lottery':
      disc(0, 0, 0.9, color);
      disc(0, 0, 0.5, '#ffffff');
      line([-0.22, -0.24, 0.24, -0.24, -0.08, 0.3], 0.15, '#222222');
      break;
    case 'atm':
      rect(-0.9, -0.88, 1.8, 1.76, color);
      rect(-0.7, -0.68, 1.4, 0.72, '#cfeeff');
      line([0.22, -0.52, -0.2, -0.52, -0.2, -0.32, 0.2, -0.32, 0.2, -0.12, -0.22, -0.12], 0.09, '#1f5fbf');
      rect(-0.6, 0.2, 0.3, 0.14, '#ffffff');
      rect(-0.15, 0.2, 0.3, 0.14, '#ffffff');
      rect(0.3, 0.2, 0.3, 0.14, '#ffffff');
      rect(-0.5, 0.52, 1.0, 0.13, '#111111');
      break;
    case 'washer':
      rect(-0.85, -0.92, 1.7, 1.84, '#e9eef2');
      rect(-0.85, -0.92, 1.7, 0.3, color);
      disc(-0.5, -0.77, 0.07, '#ffffff');
      disc(-0.25, -0.77, 0.07, '#ffffff');
      disc(0.04, 0.16, 0.6, '#44505a');
      disc(0.04, 0.16, 0.45, '#6cb4e8');
      rect(-0.2, -0.05, 0.28, 0.1, '#cfeeff');
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, 0.1 * u);
      ctx.strokeRect(-0.85 * u, -0.92 * u, 1.7 * u, 1.84 * u);
      break;
    case 'shirt':
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-0.4 * u, -0.8 * u);
      ctx.lineTo(-0.16 * u, -0.8 * u);
      ctx.quadraticCurveTo(0, -0.5 * u, 0.16 * u, -0.8 * u);
      ctx.lineTo(0.4 * u, -0.8 * u);
      ctx.lineTo(0.95 * u, -0.4 * u);
      ctx.lineTo(0.7 * u, -0.05 * u);
      ctx.lineTo(0.46 * u, -0.22 * u);
      ctx.lineTo(0.46 * u, 0.88 * u);
      ctx.lineTo(-0.46 * u, 0.88 * u);
      ctx.lineTo(-0.46 * u, -0.22 * u);
      ctx.lineTo(-0.7 * u, -0.05 * u);
      ctx.lineTo(-0.95 * u, -0.4 * u);
      ctx.closePath();
      ctx.fill();
      rect(-0.46, 0.7, 0.92, 0.06, '#ffffff');
      break;
    case 'scissors':
      line([-0.22, 0.3, 0.38, -0.92], 0.17, color);
      line([0.22, 0.3, -0.38, -0.92], 0.17, '#cfd3d7');
      ctx.strokeStyle = '#d62828';
      ctx.lineWidth = Math.max(1, 0.14 * u);
      ctx.beginPath();
      ctx.arc(-0.42 * u, 0.58 * u, 0.3 * u, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0.42 * u, 0.58 * u, 0.3 * u, 0, Math.PI * 2);
      ctx.stroke();
      disc(0, 0.12, 0.08, '#222222');
      break;
    case 'comb':
      rect(-0.92, -0.3, 1.84, 0.48, color);
      for (let i = 0; i < 9; i++) rect(-0.92 + i * 0.2, 0.18, 0.11, 0.62, color);
      rect(-0.92, -0.3, 1.84, 0.1, '#ffffff');
      break;
    case 'braid':
      for (let i = 0; i < 5; i++) line([-0.5, -0.85 + i * 0.32, 0, -0.55 + i * 0.32, 0.5, -0.85 + i * 0.32], 0.2, color);
      rect(-0.3, 0.74, 0.6, 0.16, '#d62828');
      break;
    case 'pizza':
      rect(-0.97, -0.9, 1.94, 0.3, '#c97a2b');
      poly([-0.9, -0.6, 0.9, -0.6, 0, 0.92], color);
      disc(-0.3, -0.25, 0.19, '#b3261e');
      disc(0.32, -0.28, 0.19, '#b3261e');
      disc(0, 0.28, 0.16, '#b3261e');
      break;
    case 'soda':
      poly([-0.5, -0.45, 0.5, -0.45, 0.36, 0.9, -0.36, 0.9], color);
      rect(-0.6, -0.65, 1.2, 0.22, '#f4efe4');
      rect(-0.44, 0.0, 0.88, 0.32, '#ffffff');
      line([0.15, -0.65, 0.3, -0.95], 0.1, '#222222');
      break;
    case 'bowl':
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, -0.1 * u, 0.9 * u, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      rect(-0.96, -0.2, 1.92, 0.14, '#f4efe4');
      line([-0.35, -0.3, -0.25, -0.55, -0.4, -0.8], 0.07, '#9aa0a6');
      line([0.05, -0.3, 0.15, -0.55, 0.0, -0.8], 0.07, '#9aa0a6');
      line([0.3, -0.25, 0.85, -0.95], 0.07, '#7a4a2a');
      line([0.42, -0.25, 0.95, -0.85], 0.07, '#7a4a2a');
      break;
    case 'bottle':
      rect(-0.3, -0.05, 0.6, 0.95, color);
      poly([-0.3, -0.05, -0.12, -0.45, 0.12, -0.45, 0.3, -0.05], color);
      rect(-0.12, -0.9, 0.24, 0.5, color);
      rect(-0.14, -0.95, 0.28, 0.16, '#d4af37');
      rect(-0.3, 0.3, 0.6, 0.38, '#f3e9c6');
      break;
    case 'glass':
      poly([-0.88, -0.82, 0.88, -0.82, 0, 0.1], color);
      rect(-0.07, 0.1, 0.14, 0.72, '#cfd3d7');
      rect(-0.48, 0.8, 0.96, 0.12, '#cfd3d7');
      disc(0.15, -0.5, 0.1, '#3a7d2a');
      line([0.15, -0.5, 0.55, -0.95], 0.05, '#cfd3d7');
      break;
    case 'tag':
      poly([-0.95, 0, -0.5, -0.62, 0.92, -0.62, 0.92, 0.62, -0.5, 0.62], color);
      disc(-0.5, 0, 0.09, '#ffffff');
      drawSegmentDigits(ctx, '99', 0.22 * u, 0, 0.82 * u, '#ffffff');
      break;
    case 'medcross':
      rect(-0.3, -0.92, 0.6, 1.84, color);
      rect(-0.92, -0.3, 1.84, 0.6, color);
      rect(-0.12, -0.7, 0.24, 1.4, '#ffffff');
      rect(-0.7, -0.12, 1.4, 0.24, '#ffffff');
      break;
    case 'pill':
      ctx.save();
      ctx.rotate(-Math.PI / 4);
      rect(-0.8, -0.3, 0.8, 0.6, color);
      disc(-0.8, 0, 0.3, color);
      rect(0, -0.3, 0.8, 0.6, '#f5f5f5');
      disc(0.8, 0, 0.3, '#f5f5f5');
      rect(-0.04, -0.3, 0.08, 0.6, '#222222');
      ctx.restore();
      break;
    case 'block':
      rect(-0.82, -0.82, 1.64, 1.64, color);
      rect(-0.82, -0.82, 1.64, 0.14, '#ffffff');
      line([-0.4, 0.55, 0, -0.5, 0.4, 0.55], 0.16, '#ffffff');
      line([-0.2, 0.15, 0.2, 0.15], 0.12, '#ffffff');
      break;
    case 'star': {
      const pts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 0.95 : 0.4;
        pts.push(Math.cos(a) * r, Math.sin(a) * r + 0.05);
      }
      poly(pts, color);
      break;
    }
    case 'candle':
      rect(-0.26, -0.1, 0.52, 0.8, color);
      rect(-0.45, 0.68, 0.9, 0.2, '#c8a24a');
      line([0, -0.1, 0, -0.28], 0.05, '#222222');
      ctx.fillStyle = '#f2b134';
      ctx.beginPath();
      ctx.moveTo(0, -0.95 * u);
      ctx.quadraticCurveTo(0.34 * u, -0.5 * u, 0, -0.3 * u);
      ctx.quadraticCurveTo(-0.34 * u, -0.5 * u, 0, -0.95 * u);
      ctx.closePath();
      ctx.fill();
      break;
    case 'wrench':
      ctx.save();
      ctx.rotate(Math.PI / 4);
      rect(-0.14, -0.15, 0.28, 1.1, color);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, 0.26 * u);
      ctx.beginPath();
      ctx.arc(0, -0.5 * u, 0.4 * u, -Math.PI / 2 + 0.6, Math.PI * 1.5 - 0.6);
      ctx.stroke();
      ctx.restore();
      break;
    case 'tire':
      disc(0, 0, 0.92, '#1d1d1d');
      disc(0, 0, 0.58, '#b9bec4');
      disc(0, 0, 0.4, color);
      disc(0, 0, 0.12, '#222222');
      break;
    case 'cross':
      rect(-0.19, -0.95, 0.38, 1.9, color);
      rect(-0.58, -0.5, 1.16, 0.34, color);
      rect(-0.05, -0.8, 0.1, 1.6, '#d4af37');
      break;
    case 'house':
      poly([-0.97, -0.08, 0, -0.92, 0.97, -0.08], color);
      rect(-0.72, -0.08, 1.44, 0.96, '#f1ead8');
      rect(-0.2, 0.32, 0.4, 0.56, color);
      rect(-0.6, 0.05, 0.26, 0.26, '#8fd0f0');
      rect(0.34, 0.05, 0.26, 0.26, '#8fd0f0');
      break;
  }
  ctx.restore();
}

/**
 * Stripe/band art in the rectangle (x, y, w, h): bold bands, barber-pole diagonals, gingham checks, waves, dots,
 * zigzag braids or a gold pin-stripe, depending on the archetype. Colours cycle through `colors`.
 */
export function drawStripe(
  ctx: CanvasRenderingContext2D, kind: StripeKind, x: number, y: number, w: number, h: number, colors: readonly string[],
): void {
  if (kind === 'none' || colors.length === 0) return;
  const col = (i: number): string => colors[i % colors.length];
  ctx.save();
  switch (kind) {
    case 'bands':
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = col(i);
        ctx.fillRect(x, y + (h * i) / 3, w, h / 3 + 0.5);
      }
      break;
    case 'diagonal': {
      ctx.fillStyle = col(0);
      ctx.fillRect(x, y, w, h);
      const bw = Math.max(8, h * 0.8);
      const slant = h * 0.8;
      const cl = (v: number): number => Math.max(x, Math.min(x + w, v));
      let k = 1;
      for (let xa = x - slant; xa < x + w; xa += bw * 2) {
        ctx.fillStyle = col(k === 1 && colors.length > 2 ? 2 : 1);
        ctx.beginPath();
        ctx.moveTo(cl(xa), y + h);
        ctx.lineTo(cl(xa + bw), y + h);
        ctx.lineTo(cl(xa + bw + slant), y);
        ctx.lineTo(cl(xa + slant), y);
        ctx.closePath();
        ctx.fill();
        k = 1 + (k % 2);
      }
      break;
    }
    case 'checker': {
      const sq = h / 2;
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c * sq < w; c++) {
          ctx.fillStyle = col((r + c) % 2);
          ctx.fillRect(x + c * sq, y + r * sq, Math.min(sq, x + w - (x + c * sq)), sq);
        }
      }
      break;
    }
    case 'waves':
      ctx.lineCap = 'round';
      for (let r = 0; r < 3; r++) {
        ctx.strokeStyle = col(r);
        ctx.lineWidth = 2.5;
        const cy = y + (h * (r + 0.5)) / 3;
        ctx.beginPath();
        ctx.moveTo(x, cy);
        for (let px = x; px < x + w; px += 16) {
          ctx.quadraticCurveTo(px + 4, cy - 4, px + 8, cy);
          ctx.quadraticCurveTo(px + 12, cy + 4, px + 16, cy);
        }
        ctx.stroke();
      }
      break;
    case 'dots': {
      const r = h * 0.3;
      const step = h * 1.25;
      let i = 0;
      for (let px = x + step / 2; px < x + w; px += step) {
        ctx.fillStyle = col(i++);
        ctx.beginPath();
        ctx.arc(px, y + h / 2, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'zigzag':
      ctx.lineJoin = 'round';
      for (let r = 0; r < 2; r++) {
        ctx.strokeStyle = col(r);
        ctx.lineWidth = 3;
        ctx.beginPath();
        const half = h * 0.45;
        const off = r === 0 ? 0 : half;
        ctx.moveTo(x, y + h * 0.15);
        let up = false;
        for (let px = x + half - off; px <= x + w + half; px += half) {
          ctx.lineTo(Math.min(px, x + w), y + (up ? h * 0.15 : h * 0.85));
          up = !up;
        }
        ctx.stroke();
      }
      break;
    case 'pin':
      ctx.fillStyle = col(0);
      ctx.fillRect(x, y + h * 0.2, w, 2.5);
      ctx.fillRect(x, y + h * 0.65, w, 1.5);
      break;
  }
  ctx.restore();
}
