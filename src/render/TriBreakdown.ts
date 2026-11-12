/**
 * Debug: hooks every mesh's onBeforeRender / onBeforeShadow, runs one frame through the caller's `render` function and sums the
 * triangles WebGLRenderer really drew per category (visibility, frustum, layers, instance count, draw range and material
 * groups all honoured because three itself decides what is drawn). Used by scripts/perf-breakdown.mjs; exposed as
 * window.__gtaTriBreakdown(scene, render) so main.ts needs no edit. Counts only, never timings.
 */
import * as THREE from 'three';

export interface TriRow { tris: number; draws: number; meshes: number; }
export interface TriBreakdown {
  scene: Record<string, TriRow>;
  shadow: Record<string, TriRow>;
  sceneTotal: number; shadowTotal: number; sceneDraws: number; shadowDraws: number;
  /** the 25 names with the most draw calls (summed over the meshes sharing the path) */
  byDraws?: TriBreakdown['top'];
  top: Array<{ pass: string; name: string; cat: string; tris: number; inst: number; draws: number }>;
}

/** Category of a mesh from its own and its ancestors' names. Order matters. */
export function categorize(path: string, isInstanced: boolean): string {
  const p = path.toLowerCase();
  if (/skyline/.test(p)) return 'skyline';
  if (/car-lod|body-far/.test(p)) return 'cars-far';
  if (/ped|human|people|crowd|garment/.test(p)) return /lod|far|mid/.test(p) ? 'people-far' : 'people-hi';
  if (/blob|caster/.test(p)) return 'blob/casters';
  if (/shadow:/.test(p)) return 'shadow-proxies';
  if (/tree|leaf|foliage|canopy/.test(p)) return 'trees';
  if (/road|ground|asphalt|sidewalk|curb|terrain|lot|water/.test(p)) return 'ground/roads';
  if (/vehicle|car|body|glass|hood|plate|trim|wheel|rim|lamp-head|headlight/.test(p)) return 'cars-near';
  if (/building/.test(p)) return 'buildings';
  if (/prop/.test(p)) return 'props';
  return isInstanced ? 'instanced-other' : 'other';
}

function drawTris(m: THREE.Mesh): number {
  const g = m.geometry;
  const total = g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0);
  let n: number;
  if (Array.isArray(m.material) && g.groups.length) {
    n = 0;
    for (const gr of g.groups) { const a = Math.max(gr.start, g.drawRange.start); const b = Math.min(gr.start + gr.count, g.drawRange.start + g.drawRange.count, total); if (b > a && m.material[gr.materialIndex ?? 0]?.visible !== false) n += b - a; }
  } else {
    const start = g.drawRange.start; n = Math.max(0, Math.min(total - start, g.drawRange.count));
  }
  const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
  return Math.floor(n / 3) * inst;
}

export function triBreakdown(scene: THREE.Object3D, render: () => void): TriBreakdown {
  const out: TriBreakdown = { scene: {}, shadow: {}, sceneTotal: 0, shadowTotal: 0, sceneDraws: 0, shadowDraws: 0, top: [] };
  const per = new Map<string, { pass: string; name: string; cat: string; tris: number; inst: number; draws: number }>();
  const saved: Array<[THREE.Object3D, THREE.Object3D['onBeforeRender'], THREE.Object3D['onBeforeShadow']]> = [];
  const paths = new Map<THREE.Object3D, string>();
  const walk = (o: THREE.Object3D, path: string): void => { const here = path + '/' + (o.name || o.type); paths.set(o, here); for (const c of o.children) walk(c, here); };
  walk(scene, '');
  const add = (pass: 'scene' | 'shadow', m: THREE.Mesh, tris: number): void => {
    const path = paths.get(m) ?? '';
    const inst = !!(m as THREE.InstancedMesh).isInstancedMesh;
    const cat = categorize(path, inst);
    const t = out[pass]; const r = (t[cat] ??= { tris: 0, draws: 0, meshes: 0 });
    r.tris += tris; r.draws++; r.meshes++;
    if (pass === 'scene') { out.sceneTotal += tris; out.sceneDraws++; } else { out.shadowTotal += tris; out.shadowDraws++; }
    const k = pass + path; const e = per.get(k);
    if (e) { e.tris += tris; e.draws++; } else per.set(k, { pass, name: path.slice(-90), cat, tris, inst: inst ? (m as THREE.InstancedMesh).count : 1, draws: 1 });
  };
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    saved.push([o, o.onBeforeRender, o.onBeforeShadow]);
    const prevR = o.onBeforeRender, prevS = o.onBeforeShadow;
    o.onBeforeRender = function (this: THREE.Object3D, ...a: Parameters<THREE.Object3D['onBeforeRender']>) {
      const grp = a[5] as unknown as { start: number; count: number } | null | undefined;
      add('scene', m, grp ? Math.floor(grp.count / 3) * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1) : drawTris(m));
      return prevR.apply(this, a);
    };
    o.onBeforeShadow = function (this: THREE.Object3D, ...a: Parameters<THREE.Object3D['onBeforeShadow']>) {
      const grp = a[6] as unknown as { start: number; count: number } | null | undefined;
      add('shadow', m, grp ? Math.floor(grp.count / 3) * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1) : drawTris(m));
      return prevS.apply(this, a);
    };
  });
  try { render(); } finally { for (const [o, r, s] of saved) { o.onBeforeRender = r; o.onBeforeShadow = s; } }
  out.top = [...per.values()].sort((a, b) => b.tris - a.tris).slice(0, 40);
  out.byDraws = [...per.values()].sort((a, b) => b.draws - a.draws).slice(0, 25);
  return out;
}

if (typeof window !== 'undefined') (window as unknown as { __gtaTriBreakdown: typeof triBreakdown }).__gtaTriBreakdown = triBreakdown;
