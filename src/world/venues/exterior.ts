/**
 * VENUES exteriors: what each place looks like from the street. A small group at the door, built once at boot like the HOME
 * door in interiors/Interiors.ts: door leaf and frame, a lit sign board, a blade sign over the sidewalk, and one feature per
 * kind (bar: awning and lit window; after-hours: a roll-down gate shut by day; club: velvet rope and canopy; dispensary: white
 * fascia and an OPEN strip; gym: a big window and a banner). Everything solid is baked into ONE vertex-coloured mesh, the
 * sign planes into a second (one sign material per venue), lit pieces into a third, the gate is its own mesh so it can lift.
 * 3 draw calls per venue (4 for the after-hours), about 150 to 330 triangles. No new material families: the vertex-coloured
 * material is the interiors' own (`parts.basic`), the sign comes from the library.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { IMaterialLibrary } from '../types';
import { basic } from '../interiors/parts';
import { isOpen, venueById, type VenueDoor, type VenueId } from './venues';

const FACE_SHADE = [0.78, 0.78, 1.0, 0.45, 0.88, 0.62];

export class Batch {
  readonly geos: THREE.BufferGeometry[] = [];
  /** `to` places local (along u, up y, out v) into the world; rotation about Y so local +z points out of the door */
  constructor(private readonly m: THREE.Matrix4) {}

  box(w: number, h: number, d: number, color: string, u: number, y: number, v: number, shade = true): void {
    const g = new THREE.BoxGeometry(w, h, d);
    const c = new THREE.Color(color);
    const col = new Float32Array(24 * 3);
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = (f * 4 + k) * 3; const s = shade ? FACE_SHADE[f] : 1; col[i] = c.r * s; col[i + 1] = c.g * s; col[i + 2] = c.b * s; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.translate(u, y, v);
    g.applyMatrix4(this.m);
    this.geos.push(g);
  }

  /** a plane facing local +z (out of the door) or, with `back`, -z; `tiltX` leans it */
  plane(w: number, h: number, u: number, y: number, v: number, back = false, rotY = 0): void {
    const g = new THREE.PlaneGeometry(w, h);
    if (back) g.rotateY(Math.PI);
    if (rotY) g.rotateY(rotY);
    g.translate(u, y, v);
    g.applyMatrix4(this.m);
    this.geos.push(g);
  }

  merged(): THREE.BufferGeometry | null {
    if (!this.geos.length) return null;
    const out = mergeGeometries(this.geos, false);
    this.geos.forEach((g) => g.dispose());
    return out;
  }
}

export interface VenueExterior {
  group: THREE.Group;
  /** call when the hour or the door set changes: lights, gate */
  update(hour: number, hasFlag?: (f: string) => boolean): void;
  /** rough cost for the notes and tests */
  stats(): { draws: number; triangles: number };
}

function litSignMaterial(materials: IMaterialLibrary, text: string, bg: string, fg: string): THREE.MeshStandardMaterial {
  const base = materials.sign(text, bg, fg);
  const m = base.clone() as THREE.MeshStandardMaterial;
  if ('emissive' in m && m.map) { m.emissive = new THREE.Color('#ffffff'); m.emissiveMap = m.map; m.emissiveIntensity = 0.85; }
  m.side = THREE.DoubleSide;
  return m;
}

/** door-local frame matrix: origin at the door, local +z = out of the door, local +x along the wall */
export function doorMatrix(d: VenueDoor): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(d.x, 0.15, d.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(d.outX, d.outZ)), new THREE.Vector3(1, 1, 1));
  return m;
}

export function buildVenueExterior(id: VenueId, door: VenueDoor, materials: IMaterialLibrary): VenueExterior {
  const row = venueById(id);
  const { bg, fg, accent } = row.look;
  const M = doorMatrix(door);
  const solid = new Batch(M), lit = new Batch(M), signs = new Batch(M);
  const group = new THREE.Group(); group.name = `venue-${id}`;

  // every place: a door leaf in a frame, set in the wall line (0.14 m leaf, like the other doors)
  const leaf = row.kind === 'dispensary' ? '#9fd0d8' : row.kind === 'afterhours' ? '#3b3b3f' : row.kind === 'gym' ? '#2b2b2b' : row.kind === 'club' ? '#16101e' : '#4a2c1a';
  solid.box(1.1, 2.1, 0.14, leaf, 0, 1.05, 0.04);
  solid.box(1.4, 2.3, 0.1, row.kind === 'dispensary' ? '#e9efe6' : '#1d1a17', 0, 1.15, 0.0);
  solid.box(0.14, 0.14, 0.03, '#e7d27a', 0.36, 1.1, 0.13);

  switch (row.kind) {
    case 'bar': {
      solid.box(3.0, 0.1, 1.2, accent, 0, 2.55, 0.65); // awning slab
      solid.box(3.0, 0.3, 0.06, accent, 0, 2.38, 1.25); // valance
      lit.box(1.7, 0.9, 0.04, '#ffcf86', -2.0, 1.45, 0.08, false); // warm window
      lit.box(1.7, 0.9, 0.04, '#ffcf86', 2.0, 1.45, 0.08, false);
      solid.box(0.12, 0.12, 1.5, '#1b1b1b', 0, 3.7, 0.75); // blade bracket
      signs.plane(2.8, 0.7, 0, 3.15, 0.1);
      signs.plane(1.6, 0.4, 0.02, 3.45, 1.5, false, Math.PI / 2); signs.plane(1.6, 0.4, -0.02, 3.45, 1.5, false, -Math.PI / 2);
      lit.box(0.7, 0.14, 0.04, accent, 2.0, 2.0, 0.1, false); // a neon tube in the window
      break;
    }
    case 'afterhours': {
      solid.box(2.0, 0.22, 0.2, '#2a2a2d', 0, 2.38, 0.18); // gate housing
      lit.box(0.3, 0.3, 0.3, '#ffe9a0', 0.9, 2.2, 0.35, false); // a bare bulb
      signs.plane(1.5, 0.38, 0, 2.75, 0.1);
      signs.plane(1.3, 0.33, 0.02, 3.2, 1.2, false, Math.PI / 2); signs.plane(1.3, 0.33, -0.02, 3.2, 1.2, false, -Math.PI / 2);
      solid.box(0.1, 0.1, 1.3, '#1b1b1b', 0, 3.45, 0.65);
      solid.box(0.9, 0.5, 0.5, '#5a5a56', 1.9, 0.25, 0.5); // a crate to sit on
      break;
    }
    case 'club': {
      solid.box(3.4, 0.14, 2.3, '#0d0714', 0, 2.8, 1.2); // canopy
      lit.box(3.4, 0.08, 0.06, accent, 0, 2.7, 2.38, false);
      lit.box(3.4, 0.05, 0.05, '#6ff3ff', 0, 2.72, 0.1, false);
      for (const s of [-1, 1]) solid.box(0.07, 1.0, 0.07, '#c9a24a', s * 1.1, 0.5, 2.7); // brass stanchions
      solid.box(2.1, 0.06, 0.06, '#8b0a1e', 0, 0.92, 2.7); // the rope
      solid.box(2.4, 0.01, 2.2, '#5b0f22', 0, 0.02, 1.3); // a red runner
      signs.plane(3.4, 0.85, 0, 3.55, 0.12);
      signs.plane(1.7, 0.43, 0.02, 3.1, 2.2, false, Math.PI / 2); signs.plane(1.7, 0.43, -0.02, 3.1, 2.2, false, -Math.PI / 2);
      solid.box(0.1, 0.1, 2.0, '#1b1b1b', 0, 3.6, 1.15);
      break;
    }
    case 'dispensary': {
      solid.box(3.6, 0.6, 0.14, '#f4f6f1', 0, 2.95, 0.1); // white fascia
      solid.box(3.6, 0.08, 0.2, accent, 0, 2.62, 0.14); // green rule
      solid.box(1.9, 1.5, 0.05, '#7fb8c4', -2.1, 1.3, 0.1); // big pane
      solid.box(1.9, 1.5, 0.05, '#7fb8c4', 2.1, 1.3, 0.1);
      lit.box(0.9, 0.16, 0.05, '#5fff8a', 2.1, 1.9, 0.14, false); // OPEN strip
      signs.plane(2.6, 0.65, 0, 2.95, 0.19);
      signs.plane(1.2, 0.3, 0.02, 3.5, 1.0, false, Math.PI / 2); signs.plane(1.2, 0.3, -0.02, 3.5, 1.0, false, -Math.PI / 2);
      solid.box(0.08, 0.08, 1.0, '#444', 0, 3.7, 0.5);
      break;
    }
    case 'gym': {
      solid.box(3.2, 1.5, 0.05, '#20262b', -2.5, 1.45, 0.08); // dark glass
      lit.box(3.0, 0.1, 0.05, accent, -2.5, 2.3, 0.1, false); // yellow header
      solid.box(4.2, 0.06, 0.1, '#3a3a3a', 0, 2.62, 0.08);
      signs.plane(3.8, 0.95, 0, 3.15, 0.12);
      signs.plane(1.5, 0.38, 0.02, 3.5, 1.6, false, Math.PI / 2); signs.plane(1.5, 0.38, -0.02, 3.5, 1.6, false, -Math.PI / 2);
      solid.box(0.1, 0.1, 1.6, '#1b1b1b', 0, 3.8, 0.8);
      solid.box(1.0, 0.3, 0.6, '#444', 2.4, 0.15, 0.5); // a plate bench by the door
      break;
    }
  }

  const solidMat = basic({ vertexColors: true });
  const litMat = basic({ vertexColors: true });
  const sg = solid.merged(), lg = lit.merged(), ig = signs.merged();
  const meshes: THREE.Mesh[] = [];
  const add = (g: THREE.BufferGeometry | null, mat: THREE.Material, name: string): THREE.Mesh | null => {
    if (!g) return null;
    const mesh = new THREE.Mesh(g, mat); mesh.name = `${group.name}:${name}`; mesh.matrixAutoUpdate = false; group.add(mesh); meshes.push(mesh); return mesh;
  };
  add(sg, solidMat, 'solid');
  const litMesh = add(lg, litMat, 'lit');
  const signMat = litSignMaterial(materials, row.sign, bg, fg);
  add(ig, signMat, 'signs');

  // the gate: corrugated slats over the door, down while the place is shut
  let gate: THREE.Mesh | null = null;
  if (row.kind === 'afterhours') {
    const gb = new Batch(M);
    gb.box(1.9, 2.2, 0.06, '#55555a', 0, 1.1, 0.24);
    for (let i = 0; i < 9; i++) gb.box(1.9, 0.05, 0.08, '#3a3a3e', 0, 0.15 + i * 0.25, 0.24);
    gate = add(gb.merged(), solidMat, 'gate');
  }

  const stats = (): { draws: number; triangles: number } => {
    let tri = 0;
    for (const m of meshes) { const g = m.geometry; tri += (g.index ? g.index.count : g.getAttribute('position').count) / 3; }
    return { draws: meshes.length, triangles: Math.round(tri) };
  };

  return {
    group,
    update(hour, hasFlag) {
      const open = isOpen(id, hour, hasFlag);
      const dusk = hour >= 17.5 || hour < 6.5;
      if (litMesh) litMesh.visible = open || (dusk && row.kind !== 'afterhours' && row.kind !== 'gym');
      if (gate) gate.visible = !open;
      signMat.emissiveIntensity = open ? (dusk ? 1.0 : 0.55) : 0.12;
    },
    stats,
  };
}
