// Preview config for the HEADS lane: the same Vite config plus a transform that wires src/entities/models/pedHead.ts (face morph,
// hair / hat shells) into pedMesh.ts's geometry builder, so heads can be reviewed before the hooks are merged into pedMesh.ts itself.
import { defineConfig, mergeConfig } from 'vite';
import base from '../vite.config';

export default mergeConfig(base, defineConfig({
  plugins: [{
    name: 'heads-wire',
    enforce: 'pre',
    transform(code: string, id: string) {
      if (!/src[\\/]entities[\\/]models[\\/]pedMesh\.ts$/.test(id.split('?')[0]) || code.includes('faceMorph')) return null;
      let c = code;
      c = c.replace("import { garmentParts,", "import { faceMorph, headGear } from './pedHead';\nimport { garmentParts,");
      c = c.replace("let L = s.lods[detail];", "let L = detail === 'far' ? s.lods[detail] : faceMorph(s, spec, s.lods[detail]);");
      c = c.replace("...headParts(s, spec, detail === 'hi'), ", "");
      c = c.replace(/\.\.\.headShell\(s, L, ao, spec\), /g, "");
      c = c.replace(/(const parts = detail === 'far'[^\n]*\n)/, "$1  if (detail !== 'far') parts.push(...headGear(s, L, ao, spec, detail as 'hi' | 'mid'));\n");
      return { code: c, map: null };
    },
  }],
}));
