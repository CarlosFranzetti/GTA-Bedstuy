// @ts-ignore
import { appendFileSync } from 'node:fs';
import { describe, it, beforeAll } from 'vitest';
import { PED_SPECS } from '@/textures/painters/ped';
import { loadShapes, buildPerson } from './gait3-rig';
import { FOOT } from '@/entities/anim/footlock';
beforeAll(async () => { await loadShapes(); });
describe('gait3 feet', () => {
  it('sole offsets per person', () => {
    const out: string[] = [];
    for (let v = 0; v < PED_SPECS.length; v++) {
      const id = PED_SPECS[v].id, p = buildPerson(id), sy = p.m.group.scale.y;
      // in rig units (divide by scale): sole depth below ankle, heel z, ball z
      out.push(`${id} ${PED_SPECS[v].age ?? 'adult'} sy ${sy.toFixed(3)} soleDepth ${(-p.soleY[0] / sy).toFixed(3)} (model ${FOOT.ankleH}) heelZ ${(p.heelL[0].z / sy).toFixed(3)} (${FOOT.heel}) ballZ ${(p.ballL[0].z / sy).toFixed(3)} (${FOOT.ball})`);
    }
    appendFileSync(process.env.P_OUT ?? '/dev/null', out.join('\n') + '\n');
  }, 300000);
});
