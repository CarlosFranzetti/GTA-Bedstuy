import { it } from 'vitest';
import { parseShape } from '@/entities/models/pedMesh';
it('rig', async () => {
  const fs = await import('node:fs');
  const D = new URL('../../../src/assets/models/people/', import.meta.url);
  const rows: string[] = [];
  for (const f of fs.readdirSync(D).filter((n) => n.endsWith('.glb')).sort().slice(0, 6)) {
    const b = fs.readFileSync(new URL(f, D));
    const s = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    const r = s.rig as Record<string, number[]>;
    rows.push(f + ' h=' + s.height + ' ' + ['torso', 'shoulderL', 'elbowL', 'wristL', 'hipL', 'kneeL', 'head'].map((k) => k + '=' + r[k]?.map((v) => v.toFixed(3)).join(',')).join(' | '));
  }
  console.log(rows.join('\n'));
});
