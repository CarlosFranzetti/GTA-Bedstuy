import { it } from 'vitest';
import { writeFileSync } from 'fs';
import { CamRig } from './camfix-harness';
import { SCENARIOS } from './camfix-scenarios';

it('trace', () => {
  const name = process.env.CAMFIX_SCN ?? 'cycle-views-slow-driving';
  const fps = Number(process.env.CAMFIX_FPS ?? 60);
  const s = SCENARIOS.find((x) => x.name === name)!;
  const r = new CamRig({ fps, ...s.opts, hitchAt: process.env.CAMFIX_HITCH ? Number(process.env.CAMFIX_HITCH) : undefined });
  s.run(r);
  const lines = r.frames.map((f) => `${f.t.toFixed(3)} ${f.mode[0]}${f.entering ? 'E' : ' '} ${f.view.padEnd(9)} cam ${f.px.toFixed(2)},${f.py.toFixed(2)},${f.pz.toFixed(2)} look ${f.lx.toFixed(1)},${f.ly.toFixed(1)},${f.lz.toFixed(1)} dir ${f.dx.toFixed(2)},${f.dy.toFixed(2)},${f.dz.toFixed(2)} up ${f.uy.toFixed(2)} fov ${f.fov.toFixed(1)} yaw ${(f.yaw * 57.3).toFixed(0)} first ${f.first.toFixed(2)} dist ${f.distance.toFixed(2)} body ${f.bx.toFixed(2)},${f.bz.toFixed(2)} car ${f.cx.toFixed(2)},${f.cz.toFixed(2)} h${(f.ch*57.3).toFixed(0)}`);
  writeFileSync(process.env.CAMFIX_OUT ?? '/dev/null', lines.join('\n') + '\n');
});
