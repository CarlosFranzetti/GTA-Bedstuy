/// <reference types="node" />
import * as fs from 'node:fs';
import { it } from 'vitest';
import { realPhysics } from '../sim/harness';
it('p', () => {
  const { world } = realPhysics();
  const ns = world.grid.lanes.nodes;
  for (const id of ['ln:lafayette:1:f:0','ln:lafayette:1:f:1','ln:lafayette:1:f:2','ln:lafayette:1:f:3']) fs.appendFileSync('/tmp/f12p.txt', id+' '+JSON.stringify(ns[id]?.pos)+' '+ns[id]?.heading+'\n');
});
