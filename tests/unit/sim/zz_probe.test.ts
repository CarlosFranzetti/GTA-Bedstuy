import { it } from 'vitest'; import { writeFileSync } from 'node:fs';
import { runReal } from './realtraffic-run';
it('trace', () => {
  const r = runReal(4242, 192, new Set(['veh2672']), 186, 192);
  writeFileSync('/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/realtraffic2/trace.txt', r.traceLog.join('\n'));
}, 600000);
