/**
 * Per-tier and per-day visibility of the clutter meshes (`props:clutter-<cat>-r<rank>[-d<group>]`, see clutter.ts).
 * The world is built once with everything in it; this flips `material.visible` of each bucket's own material (not
 * mesh.visible, which the distance culler owns), which survives the per-cell mesh split. A later call restores them.
 *
 *   phone  rank 0: no clutter     low  rank 1     medium / high  rank 2: everything
 *   Trash bags come in three pickup groups; a group is out on two nights of the week, Sunday is clean.
 */
import * as THREE from 'three';

const NAME = /^props:clutter-([a-z]+)-r(\d)(?:-d(\d))?$/;

const RANK: Record<string, number> = { phone: 0, low: 1, medium: 2, high: 2 };

/** Which bag group (0..2) is out on this game day (any integer; 0 = Monday ... 6 = Sunday), or -1 for none. */
export function bagGroupForDay(day: number): number {
  const d = ((Math.floor(day) % 7) + 7) % 7;
  return d === 6 ? -1 : d % 3;
}

/** Returns the number of clutter meshes now hidden. */
export function applyClutterState(root: THREE.Object3D, quality: string, day = 0): number {
  const rank = RANK[quality] ?? 2, group = bagGroupForDay(day);
  let hiddenN = 0;
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const m = NAME.exec(o.name);
    if (!m) return;
    const hide = Number(m[2]) > rank || (m[3] !== undefined && Number(m[3]) !== group);
    const mat = (o as THREE.Mesh).material as THREE.Material;
    mat.visible = !hide;
    if (hide) hiddenN++;
  });
  return hiddenN;
}
