/**
 * Graffiti loading panels. `LoadArt` draws each panel ONCE to an offscreen canvas sized for the tier, turns it into an image
 * URL and frees the canvas at once; the loading screen shows the image (the slow push-in is CSS). `release()` frees every URL.
 * Order is seeded: each visit passes a new seed.
 */
import { rnd, type Rnd } from './kit';
import { paintPanel, PANELS } from './panels';

export { PANELS } from './panels';

/** Fisher-Yates over panel indexes, deterministic for a seed. */
export function panelOrder(seed: number, n = PANELS.length): number[] {
  const R = rnd(seed ^ 0x5eed), a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = R.i(i + 1); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

/** Canvas size for a viewport: the phone tier gets at most the screen at device pixel ratio 1, desktop at most about 1.4 megapixels. */
export function artSize(vw: number, vh: number, phone: boolean): { w: number; h: number } {
  vw = Math.max(240, Math.round(vw)); vh = Math.max(240, Math.round(vh));
  const cap = phone ? 1 : Math.min(1, Math.sqrt(1_400_000 / (vw * vh)));
  return { w: Math.round(vw * cap), h: Math.round(vh * cap) };
}

/** Draws panel `index` (0..6) with `seed` into a fresh canvas context sized w by h. */
export function drawPanel(c: CanvasRenderingContext2D, index: number, seed: number, w: number, h: number): Rnd {
  const R = rnd(seed * 131 + index * 7919 + 17);
  paintPanel(c, PANELS[index % PANELS.length]!, R, w, h);
  return R;
}

const withFont = async (doc: Document): Promise<void> => {
  const fonts = (doc as Document & { fonts?: { load(f: string): Promise<unknown> } }).fonts;
  if (!fonts) return;
  await Promise.race([fonts.load('80px Anton').catch(() => 0), new Promise((r) => setTimeout(r, 1200))]);
};

export class LoadArt {
  private urls: string[] = [];
  private order: number[];
  private n = 0;
  private dead = false;
  readonly w: number;
  readonly h: number;

  private constructor(private readonly doc: Document, private readonly seed: number, w: number, h: number) { this.order = panelOrder(seed); this.w = w; this.h = h; }

  /** Null when there is no 2D canvas (jsdom, very old browsers): the caller keeps its old pictures. */
  static create(doc: Document, seed: number, phone: boolean): LoadArt | null {
    try {
      if (/jsdom/i.test(doc.defaultView?.navigator?.userAgent ?? '')) return null;
      const t = doc.createElement('canvas');
      if (!t.getContext?.('2d')) return null;
      const win = doc.defaultView!;
      const { w, h } = artSize(win.innerWidth || 1280, win.innerHeight || 720, phone);
      return new LoadArt(doc, seed, w, h);
    } catch { return null; }
  }

  get rendered(): number { return this.urls.length; }
  get total(): number { return this.order.length; }
  get urlList(): readonly string[] { return this.urls; }

  /** Draws the next panel not yet drawn (null when all are drawn or the art was released). */
  async next(): Promise<string | null> {
    if (this.dead || this.n >= this.order.length) return null;
    await withFont(this.doc);
    if (this.dead) return null;
    const idx = this.order[this.n++]!;
    const cv = this.doc.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    const c = cv.getContext('2d');
    if (!c) return null;
    drawPanel(c, idx, this.seed, this.w, this.h);
    const url = await toUrl(cv);
    cv.width = 0; cv.height = 0; // the memory goes back at once; only the compressed image stays
    if (this.dead) { revoke(url); return null; }
    this.urls.push(url);
    return url;
  }

  /** Frees every image and stops drawing. */
  release(): void { this.dead = true; for (const u of this.urls) revoke(u); this.urls = []; }
}

function toUrl(cv: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve) => {
    if (typeof cv.toBlob === 'function' && typeof URL !== 'undefined' && URL.createObjectURL) cv.toBlob((b) => resolve(b ? URL.createObjectURL(b) : cv.toDataURL('image/jpeg', 0.82)), 'image/jpeg', 0.82);
    else resolve(cv.toDataURL('image/jpeg', 0.82));
  });
}
const revoke = (u: string): void => { if (u.startsWith('blob:')) try { URL.revokeObjectURL(u); } catch { /* ignore */ } };

/** Spray-painted bar: one wobbly fat-cap stroke, drawn once. Returns a data URL, or '' without a canvas. */
export function sprayBarImage(doc: Document, seed: number): string {
  try {
    const cv = doc.createElement('canvas'); cv.width = 480; cv.height = 40;
    const c = cv.getContext('2d'); if (!c) return '';
    const R = rnd(seed + 99);
    const g = c.createLinearGradient(0, 0, 480, 0); g.addColorStop(0, '#ff6a2b'); g.addColorStop(0.5, '#f2c230'); g.addColorStop(1, '#ffe27a');
    for (let x = 6; x < 474; x += 3) {
      const y = 20 + Math.sin(x / 40) * 2 + R.r(-1.2, 1.2);
      c.globalAlpha = 0.55; c.fillStyle = g; c.beginPath(); c.arc(x, y, R.r(11, 14), 0, 6.283); c.fill();
    }
    c.globalAlpha = 1; c.strokeStyle = g; c.lineWidth = 15; c.lineCap = 'round'; c.beginPath(); c.moveTo(8, 20); for (let x = 8; x < 472; x += 16) c.lineTo(x, 20 + Math.sin(x / 40) * 2); c.stroke();
    c.fillStyle = '#ffe27a'; for (let k = 0; k < 160; k++) { c.globalAlpha = R.r(0.2, 0.7); c.beginPath(); c.arc(R.f() * 480, 20 + R.r(-19, 19), R.r(0.6, 1.5), 0, 6.283); c.fill(); }
    const url = cv.toDataURL('image/png'); cv.width = 0; cv.height = 0; return url;
  } catch { return ''; }
}
