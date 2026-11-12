/**
 * The three street frames of the real-map reviews (under the el on Broadway, a residential side street, a shop corner), as camera
 * poses the game's free camera can take (`__gtaDebug.setFreeCam`). Same selection rules as scripts/realworld-shots.html, so
 * the triangles and draws measured in the game path (scripts/perf-real.mjs) compare with the earlier harness numbers.
 * Debug only: realWorld.ts exposes it as window.__gtaRealFrames.
 */
import type { RealWorld } from './realWorld';
import { pointOnPath } from './elReal';

export interface ReviewFrame { name: string; pos: [number, number, number]; look: [number, number, number]; }

export function reviewFrames(rw: RealWorld): ReviewFrame[] {
  const out: ReviewFrame[] = [];
  // 1. under the el on Broadway, between Myrtle and Kosciuszko
  try {
    const jz = rw.el.paths.find((p) => p.id === 'JZ');
    const st = rw.el.stations.filter((s) => s.path === 'JZ');
    const a = st.find((x) => x.id === 'myrtle'), b = st.find((x) => x.id === 'kosciuszko');
    if (jz && a && b) {
      const c = pointOnPath(jz, (a.s + b.s) / 2 - 120);
      const lat = { x: -c.dir.z, z: c.dir.x };
      out.push({ name: 'under-el', pos: [c.p.x - c.dir.x * 34 + lat.x * 9, 1.7, c.p.z - c.dir.z * 34 + lat.z * 9], look: [c.p.x + lat.x, 9, c.p.z + lat.z] });
    }
  } catch { /* frame missing */ }
  // 2. a straight side street 90-200 m long within 700 m of the spawn and at least 40 m from the el
  try {
    const net = rw.net;
    const elPts: Array<{ x: number; z: number }> = [];
    for (const pth of rw.el.paths) for (let q = 0; q < pth.length; q += 25) elPts.push(pointOnPath(pth, q).p);
    let best: { d: number; E: (typeof net.edges)[number] } | null = null;
    net.edges.forEach((E, e) => {
      const L = net.lengths[e];
      if (E.level !== 0 || L < 90 || L > 200 || E.width > 14 || /broadway|myrtle|flushing/i.test(E.name)) return;
      const m = { x: (E.pts[0].x + E.pts[1].x) / 2, z: (E.pts[0].z + E.pts[1].z) / 2 };
      if (Math.hypot(E.pts[1].x - E.pts[0].x, E.pts[1].z - E.pts[0].z) < 60) return;
      const d = Math.hypot(m.x - rw.spawn.x, m.z - rw.spawn.z);
      if (d > 700 || elPts.some((p) => Math.hypot(p.x - m.x, p.z - m.z) < 40)) return;
      if (!best || d < best.d) best = { d, E };
    });
    if (best) {
      const E = (best as { E: (typeof net.edges)[number] }).E;
      const dx = E.pts[1].x - E.pts[0].x, dz = E.pts[1].z - E.pts[0].z, l = Math.hypot(dx, dz);
      const dir = { x: dx / l, z: dz / l }, lat = { x: -dir.z, z: dir.x };
      out.push({ name: 'residential', pos: [E.pts[0].x + dir.x * 22 + lat.x * (E.width / 2 - 1.5), 1.7, E.pts[0].z + dir.z * 22 + lat.z * (E.width / 2 - 1.5)], look: [E.pts[0].x + dir.x * 70 - lat.x * 3, 3, E.pts[0].z + dir.z * 70 - lat.z * 3] });
    }
  } catch { /* frame missing */ }
  // 3. the shop corner: the POI lot nearest the spawn, seen from the street 16 m out
  try {
    const pl = rw.lots.filter((l) => (l as { poi?: unknown }).poi) as Array<RealWorld['lots'][number] & { frontA: { x: number; z: number }; frontB: { x: number; z: number }; outward: { x: number; z: number } }>;
    pl.sort((p, q) => Math.hypot(p.frontA.x - rw.spawn.x, p.frontA.z - rw.spawn.z) - Math.hypot(q.frontA.x - rw.spawn.x, q.frontA.z - rw.spawn.z));
    const w = pl[0];
    if (w) {
      const cx = (w.frontA.x + w.frontB.x) / 2, cz = (w.frontA.z + w.frontB.z) / 2;
      const al = { x: w.frontB.x - w.frontA.x, z: w.frontB.z - w.frontA.z }; const l = Math.hypot(al.x, al.z) || 1;
      out.push({ name: 'shop-corner', pos: [cx + w.outward.x * 16 + (al.x / l) * 8, 1.7, cz + w.outward.z * 16 + (al.z / l) * 8], look: [cx, 3.2, cz] });
    }
  } catch { /* frame missing */ }
  return out;
}
