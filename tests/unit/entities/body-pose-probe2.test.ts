import { it } from 'vitest';
import { fullLib } from './anim-measure';
import { NCH, boneChannel } from '@/entities/anim/clipPack';
it('clips', () => {
  const lib = fullLib(); const rows: string[] = [];
  for (const n of ['walk', 'walkBrisk', 'jog', 'run', 'idle']) {
    const c = lib.get(n)!; const col = (b: string, k: number) => Array.from({ length: c.frames }, (_, i) => c.data[i * NCH + boneChannel(b as never) + k]);
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const corr = (a: number[], b: number[]) => { const ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return sab / Math.sqrt(saa * sbb + 1e-12); };
    const sd = (a: number[]) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2))) * 180 / Math.PI;
    const ty = col('torso', 1), hy = col('hips', 1), tz = col('torso', 2), hz = col('hips', 2), kd = col('kneeL', 0).map((v, i) => v - col('kneeR', 0)[i]), ld = col('legL', 0).map((v, i) => v - col('legR', 0)[i]);
    rows.push(`${n}: sd torsoY ${sd(ty).toFixed(1)} hipsY ${sd(hy).toFixed(1)} corr(tY,hY) ${corr(ty, hy).toFixed(2)} | sd torsoZ ${sd(tz).toFixed(1)} hipsZ ${sd(hz).toFixed(1)} corr(tZ,hZ) ${corr(tz, hz).toFixed(2)} | corr(tY,legL-legR) ${corr(ty, ld).toFixed(2)} corr(hY,legL-legR) ${corr(hy, ld).toFixed(2)} | corr(tZ,kneeL-kneeR) ${corr(tz, kd).toFixed(2)} corr(hZ,kneeL-kneeR) ${corr(hz, kd).toFixed(2)} | armLx vs legL-legR ${corr(col('armL', 0), ld).toFixed(2)} sdArmX ${sd(col('armL', 0)).toFixed(1)} sdElbow ${sd(col('elbowL', 0)).toFixed(1)} corr(elbow,armx) ${corr(col('elbowL', 0), col('armL', 0)).toFixed(2)}`);
  }
  console.log('CLIPS2\n' + rows.join('\n'));
});
