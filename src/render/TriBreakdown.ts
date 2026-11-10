/**
 * Debug: walks the scene the way WebGLRenderer would (visible chain, frustum, instance count, draw range, groups) and
 * sums triangles per category for the scene pass (main camera) and the shadow pass (sun shadow camera, castShadow
 * meshes only). Used by scripts/perf-breakdown.mjs; exposed as window.__gtaTriBreakdown(scene, camera, renderer) so
 * main.ts needs no edit. Counts only, never timings.
 */
import * as THREE from 'three';

export interface TriRow { tris: number; draws: number; meshes: number; }
export interface TriBreakdown {
  scene: Record<string, TriRow>;
  shadow: Record<string, TriRow>;
  sceneTotal: number; shadowTotal: number; sceneDraws: number; shadowDraws: number;
  top: Array<{ pass: string; name: string; cat: string; tris: number; inst: number }>;
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

export function triBreakdown(scene: THREE.Object3D, camera: THREE.Camera, renderer?: THREE.WebGLRenderer): TriBreakdown {
  scene.updateMatrixWorld();
  const fr = new THREE.Frustum(), pm = new THREE.Matrix4();
  camera.updateMatrixWorld();
  fr.setFromProjectionMatrix(pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  let sun: THREE.DirectionalLight | null = null;
  scene.traverse((o) => { if (!sun && (o as THREE.DirectionalLight).isDirectionalLight && (o as THREE.DirectionalLight).castShadow) sun = o as THREE.DirectionalLight; });
  let sfr: THREE.Frustum | null = null;
  const sunL = sun as THREE.DirectionalLight | null;
  if (sunL && (renderer ? renderer.shadowMap.enabled : true)) {
    const sc = sunL.shadow.camera; sc.updateMatrixWorld();
    sfr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(sc.projectionMatrix, sc.matrixWorldInverse));
  }
  const out: TriBreakdown = { scene: {}, shadow: {}, sceneTotal: 0, shadowTotal: 0, sceneDraws: 0, shadowDraws: 0, top: [] };
  const add = (pass: 'scene' | 'shadow', cat: string, tris: number): void => {
    const t = out[pass]; const r = (t[cat] ??= { tris: 0, draws: 0, meshes: 0 });
    r.tris += tris; r.draws++; r.meshes++;
    if (pass === 'scene') { out.sceneTotal += tris; out.sceneDraws++; } else { out.shadowTotal += tris; out.shadowDraws++; }
  };
  const sphere = new THREE.Sphere();
  const inFrustum = (f: THREE.Frustum, m: THREE.Mesh): boolean => {
    if (!m.frustumCulled) return true;
    const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    if (!g.boundingSphere) return true;
    sphere.copy(g.boundingSphere).applyMatrix4(m.matrixWorld);
    return f.intersectsSphere(sphere);
  };
  const walk = (o: THREE.Object3D, path: string): void => {
    if (!o.visible) return;
    const here = path + '/' + (o.name || o.type);
    const m = o as THREE.Mesh;
    if (m.isMesh && !(o as THREE.Sprite).isSprite && m.geometry) {
      const inst = !!(m as THREE.InstancedMesh).isInstancedMesh;
      const cat = categorize(here, inst);
      if (!inst || (m as THREE.InstancedMesh).count > 0) {
        const t = drawTris(m);
        if (t > 0) {
          if (inFrustum(fr, m)) { add('scene', cat, t); out.top.push({ pass: 'scene', name: here.slice(-90), cat, tris: t, inst: inst ? (m as THREE.InstancedMesh).count : 1 }); }
          if (sfr && m.castShadow && inFrustum(sfr, m)) { add('shadow', cat, t); out.top.push({ pass: 'shadow', name: here.slice(-90), cat, tris: t, inst: inst ? (m as THREE.InstancedMesh).count : 1 }); }
        }
      }
    }
    for (const c of o.children) walk(c, here);
  };
  walk(scene, '');
  out.top.sort((a, b) => b.tris - a.tris); out.top = out.top.slice(0, 40);
  return out;
}

if (typeof window !== 'undefined') (window as unknown as { __gtaTriBreakdown: typeof triBreakdown }).__gtaTriBreakdown = triBreakdown;
