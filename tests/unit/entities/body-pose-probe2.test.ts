import { it } from 'vitest';
import { fullLib } from './anim-measure';
import { NCH, boneChannel } from '@/entities/anim/clipPack';
it('idle head', () => {
  const lib = fullLib(); const rows: string[] = []; const D = 180 / Math.PI;
  for (const n of ['idle', 'idle2', 'talk', 'walk', 'walkBrisk']) {
    const c = lib.get(n)!;
    const st = (b: string, k = 0) => { let lo = 99, hi = -99, s = 0; for (let i = 0; i < c.frames; i++) { const v = c.data[i * NCH + boneChannel(b as never) + k] * D; lo = Math.min(lo, v); hi = Math.max(hi, v); s += v; } return `${(s / c.frames).toFixed(0)}[${lo.toFixed(0)},${hi.toFixed(0)}]`; };
    rows.push(`${n} head y ${st('head', 1)} z ${st('head', 2)} x ${st('head', 0)} | torso y ${st('torso', 1)} z ${st('torso', 2)} | hips y ${st('hips', 1)} z ${st('hips', 2)}`);
  }
  console.log('IDLEH\n' + rows.join('\n'));
});
