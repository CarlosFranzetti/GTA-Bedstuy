import { it } from 'vitest';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { RoadNet } from '@/world/roadnet/RoadNet';
import { deriveGeometry } from '@/world/roadnet/derive';
import { blockFaces } from '@/world/roadnet/faces';
const core = (await import('@/world/data/roadnet-core.json')).default as any;
it('x', () => {
  const data = loadBedstuyData(); const g = buildGrid(data);
  const net = RoadNet.fromJson(core); const d = deriveGeometry(net); const f = blockFaces(net, d);
  const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const out: string[] = [];
  for (const b of g.blocks) {
    const want = b.faces.map((x) => slug(g.streetById(x.streetId).name));
    const cands: string[] = [];
    f.forEach((fs, bi) => { const have = new Set(fs.map((x) => x.streetId)); if (want.every((w) => have.has(w))) cands.push(bi + ':' + fs.length + ':' + net.blockRing(bi).length); });
    if (['r1c0','r1c1','r1c2','r3c4','r4c4','r1c4'].includes(b.id)) { const near: string[] = []; f.forEach((fs, bi) => { const have = new Set(fs.map((x) => x.streetId)); const n = want.filter((w) => have.has(w)).length; if (n >= 3) near.push(bi + '[' + n + ']:' + fs.map((x) => x.streetId.slice(0, 8) + Math.round(x.s1 - x.s0)).join(',') + ' ring' + (d.buildingRings[bi].length) + ' edges' + net.blocks[bi].edges.length); }); out.push('  NEAR ' + b.id + ' ' + near.join(' | ')); }
    out.push(b.id + ' ' + want.join('/') + ' -> ' + cands.join(' '));
  }
  console.log('MATCH\n' + out.join('\n'));
});
