/**
 * The Brooklyn overview layer (Imani's data, realmap.md section 6) for the map screen: land vs water, shoreline, major roads
 * and neighbourhood names, in the same grid frame as the built streets. Decoded once, drawn dark and low-detail.
 * Hosted/native: `public/data/brooklyn-overview.json`, fetched lazily on first open. The single-file artifact does not ship
 * it (size budget), so the fetch just fails quietly and the map has no overview; tests inject data directly.
 */
import { MAP_COLORS } from './map/palette';
import type { MapView, Rect } from './map/MapView';

export interface OverviewJson {
  v: number; f: number[]; q: number; names: string[];
  land: number[][]; st: Array<Array<number>>; nta: Array<[string, number, number]>;
}
interface Ring { boro: number; pts: Float32Array; bb: Rect }
interface Chain { name: string; cls: number; pts: Float32Array; bb: Rect; mid: { x: number; z: number; dx: number; dz: number } | null }
export interface OverviewData { rings: Ring[]; chains: Chain[]; nta: Array<{ name: string; x: number; z: number }>; bounds: Rect }

export interface MapLabel { text: string; x: number; y: number; ang: number; size: number; color: string; pri: number; w: number; caps?: boolean }

function decodeRow(row: ArrayLike<number>, start: number, q: number): { pts: Float32Array; bb: Rect } {
  const n = Math.floor((row.length - start) / 2);
  const pts = new Float32Array(n * 2);
  let x = 0, z = 0;
  const bb: Rect = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let i = 0; i < n; i++) {
    x += row[start + i * 2]; z += row[start + i * 2 + 1];
    const wx = x * q, wz = z * q;
    pts[i * 2] = wx; pts[i * 2 + 1] = wz;
    if (wx < bb.minX) bb.minX = wx; if (wx > bb.maxX) bb.maxX = wx;
    if (wz < bb.minZ) bb.minZ = wz; if (wz > bb.maxZ) bb.maxZ = wz;
  }
  return { pts, bb };
}

export function decodeOverview(j: OverviewJson): OverviewData {
  const q = j.q || 1;
  const rings: Ring[] = j.land.map((r) => ({ boro: r[0], ...decodeRow(r, 1, q) }));
  const chains: Chain[] = j.st.map((r) => {
    const d = decodeRow(r, 2, q);
    let mid: Chain['mid'] = null;
    const n = d.pts.length / 2;
    if (n >= 2 && r[0] >= 0) {
      let total = 0;
      for (let i = 1; i < n; i++) total += Math.hypot(d.pts[i * 2] - d.pts[i * 2 - 2], d.pts[i * 2 + 1] - d.pts[i * 2 - 1]);
      let acc = 0;
      for (let i = 1; i < n; i++) {
        const l = Math.hypot(d.pts[i * 2] - d.pts[i * 2 - 2], d.pts[i * 2 + 1] - d.pts[i * 2 - 1]);
        if (acc + l >= total / 2) {
          const t = l ? (total / 2 - acc) / l : 0;
          mid = { x: d.pts[i * 2 - 2] + (d.pts[i * 2] - d.pts[i * 2 - 2]) * t, z: d.pts[i * 2 - 1] + (d.pts[i * 2 + 1] - d.pts[i * 2 - 1]) * t, dx: d.pts[i * 2] - d.pts[i * 2 - 2], dz: d.pts[i * 2 + 1] - d.pts[i * 2 - 1] };
          break;
        }
        acc += l;
      }
    }
    return { name: r[0] >= 0 ? (j.names[r[0]] ?? '') : '', cls: r[1], pts: d.pts, bb: d.bb, mid };
  });
  const bounds: Rect = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const r of rings) if (r.boro === 3) {
    bounds.minX = Math.min(bounds.minX, r.bb.minX); bounds.maxX = Math.max(bounds.maxX, r.bb.maxX);
    bounds.minZ = Math.min(bounds.minZ, r.bb.minZ); bounds.maxZ = Math.max(bounds.maxZ, r.bb.maxZ);
  }
  if (!Number.isFinite(bounds.minX)) { bounds.minX = -1000; bounds.maxX = 1000; bounds.minZ = -1000; bounds.maxZ = 1000; }
  return { rings, chains, nta: j.nta.map(([name, x, z]) => ({ name, x: x * q, z: z * q })), bounds };
}

let cached: Promise<OverviewData | null> | null = null;
/** Lazy loader: one fetch per page, null when the file is not there (artifact) or broken. */
export function loadOverview(fetcher: typeof fetch | undefined = typeof fetch === 'function' ? fetch : undefined): Promise<OverviewData | null> {
  if (cached) return cached;
  if (!fetcher) return Promise.resolve(null);
  const base = (() => { try { return (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'; } catch { return '/'; } })();
  cached = fetcher(`${base}data/brooklyn-overview.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j: OverviewJson | null) => (j && j.v === 1 && Array.isArray(j.land) ? decodeOverview(j) : null))
    .catch(() => null);
  return cached;
}
export function resetOverviewCache(): void { cached = null; }

const overlaps = (a: Rect, b: Rect): boolean => a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;

function trace(ctx: CanvasRenderingContext2D, v: MapView, pts: Float32Array, close: boolean): void {
  for (let i = 0; i < pts.length; i += 2) {
    const s = v.toScreen(pts[i], pts[i + 1]);
    if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
  }
  if (close) ctx.closePath();
}

/** Water, land, shoreline and major roads (arterials, highways) at `alpha`. No local streets. */
export function drawOverview(ctx: CanvasRenderingContext2D, d: OverviewData, v: MapView, alpha: number): void {
  if (alpha <= 0) return;
  const vis = v.visible(20);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = MAP_COLORS.water; ctx.fillRect(0, 0, v.w, v.h);
  ctx.lineJoin = 'round';
  for (const pass of [0, 1]) {
    for (const r of d.rings) {
      if ((r.boro === 3) !== (pass === 1) || !overlaps(r.bb, vis)) continue;
      ctx.beginPath(); trace(ctx, v, r.pts, true);
      ctx.fillStyle = r.boro === 3 ? MAP_COLORS.land : MAP_COLORS.landOther; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = MAP_COLORS.shore; ctx.stroke();
    }
  }
  ctx.lineCap = 'round';
  const classes: Array<[number, string, number]> = [[2, MAP_COLORS.ovArterial, 1.3], [3, MAP_COLORS.ovHighway, 2]];
  for (const [cls, color, wpx] of classes) {
    ctx.beginPath();
    for (const c of d.chains) if (c.cls === cls && overlaps(c.bb, vis)) trace(ctx, v, c.pts, false);
    ctx.lineWidth = wpx; ctx.strokeStyle = color; ctx.stroke();
  }
  ctx.restore();
}

/** Label candidates for the overview: neighbourhood names (small caps) and arterial/highway names. */
export function overviewLabels(d: OverviewData, v: MapView, measure: (s: string, size: number) => number): MapLabel[] {
  const out: MapLabel[] = [];
  const vis = v.visible(0);
  const inside = (x: number, z: number): boolean => x >= vis.minX && x <= vis.maxX && z >= vis.minZ && z <= vis.maxZ;
  if (v.scale < 0.2) {
    for (const n of d.nta) if (inside(n.x, n.z)) { const p = v.toScreen(n.x, n.z); const t = n.name.toUpperCase(); out.push({ text: t, x: p.x, y: p.y, ang: 0, size: 10, color: MAP_COLORS.ovLabel, pri: 0, w: measure(t, 10) + 8, caps: true }); }
  }
  if (v.scale >= 0.08) {
    for (const c of d.chains) {
      if (c.cls < 2 || !c.name || !c.mid || !inside(c.mid.x, c.mid.z)) continue;
      const p = v.toScreen(c.mid.x, c.mid.z);
      const q = v.toScreen(c.mid.x + c.mid.dx, c.mid.z + c.mid.dz);
      let ang = Math.atan2(q.y - p.y, q.x - p.x);
      if (ang > Math.PI / 2) ang -= Math.PI; else if (ang <= -Math.PI / 2) ang += Math.PI;
      out.push({ text: c.name, x: p.x, y: p.y, ang, size: 9, color: MAP_COLORS.ovLabel, pri: 1, w: measure(c.name, 9) + 6 });
    }
  }
  return out;
}
