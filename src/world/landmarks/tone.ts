/**
 * LANDMARKS wall tone. The shared wall materials (brick, limestone, stoop, cornice, roll gate, ironwork) take their colour from two
 * vertex attributes, `aTone` and `aStyle` (src/textures/lotTone.ts), that the generic buildings bake from a per-lot colourway.
 * A landmark gets one colourway of its own (kept deterministic by its id; the wall colour can be fixed by `look.wall`) and the same
 * bake, by calling the public colourway functions: nothing in src/world/buildings or src/textures is changed.
 */
import * as THREE from 'three';
import { lotColourway, toneFor, type Colourway } from '@/world/buildings/colourway';
import type { MaterialFamily } from '@/world/buildings/facade';
import type { LandmarkRow } from './types';

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const FAMILY: Partial<Record<LandmarkRow['kind'], MaterialFamily>> = {
  church: 'brick', armory: 'brick', school: 'brick', housing: 'brick', hospital: 'paintedBrick', library: 'limestone', stationhouse: 'brick',
  firehouse: 'brick', depot: 'brick', park: 'brick', pool: 'brick', playground: 'paintedBrick', garden: 'paintedBrick',
  theatre: 'paintedBrick', brewery: 'brick', market: 'brick', rowhouses: 'brick', eatery: 'paintedBrick', mural: 'paintedBrick',
};

export function landmarkColourway(row: LandmarkRow): Colourway {
  const fam = (row.look.family as MaterialFamily | undefined) ?? FAMILY[row.kind] ?? 'brick';
  const cw = lotColourway({ id: `landmark:${row.id}`, spec: { family: fam, floors: 4, use: 'institutional', stoop: { present: false, heightM: 0 } } });
  const wall = row.look.wall;
  const out: Colourway = typeof wall === 'string' && /^#[0-9a-f]{6}$/i.test(wall) ? { ...cw, front: hex(wall), paint: typeof row.look.paint === 'number' ? row.look.paint : 0.4 } : { ...cw };
  // LANDMARKS2: the trim (limestone: heads, sills, columns, terracotta), cornice and ironwork colours can be read off a photograph too
  for (const key of ['trim', 'cornice', 'metal'] as const) {
    const v = row.look[key];
    if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) (out as unknown as Record<string, unknown>)[key] = hex(v);
  }
  return out;
}

const ROOF_SCALE_M = 64; // lotTone.ts: the roof-line height rides in the alpha of the `color` attribute, in units of 64 m
const WALL_NAME = /^(brickRed|brickPainted|brownstone|limestone|cornice):/;

/** bake aTone / aStyle into every mesh whose material takes a tone (all faces count as the street front: a landmark shows several) */
export function applyTone(meshes: readonly THREE.Mesh[], cw: Colourway): void {
  for (const m of meshes) {
    const mat = m.material as THREE.Material;
    if (!mat.name) continue;
    const t = toneFor(mat.name, cw, true, false);
    if (!t) continue;
    const n = m.geometry.getAttribute('position').count;
    const tone = new Uint8Array(n * 4), style = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) { tone.set(t.tone, i * 4); style.set(t.style, i * 4); }
    if (WALL_NAME.test(mat.name)) {
      // the wall shader places soot and streaks from the roof-line height (alpha of `color`); without it every wall counts as 64 m tall
      const pos = m.geometry.getAttribute('position');
      let roofH = 0;
      for (let i = 0; i < n; i++) roofH = Math.max(roofH, pos.getY(i));
      const col = new Uint8Array(n * 4).fill(255);
      const a = Math.max(0, Math.min(255, Math.round((roofH / ROOF_SCALE_M) * 255)));
      for (let i = 0; i < n; i++) col[i * 4 + 3] = a;
      m.geometry.setAttribute('color', new THREE.BufferAttribute(col, 4, true));
    }
    m.geometry.setAttribute('aTone', new THREE.BufferAttribute(tone, 4, true));
    m.geometry.setAttribute('aStyle', new THREE.BufferAttribute(style, 4, true));
  }
}
