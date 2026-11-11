import type { Vec2 } from '@/core/Math2';
import { REAL_FRAME } from '@/world/roadnet/geom';

export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

/** View angle that puts TRUE north up: the game's axes are turned REAL_FRAME.rotDeg from north (+x has bearing 81.4 deg). */
export const NORTH_UP_ANGLE = -(REAL_FRAME.rotDeg * Math.PI) / 180;
export const MAP_MAX_SCALE = 6;
/** Zoom steps as multiples of the fit scale: 1 is the built area filling the screen, below 1 is the Brooklyn overview. */
export const ZOOM_STEPS = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8] as const;
/** Metres the centre may stray past the built area at normal zoom. */
export const PAN_MARGIN = 60;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Pure view transform: world metres <-> screen px, with zoom about a point. The map is north up: the grid frame is turned by
 * `ang` on screen so true north is up. `area` is the built (playable) area; `far` (optional) the larger region the centre may
 * reach when zoomed out past the fit scale (the Brooklyn overview).
 */
export class MapView {
  cx = 0; cz = 0; scale = 0.3; w = 390; h = 844;
  minScale = 0.02;
  maxScale = MAP_MAX_SCALE;
  ang = NORTH_UP_ANGLE;
  /** scale at which the built area just fits the free part of the screen */
  fitScale = 0.3;
  area: Rect | null = null;
  far: Rect | null = null;
  /** screen position of the view centre (the free area between the top and bottom bars) */
  ox = 195; oy = 422;

  /** Fits the built area (plus `margin` metres) into the free viewport, north up, centred. */
  fit(b: Rect, margin = 40, reserveTop = 0, reserveBottom = 0): void {
    this.area = b;
    const c = Math.abs(Math.cos(this.ang)), s = Math.abs(Math.sin(this.ang));
    const bw = b.maxX - b.minX + margin * 2, bh = b.maxZ - b.minZ + margin * 2;
    const sw = bw * c + bh * s, sh = bw * s + bh * c; // screen extent of the turned rectangle
    const availH = Math.max(50, this.h - reserveTop - reserveBottom);
    this.fitScale = Math.min(this.w / sw, availH / sh);
    this.scale = this.fitScale;
    this.cx = (b.minX + b.maxX) / 2;
    this.cz = (b.minZ + b.maxZ) / 2;
    this.ox = this.w / 2; this.oy = reserveTop + availH / 2;
    this.setFar(this.far);
  }
  /** Sets the larger region reachable by zooming out (the overview); null limits zoom-out to just past the fit scale. */
  setFar(r: Rect | null): void {
    this.far = r;
    this.minScale = r ? this.fitScale / 16.5 : this.fitScale * 0.85;
  }

  toScreen(x: number, z: number): { x: number; y: number } {
    const dx = (x - this.cx) * this.scale, dz = (z - this.cz) * this.scale;
    const c = Math.cos(this.ang), s = Math.sin(this.ang);
    return { x: this.ox + dx * c - dz * s, y: this.oy + dx * s + dz * c };
  }
  toWorld(sx: number, sy: number): Vec2 {
    const u = sx - this.ox, v = sy - this.oy;
    const c = Math.cos(this.ang), s = Math.sin(this.ang);
    return { x: this.cx + (u * c + v * s) / this.scale, z: this.cz + (-u * s + v * c) / this.scale };
  }
  /** World rectangle covering the viewport (axis-aligned in the grid frame; for culling). */
  visible(pad = 0): Rect {
    const p = [this.toWorld(-pad, -pad), this.toWorld(this.w + pad, -pad), this.toWorld(this.w + pad, this.h + pad), this.toWorld(-pad, this.h + pad)];
    return { minX: Math.min(...p.map((q) => q.x)), maxX: Math.max(...p.map((q) => q.x)), minZ: Math.min(...p.map((q) => q.z)), maxZ: Math.max(...p.map((q) => q.z)) };
  }
  /** Multiplies the zoom by `k`, keeping the world point under (sx, sy) fixed. */
  zoomAt(sx: number, sy: number, k: number): void {
    const before = this.toWorld(sx, sy);
    this.scale = clamp(this.scale * k, this.minScale, this.maxScale);
    const now = this.toWorld(sx, sy);
    this.cx += before.x - now.x; this.cz += before.z - now.z;
    this.clampCentre();
  }
  /** Moves the content by (dx, dy) screen px. */
  panPx(dx: number, dy: number): void {
    const c = Math.cos(this.ang), s = Math.sin(this.ang);
    this.cx -= (dx * c + dy * s) / this.scale;
    this.cz -= (-dx * s + dy * c) / this.scale;
    this.clampCentre();
  }
  /** 0 at the fit scale and above, 1 at a quarter of it: how far the pan limits open up toward the overview. */
  openness(): number {
    const t = clamp(Math.log(this.fitScale / this.scale) / Math.log(4), 0, 1);
    return t * t * (3 - 2 * t);
  }
  /** Keeps the centre inside the built area plus a margin; opens toward `far` as the view zooms out past the fit scale. */
  clampCentre(): void {
    const a = this.area;
    if (!a) return;
    const t = this.far ? this.openness() : 0;
    const f = this.far ?? a;
    const lerp = (lo: number, hi: number): number => lo + (hi - lo) * t;
    this.cx = clamp(this.cx, lerp(a.minX - PAN_MARGIN, f.minX), lerp(a.maxX + PAN_MARGIN, f.maxX));
    this.cz = clamp(this.cz, lerp(a.minZ - PAN_MARGIN, f.minZ), lerp(a.maxZ + PAN_MARGIN, f.maxZ));
  }
  /** Zoom levels in px/m, within the allowed range. */
  levels(): number[] {
    return ZOOM_STEPS.map((k) => this.fitScale * k).filter((s) => s >= this.minScale * 0.999 && s <= this.maxScale * 1.001);
  }
  /** Index of the level nearest to `scale` (log distance). */
  levelIndex(scale = this.scale): number {
    const lv = this.levels();
    let best = 0;
    for (let i = 1; i < lv.length; i++) if (Math.abs(Math.log(lv[i] / scale)) < Math.abs(Math.log(lv[best] / scale))) best = i;
    return best;
  }
  /** The level one step in/out from the current one (stays put at the ends). */
  stepScale(dir: 1 | -1, from = this.scale): number {
    const lv = this.levels();
    if (!lv.length) return from;
    const cur = this.levelIndex(from);
    // when between levels, a step goes to the next level in that direction
    const i = dir > 0 ? (lv[cur] > from * 1.02 ? cur : cur + 1) : (lv[cur] < from / 1.02 ? cur : cur - 1);
    return lv[clamp(i, 0, lv.length - 1)];
  }
}
