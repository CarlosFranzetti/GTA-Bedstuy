import { it } from 'vitest';
import { makeGait } from '@/entities/anim/gait';
it('styles', () => {
  const r: string[] = [];
  for (const age of ['adult', 'teen', 'kid', 'old'] as const) r.push(age + ': ' + [7, 20, 33, 46, 59, 72, 85].map((s) => makeGait(s, age).walkClip).join(' '));
  console.log('STY\n' + r.join('\n'));
});
