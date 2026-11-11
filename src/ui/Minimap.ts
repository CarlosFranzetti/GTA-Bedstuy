import { angleDiff, clamp, forwardFromHeading, perpRight, wrapAngle } from '@/core/Math2';
import type { Vec2 } from '@/core/Math2';
import type { GridModel, StreetDef } from '@/world/types';
import { NAV_TARGETS, getNavTarget } from '@/game/missions/NavTargets';
import { getWaypoint } from '@/game/missions/Waypoint';
import { MAP_COLORS, drawIcon } from './map/palette';

/** A world-space point drawn on the minimap as a coloured ring (mission markers etc.). */
export interface MinimapBlip { x: number; z: number; color: string; kind?: 'giver' | 'objective' | string }

const GOLD = '#f5c542';
/** Giver blip radius (px) and pulse; objective rings are slightly bigger than the old 4 px too. */
const GIVER_RADIUS = 8;
const OBJECTIVE_RADIUS = 5.5;
const BLIP_PULSE_HZ = 1.4;
/** Seconds a newly seen blip pings on the radar. */
const NEW_BLIP_S = 1.4;
/** Blip size multiplier on touch devices, where the minimap is small and read at a glance. */
const PHONE_BLIP_SCALE = 1.45;

const SIZE = 220;
/** Pixels per metre on the minimap. */
const SCALE = 1.1;
const DISC_FILL = 'rgba(31, 34, 39, 0.94)'; // the map screen's built-ground tone
const ROAD_FILL = MAP_COLORS.street;
const PLAYER_FILL = '#ffffff';
const COP_FILL = '#3b82f6';
const HALO = 'rgba(10, 12, 18, 0.85)';
const LABEL_FONT = '600 9px Arial, Helvetica, sans-serif';
/** How far ahead along an avenue (metres) its name is drawn from the player's projection. */
const LABEL_AHEAD_M = 30;

/** Rate (1/s) at which the displayed map heading chases the real heading. */
const HEADING_SMOOTH = 9;
/** Cop blips flash between two colours at this rate (Hz). */
const BLINK_HZ = 2.5;
const COP_RED = '#ef4444';
const NORTH_FILL = '#f5c542';
const POI_HOME = MAP_COLORS.home;
const POI_DELI = MAP_COLORS.gold;

/** What the minimap marks mean, for the pause menu. */
export const MINIMAP_LEGEND: ReadonlyArray<{ swatch: string; shape: 'arrow' | 'ring' | 'dot' | 'house' | 'letter'; text: string }> = [
  { swatch: PLAYER_FILL, shape: 'arrow', text: 'You (white arrow)' },
  { swatch: GOLD, shape: 'ring', text: 'Mission offer (gold pulsing ring)' },
  { swatch: '#ef4444', shape: 'ring', text: 'Mission goal (coloured ring)' },
  { swatch: POI_HOME, shape: 'house', text: 'HOME' },
  { swatch: POI_DELI, shape: 'letter', text: 'D: WAX DELI' },
  { swatch: '#38bdf8', shape: 'dot', text: 'Waypoint (blue diamond, set on the map)' },
  { swatch: COP_RED, shape: 'dot', text: 'Police (flashing red/blue)' },
  { swatch: NORTH_FILL, shape: 'letter', text: 'N: north' },
];

/**
 * Exponential smoothing toward `target` along the shortest arc. `dt` in seconds.
 * Returns the new displayed angle (wrapped).
 */
export function smoothHeading(current: number, target: number, dt: number, rate = HEADING_SMOOTH): number {
  if (!Number.isFinite(current)) return wrapAngle(target);
  const k = 1 - Math.exp(-rate * Math.max(0, dt));
  return wrapAngle(current + angleDiff(current, target) * k);
}

/** Where the "N" marker sits on the rim for a map rotated to `mapHeading` (world north is -z). */
export function northMarkerPos(mapHeading: number, size: number, inset: number): { x: number; y: number } {
  const half = size / 2;
  const p = worldToMinimap({ x: 0, z: -1 }, { x: 0, z: 0 }, mapHeading, 1, 0);
  // worldToMinimap with size 0 gives a pure direction vector (screen space).
  const len = Math.hypot(p.x, p.y) || 1;
  const r = half - inset;
  return { x: half + (p.x / len) * r, y: half + (p.y / len) * r };
}

type MapPoint = { x: number; y: number };
type ToMap = (p: Vec2) => MapPoint;

/**
 * Pure world -> minimap pixel transform. The map is rotated so the player's heading points up
 * (screen -y), and the player sits at the centre of a `size` x `size` square at `scale` px/m.
 */
export function worldToMinimap(
  p: Vec2,
  player: Vec2,
  heading: number,
  scale: number,
  size: number,
): { x: number; y: number } {
  const forward = forwardFromHeading(heading);
  const right = perpRight(forward);
  const dx = p.x - player.x;
  const dz = p.z - player.z;
  const u = dx * right.x + dz * right.z; // metres to the player's right
  const v = dx * forward.x + dz * forward.z; // metres ahead of the player
  const half = size / 2;
  return { x: half + u * scale, y: half - v * scale };
}

/** Corner radius of the rounded-square frame (canvas px at SIZE). */
const CORNER = 28;

/** Path for a rounded square spanning lo..hi on both axes. */
function roundedSquare(ctx: CanvasRenderingContext2D, lo: number, hi: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(lo + r, lo);
  ctx.arcTo(hi, lo, hi, hi, r);
  ctx.arcTo(hi, hi, lo, hi, r);
  ctx.arcTo(lo, hi, lo, lo, r);
  ctx.arcTo(lo, lo, hi, lo, r);
  ctx.closePath();
}

/** getContext can return null (or throw) when no canvas backend exists, e.g. plain jsdom. */
function canvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return (canvas.getContext('2d') as CanvasRenderingContext2D | null) ?? null;
  } catch {
    return null;
  }
}

/** Top-down minimap: roads on a dark disc, rotated to the player's heading. */
export class Minimap {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly grid: GridModel;
  private readonly avenues: StreetDef[];
  private mapHeading = Number.NaN;
  private clock = 0;
  private lastStamp = Number.NaN;
  /** 1 on desktop, PHONE_BLIP_SCALE when the primary pointer is coarse (touch). Settable for tests. */
  blipScale = 1;

  constructor(root: HTMLElement, grid: GridModel) {
    this.grid = grid;
    this.avenues = grid.streets.filter((s) => s.class === 'avenue');

    const canvas = root.ownerDocument.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    canvas.className = 'minimap';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Minimap');
    // Positioned inline so the minimap lays out correctly even without hud.css.
    canvas.style.cssText =
      `position:absolute;left:16px;bottom:52px;width:${SIZE}px;height:${SIZE}px;` +
      'border-radius:14%;pointer-events:none;';
    root.appendChild(canvas);

    this.ctx = canvasContext(canvas);
    try {
      const w = root.ownerDocument.defaultView;
      if (w && typeof w.matchMedia === 'function' && w.matchMedia('(pointer: coarse)').matches) this.blipScale = PHONE_BLIP_SCALE;
    } catch { /* no matchMedia: desktop sizing */ }
  }

  /**
   * `dt` (seconds) drives heading smoothing and cop blinking; when omitted it is measured from the clock.
   * The map rotates by a smoothed heading, so the arrow swings to the true heading and settles.
   */
  update(playerPos: Vec2, heading: number, cops: Vec2[], dt?: number, blips?: readonly MinimapBlip[]): void {
    let step = dt;
    if (step === undefined) {
      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      step = Number.isFinite(this.lastStamp) ? Math.min(0.1, (now - this.lastStamp) / 1000) : 1 / 60;
      this.lastStamp = now;
    }
    this.clock += step;
    this.mapHeading = smoothHeading(this.mapHeading, heading, step);

    const ctx = this.ctx;
    if (!ctx) return;
    const half = SIZE / 2;
    const mapHeading = this.mapHeading;
    const toMap: ToMap = (p) => worldToMinimap(p, playerPos, mapHeading, SCALE, SIZE);

    ctx.clearRect(0, 0, SIZE, SIZE);

    ctx.save();
    roundedSquare(ctx, 0, SIZE, CORNER);
    ctx.clip();
    ctx.fillStyle = DISC_FILL;
    ctx.fillRect(0, 0, SIZE, SIZE);
    this.drawRoads(ctx, toMap);
    this.drawAvenueLabels(ctx, playerPos, toMap);
    this.drawPois(ctx, toMap, half);
    if (blips && blips.length > 0) this.drawBlips(ctx, blips, toMap, half);
    this.drawWaypoint(ctx, toMap, half);
    this.drawCops(ctx, cops, toMap);
    ctx.restore();

    this.drawNorth(ctx, mapHeading);
    // Arrow shows the true heading relative to the (slightly lagging) map.
    this.drawPlayer(ctx, angleDiff(mapHeading, heading));

    roundedSquare(ctx, 1.5, SIZE - 1.5, CORNER - 1.5);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  private drawRoads(ctx: CanvasRenderingContext2D, toMap: ToMap): void {
    ctx.fillStyle = ROAD_FILL;
    ctx.strokeStyle = ROAD_FILL;
    ctx.lineCap = 'butt';

    for (const seg of this.grid.segments) {
      const a = toMap(seg.a);
      const b = toMap(seg.b);
      ctx.lineWidth = Math.max(1, seg.width * SCALE);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    for (const it of this.grid.intersections) {
      const { x, z } = it.center;
      const corners: Vec2[] = [
        { x: x - it.halfX, z: z - it.halfZ },
        { x: x + it.halfX, z: z - it.halfZ },
        { x: x + it.halfX, z: z + it.halfZ },
        { x: x - it.halfX, z: z + it.halfZ },
      ];
      ctx.beginPath();
      corners.forEach((corner, i) => {
        const p = toMap(corner);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawAvenueLabels(ctx: CanvasRenderingContext2D, playerPos: Vec2, toMap: ToMap): void {
    if (this.avenues.length === 0) return;
    const half = SIZE / 2;
    const { bounds } = this.grid;

    ctx.font = LABEL_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = HALO;
    ctx.fillStyle = '#ffffff';

    for (const av of this.avenues) {
      // Anchor sits on the avenue a little ahead of the player, clamped to the grid.
      const anchor: Vec2 =
        av.axis === 'ns'
          ? { x: av.offset, z: clamp(playerPos.z + LABEL_AHEAD_M, bounds.minZ, bounds.maxZ) }
          : { x: clamp(playerPos.x + LABEL_AHEAD_M, bounds.minX, bounds.maxX), z: av.offset };
      const along: Vec2 = av.axis === 'ns' ? { x: anchor.x, z: anchor.z + 1 } : { x: anchor.x + 1, z: anchor.z };

      const p = toMap(anchor);
      if (Math.hypot(p.x - half, p.y - half) > half - 12) continue;
      const q = toMap(along);

      // Keep text upright: flip by pi when it would read upside down.
      let angle = Math.atan2(q.y - p.y, q.x - p.x);
      if (angle > Math.PI / 2) angle -= Math.PI;
      else if (angle <= -Math.PI / 2) angle += Math.PI;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      ctx.strokeText(av.name, 0, 0);
      ctx.fillText(av.name, 0, 0);
      ctx.restore();
    }
  }

  /**
   * Mission / objective blips, clamped to the disc edge when off-map. A giver is a clear gold ring with a dark halo and
   * a pulsing centre dot (a waiting mission); an objective is a ring in its own colour. Bigger on touch devices.
   */
  private readonly blipSeen = new Map<string, number>();
  /** Clock time at which this blip (by place and colour) was first drawn; entries die when it stops being drawn for a while. */
  private blipBorn(b: MinimapBlip): number {
    const key = `${Math.round(b.x)}:${Math.round(b.z)}:${b.kind ?? ''}:${b.color}`;
    const t = this.blipSeen.get(key);
    if (t !== undefined) return t;
    // the first frame after the minimap appears is not "new": start settled
    const born = this.clock < 1 ? -10 : this.clock;
    this.blipSeen.set(key, born);
    if (this.blipSeen.size > 200) this.blipSeen.clear();
    return born;
  }

  private drawBlips(ctx: CanvasRenderingContext2D, blips: readonly MinimapBlip[], toMap: ToMap, half: number): void {
    const k = this.blipScale;
    const edge = half - 6 - 4 * k;
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * Math.PI * 2 * BLIP_PULSE_HZ);
    for (const b of blips) {
      const p = toMap(b);
      let dx = p.x - half, dy = p.y - half;
      const d = Math.hypot(dx, dy);
      const off = d > edge;
      if (off) { dx *= edge / d; dy *= edge / d; }
      const cx = half + dx, cy = half + dy;
      const giver = b.kind === 'giver';
      const r = (giver ? GIVER_RADIUS : OBJECTIVE_RADIUS) * k * (off ? 0.85 : 1);
      const color = giver ? GOLD : b.color;
      // radar ping: a blip seen for the first time sends out two expanding rings (1.4 s), then settles
      const born = this.blipBorn(b);
      const age = this.clock - born;
      if (age < NEW_BLIP_S && !off) {
        for (const lag of [0, 0.35]) {
          const u = (age - lag) / (NEW_BLIP_S - 0.35);
          if (u <= 0 || u >= 1) continue;
          ctx.beginPath();
          ctx.arc(cx, cy, r + u * 22 * k, 0, Math.PI * 2);
          ctx.lineWidth = 2 * k;
          ctx.strokeStyle = `rgba(255, 255, 255, ${(0.85 * (1 - u)).toFixed(3)})`;
          ctx.stroke();
        }
      }
      // dark halo so the ring reads on top of the pale roads
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.lineWidth = (giver ? 4.5 : 4) * k;
      ctx.strokeStyle = HALO;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.lineWidth = (giver ? 2.5 : 2) * k;
      ctx.strokeStyle = color;
      ctx.stroke();
      if (giver) {
        // pulsing wave leaving the ring
        ctx.beginPath();
        ctx.arc(cx, cy, r + pulse * 6 * k, 0, Math.PI * 2);
        ctx.lineWidth = 1.5 * k;
        ctx.strokeStyle = `rgba(245, 197, 66, ${(0.7 * (1 - pulse)).toFixed(3)})`;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, (giver ? 2.6 + 1.6 * pulse : 2) * k, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  /**
   * Fixed places the player can navigate to (HOME, WAX DELI): a green house for HOME and a gold "D" for the deli, pinned to the
   * rim when off the map; the one picked with N gets a ring. Legend: see the pause menu (MINIMAP_LEGEND).
   */
  private drawPois(ctx: CanvasRenderingContext2D, toMap: ToMap, half: number): void {
    const k = this.blipScale;
    const edge = half - 12 * k;
    const sel = getNavTarget();
    for (const t of NAV_TARGETS) {
      const p = toMap(t);
      let dx = p.x - half, dy = p.y - half;
      const d = Math.hypot(dx, dy);
      if (d > edge) { dx *= edge / d; dy *= edge / d; }
      const cx = half + dx, cy = half + dy;
      const r = 7 * k;
      if (t.id === 'home') {
        // H7: HOME was never found. A pulsing ring keeps the house icon catching the eye.
        const ph = (this.clock * 1.2) % 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r * (1 + ph * 1.1), 0, Math.PI * 2);
        ctx.lineWidth = 2 * k;
        ctx.strokeStyle = `rgba(124, 214, 160, ${(0.9 * (1 - ph)).toFixed(3)})`;
        ctx.stroke();
      }
      if (sel?.id === t.id) { ctx.beginPath(); ctx.arc(cx, cy, r + 3 * k, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke(); }
      drawIcon(ctx, t.id === 'home' ? 'home' : 'venue', cx, cy, { k: (r / 12) * (t.id === 'home' ? 1 : 12 / 11), letter: 'D' });
    }
  }

  /** The map-screen waypoint: a sky-blue diamond, pinned to the rim when off the disc. */
  private drawWaypoint(ctx: CanvasRenderingContext2D, toMap: ToMap, half: number): void {
    const wp = getWaypoint();
    if (!wp) return;
    const k = this.blipScale;
    const p = toMap(wp);
    let dx = p.x - half, dy = p.y - half;
    const d = Math.hypot(dx, dy), edge = half - 12 * k;
    if (d > edge) { dx *= edge / d; dy *= edge / d; }
    const cx = half + dx, cy = half + dy, r = 6.5 * k;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath();
    ctx.fillStyle = '#38bdf8'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = HALO; ctx.stroke();
  }

  private drawCops(ctx: CanvasRenderingContext2D, cops: Vec2[], toMap: ToMap): void {
    ctx.strokeStyle = HALO;
    ctx.lineWidth = 1;
    // Siren flash: red/blue alternation with a slight size pulse.
    const phase = Math.floor(this.clock * BLINK_HZ * 2) % 2 === 0;
    ctx.fillStyle = phase ? COP_RED : COP_FILL;
    const radius = phase ? 4.2 : 3.5;
    for (const c of cops) {
      const p = toMap(c);
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private drawNorth(ctx: CanvasRenderingContext2D, mapHeading: number): void {
    const p = northMarkerPos(mapHeading, SIZE, 11);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = HALO;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = NORTH_FILL;
    ctx.stroke();
    ctx.font = '700 10px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = NORTH_FILL;
    ctx.fillText('N', p.x, p.y + 0.5);
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, rel = 0): void {
    const half = SIZE / 2;
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(rel);
    ctx.translate(-half, -half);
    ctx.beginPath();
    ctx.moveTo(half, half - 7);
    ctx.lineTo(half + 5, half + 5);
    ctx.lineTo(half - 5, half + 5);
    ctx.closePath();
    ctx.fillStyle = PLAYER_FILL;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
