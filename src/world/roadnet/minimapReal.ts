/**
 * REALGAME: the minimap's street layer on the real map. Real path only. `realMinimapRoads(source)` makes the `MinimapRoads`
 * callback `new Minimap(root, grid, roads)` takes: street centrelines at their width inside the disc, and the names of the
 * avenues and arterials near the player. `source` is `roadNetStreetSource(net)` (the same one the map screen uses).
 */
import type { Vec2 } from '@/core/Math2';
import type { MapStreet, MapStreetSource } from '@/ui/map/streetSource';
import type { MinimapRoads } from '@/ui/Minimap';
import { MAP_COLORS } from '@/ui/map/palette';

const LABEL_FONT = '600 9px Arial, Helvetica, sans-serif';
const HALO = 'rgba(10, 12, 18, 0.85)';
const CLIP_PAD = 25; // m of street kept beyond the disc edge so a ribbon does not end inside the disc

interface Item { s: MapStreet; minX: number; maxX: number; minZ: number; maxZ: number }

export function realMinimapRoads(source: MapStreetSource): MinimapRoads {
  let items: Item[] | null = null;
  const prepared = (): Item[] => {
    if (!items) {
      items = source.streets().map((s) => {
        const xs = s.pts.map((p) => p.x), zs = s.pts.map((p) => p.z);
        return { s, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
      });
    }
    return items;
  };
  return (ctx, toMap, player, scale, size) => {
    const reach = (size / 2) / scale + CLIP_PAD;
    const near = prepared().filter((i) => i.maxX >= player.x - reach && i.minX <= player.x + reach && i.maxZ >= player.z - reach && i.minZ <= player.z + reach);
    ctx.fillStyle = MAP_COLORS.street;
    ctx.strokeStyle = MAP_COLORS.street;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    for (const { s } of near) {
      ctx.lineWidth = Math.max(1, s.width * scale);
      ctx.beginPath();
      s.pts.forEach((p, i) => { const q = toMap(p); if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); });
      ctx.stroke();
    }
    // names: once per street name, on the piece nearest the player, along the street, upright
    const half = size / 2;
    const seen = new Map<string, { d: number; a: Vec2; b: Vec2 }>();
    for (const { s } of near) {
      if (s.cls === 'street' || !s.name) continue;
      for (let i = 0; i + 1 < s.pts.length; i++) {
        const a = s.pts[i], b = s.pts[i + 1];
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
        const d = Math.hypot(mx - player.x, mz - player.z);
        const prev = seen.get(s.name);
        if (!prev || d < prev.d) seen.set(s.name, { d, a, b });
      }
    }
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = HALO;
    ctx.fillStyle = '#ffffff';
    for (const [name, { a, b }] of seen) {
      const mid = toMap({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
      if (Math.hypot(mid.x - half, mid.y - half) > half - 14) continue;
      const pa = toMap(a), pb = toMap(b);
      let angle = Math.atan2(pb.y - pa.y, pb.x - pa.x);
      if (angle > Math.PI / 2) angle -= Math.PI; else if (angle <= -Math.PI / 2) angle += Math.PI;
      ctx.save();
      ctx.translate(mid.x, mid.y);
      ctx.rotate(angle);
      ctx.strokeText(name, 0, 0);
      ctx.fillText(name, 0, 0);
      ctx.restore();
    }
  };
}
