/**
 * Detail atlas (TEXVAR): four relative-luminance tiles from small CC0 ambientCG sets (stucco, glazed tile, cobble,
 * cast stone; scripts/fetch-detail-atlas.mjs, licences in src/assets/textures/cc0/detail_*, docs/CREDITS.md), plus a
 * canvas-painted sheet of faded wall signs. Both are shared by the per-lot wall shader and the ground detail shader, so
 * the extra variety costs no meshes and no draw calls. Value 128 in the atlas means "x 1.0": any bleed between tiles at a
 * distance is neutral. The artifact inlines only the 512 px-tile atlas; the hosted build (VITE_HOSTED=1) ships the 1k one.
 */
import * as THREE from 'three';

const HOSTED = import.meta.env.VITE_HOSTED === '1';
const FILES = (HOSTED
  ? import.meta.glob('@/assets/textures/detail_atlas_1k.jpg', { eager: true, query: '?url', import: 'default' })
  : import.meta.glob('@/assets/textures/detail_atlas_512.jpg', { eager: true, query: '?url', import: 'default' })) as Record<string, string>;

export const DETAIL_TILES = ['stucco', 'tile', 'cobble', 'caststone'] as const;
export type DetailTile = (typeof DETAIL_TILES)[number];
export const DETAIL_INDEX: Record<DetailTile, number> = { stucco: 0, tile: 1, cobble: 2, caststone: 3 };

/** Parody wall-sign lines (painted on blank side walls). Invented names; any resemblance to a real firm is accidental. */
export const WALL_SIGNS: ReadonlyArray<{ lines: [string, string?]; bg: string; fg: string }> = [
  { lines: ['FULTON FEED & GRAIN', 'HAY  -  OATS  -  SEED'], bg: '#c9b98f', fg: '#5a2b22' },
  { lines: ['MARCY AVE.', 'SHOE HOSPITAL'], bg: '#2f4a5c', fg: '#e9dfc4' },
  { lines: ["KELLY'S COAL & ICE", 'WE DELIVER'], bg: '#d8d0b8', fg: '#1f2a33' },
  { lines: ['STUYVESANT STEAM', 'LAUNDRY'], bg: '#e3d9b6', fg: '#7a1f1c' },
  { lines: ["GOLDSTEIN'S FINE", 'FURNITURE  -  EASY TERMS'], bg: '#3b2f2a', fg: '#e4c36a' },
  { lines: ['BEDFORD BOTTLING', 'WORKS  -  EST. 1911'], bg: '#d9c9a2', fg: '#244a3c' },
  { lines: ['NOSTRAND AVE.', 'PIANO COMPANY'], bg: '#1f3b57', fg: '#f0e6c8' },
  { lines: ["DOC PEPPERMINT'S", 'TONIC  -  5 CENTS'], bg: '#a63a30', fg: '#f3ead0' },
];
export const SIGN_COLS = 2;
export const SIGN_ROWS = 4;
const SIGN_W = 512;
const SIGN_H = 160;

/** Paint the sign sheet (RGBA: opaque painted rectangle with lettering, transparent elsewhere). Deterministic. */
export function paintWallSigns(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, SIGN_W * SIGN_COLS, SIGN_H * SIGN_ROWS);
  WALL_SIGNS.forEach((s, i) => {
    const x = (i % SIGN_COLS) * SIGN_W, y = Math.floor(i / SIGN_COLS) * SIGN_H;
    ctx.fillStyle = s.bg;
    ctx.fillRect(x + 6, y + 6, SIGN_W - 12, SIGN_H - 12);
    ctx.strokeStyle = s.fg;
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 14, y + 14, SIGN_W - 28, SIGN_H - 28);
    ctx.fillStyle = s.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fit = (txt: string, size: number, cy: number): void => {
      ctx.font = `bold ${size}px "Arial Narrow", Impact, "Helvetica Neue", Arial, sans-serif`;
      let w = ctx.measureText(txt).width;
      if (w > SIGN_W - 56) { size = Math.floor((size * (SIGN_W - 56)) / w); ctx.font = `bold ${size}px "Arial Narrow", Impact, "Helvetica Neue", Arial, sans-serif`; w = ctx.measureText(txt).width; }
      ctx.fillText(txt, x + SIGN_W / 2, y + cy);
    };
    if (s.lines[1]) { fit(s.lines[0], 52, 58); fit(s.lines[1], 30, 108); } else fit(s.lines[0], 56, SIGN_H / 2);
  });
}

let atlas: THREE.Texture | null = null;
let signs: THREE.CanvasTexture | null = null;

function flatImage(v: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 2;
  const g = c.getContext('2d');
  if (g) { g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, 0, 2, 2); }
  return c;
}

/** The shared atlas texture. Starts as flat mid-grey (neutral) and swaps to the photo atlas when it has loaded. */
export function detailAtlasTexture(): THREE.Texture {
  if (!atlas) {
    const t = new THREE.Texture((flatImage(128) ?? undefined) as HTMLCanvasElement | undefined);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 4;
    t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
    atlas = t;
    const url = Object.values(FILES)[0];
    if (url && typeof Image !== 'undefined') {
      const img = new Image();
      img.onload = () => { t.image = img as unknown as HTMLCanvasElement; t.needsUpdate = true; };
      img.src = url;
    }
  }
  return atlas;
}

/** The shared sign sheet (canvas, transparent until painted). */
export function wallSignTexture(): THREE.Texture {
  if (!signs) {
    const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (c) {
      c.width = SIGN_W * SIGN_COLS; c.height = SIGN_H * SIGN_ROWS;
      const g = c.getContext('2d');
      if (g) paintWallSigns(g);
    }
    signs = new THREE.CanvasTexture((c ?? undefined) as HTMLCanvasElement | undefined);
    signs.colorSpace = THREE.SRGBColorSpace;
    signs.wrapS = signs.wrapT = THREE.ClampToEdgeWrapping;
    signs.anisotropy = 4;
    signs.needsUpdate = true;
  }
  return signs;
}

export function disposeDetailTextures(): void { atlas?.dispose(); signs?.dispose(); atlas = null; signs = null; }

/** GLSL: `dtlRel(tile, p)` = relative luminance (about 1.0) of an atlas tile repeated once per unit of `p`. Needs `tDetail`. */
export const DETAIL_GLSL = `uniform sampler2D tDetail;
float dtlRel( float tile, vec2 p ) {
  vec2 f = fract( p );
  vec2 o = vec2( mod( tile, 2.0 ), floor( tile / 2.0 ) ) * 0.5;
  return textureGrad( tDetail, o + 0.002 + f * 0.496, dFdx( p ) * 0.496, dFdy( p ) * 0.496 ).r * 2.0;
}
float dtlGain( float tile, vec2 p, float gain ) { return 1.0 + ( dtlRel( tile, p ) - 1.0 ) * gain; }`;
