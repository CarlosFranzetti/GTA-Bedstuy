import { clamp, forwardFromHeading, perpRight } from '@/core/Math2';
import type { Vec2 } from '@/core/Math2';
import type { GridModel, StreetDef } from '@/world/types';

const SIZE = 220;
/** Pixels per metre on the minimap. */
const SCALE = 1.1;
const DISC_FILL = 'rgba(10, 12, 18, 0.78)';
const ROAD_FILL = '#c9ced8';
const PLAYER_FILL = '#ffffff';
const COP_FILL = '#3b82f6';
const HALO = 'rgba(10, 12, 18, 0.85)';
const LABEL_FONT = '600 9px Arial, Helvetica, sans-serif';
/** How far ahead along an avenue (metres) its name is drawn from the player's projection. */
const LABEL_AHEAD_M = 30;

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
      'border-radius:50%;pointer-events:none;';
    root.appendChild(canvas);

    this.ctx = canvasContext(canvas);
  }

  update(playerPos: Vec2, heading: number, cops: Vec2[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const half = SIZE / 2;
    const toMap: ToMap = (p) => worldToMinimap(p, playerPos, heading, SCALE, SIZE);

    ctx.clearRect(0, 0, SIZE, SIZE);

    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = DISC_FILL;
    ctx.fillRect(0, 0, SIZE, SIZE);
    this.drawRoads(ctx, toMap);
    this.drawAvenueLabels(ctx, playerPos, toMap);
    this.drawCops(ctx, cops, toMap);
    ctx.restore();

    this.drawPlayer(ctx);

    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
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

  private drawCops(ctx: CanvasRenderingContext2D, cops: Vec2[], toMap: ToMap): void {
    ctx.fillStyle = COP_FILL;
    ctx.strokeStyle = HALO;
    ctx.lineWidth = 1;
    for (const c of cops) {
      const p = toMap(c);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D): void {
    const half = SIZE / 2;
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
  }
}
