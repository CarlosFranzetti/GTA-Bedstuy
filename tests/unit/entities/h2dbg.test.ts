import { it } from 'vitest';
import { Vehicle } from '@/entities/Vehicle';
import { corner90 } from './handlingMeasure';
it('dbg', () => {
  const out: string[] = [];
  for (const mode of [false, true]) { Vehicle.playerHandling = mode;
    for (const t of ['sedan','suv','cargovan','bus'] as const) for (const k of [20, 30, 40, 50]) { const c = corner90(t, k); out.push(`${mode?'new':'old'} ${t} ${k} time=${c.time.toFixed(2)} sweep=${c.sweep.toFixed(1)} turned=${c.turned.toFixed(0)} exit=${c.exitKmh.toFixed(0)} slip=${c.maxSlip.toFixed(1)}`); } }
  Vehicle.playerHandling = true;
  console.log(out.join('\n'));
});
