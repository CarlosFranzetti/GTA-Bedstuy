import { it } from 'vitest';
import { RoadNet } from '@/world/roadnet/RoadNet';
it('explore', async () => {
  const core = (await import('@/world/data/roadnet-core.json')).default as any;
  const net = RoadNet.fromJson(core);
  const deg: Record<number, number> = {};
  const rows: string[] = [];
  net.nodes.forEach((n, v) => {
    let d = 0; const angs: number[] = [];
    net.edges.forEach((e) => {
      for (const [end, node] of [['a', e.a], ['b', e.b]] as const) if (node === v) {
        d++;
        const p = end === 'a' ? e.pts[1] : e.pts[e.pts.length - 2];
        angs.push(Math.atan2(p.z - n.p.z, p.x - n.p.x) * 180 / Math.PI);
      }
    });
    deg[d] = (deg[d] ?? 0) + 1;
    angs.sort((a, b) => a - b);
    let min = 360;
    for (let i = 0; i < angs.length; i++) { const g = ((angs[(i + 1) % angs.length] - angs[i]) + 360) % 360 || 360; if (angs.length > 1) min = Math.min(min, g); }
    if (d >= 2 && min < 40) rows.push(`${v} deg${d} ${n.control} min gap ${min.toFixed(1)} at ${n.p.x.toFixed(0)},${n.p.z.toFixed(0)} ${net.incident[v].map((e) => net.edges[e].name + ':' + net.lengths[e].toFixed(0)).join(' | ')}`);
  });
  console.log(JSON.stringify(deg), '\n' + rows.join('\n'));
  const lens = net.lengths; const sh = Array.from(lens).filter((l) => l < 25).length;
  console.log('edges<25m', sh, 'loops', net.edges.filter((e) => e.a === e.b).length, 'levels', JSON.stringify(net.edges.reduce((a: any, e) => (a[e.level] = (a[e.level] ?? 0) + 1, a), {})));
  console.log('cls', JSON.stringify(net.edges.reduce((a: any, e) => (a[e.cls] = (a[e.cls] ?? 0) + 1, a), {})), 'blocks', net.blocks.length, net.blocks.filter(b=>b.island).length);
});
